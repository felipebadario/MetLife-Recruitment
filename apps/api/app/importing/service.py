"""Pipeline de importação: recebe o arquivo, lê, valida, deduplica e grava com histórico.

Regras (ver docs/pending-validations.md para o que ainda depende do negócio):
- Idempotência por arquivo: o mesmo conteúdo (SHA-256) já importado com sucesso não é
  processado de novo, a não ser por reprocessamento explícito.
- Idempotência por linha: a candidatura é localizada pelo ID da planilha; se nada mudou
  (mesmo hash da linha), não há alteração nem histórico novo.
- Mudança de status gera entrada no histórico de status; mudança de outros campos gera
  registro campo a campo.
- Candidato sem CPF no modelo atual: é identificado pelo nome normalizado. Pendente de
  validação (homônimos seriam unidos).
- Status desconhecido vira um status "não classificado" no catálogo, para o administrador
  classificar. O sistema não interpreta códigos como PAGA ou REPRC por conta própria.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.core.text import clean, normalize_key, slug
from app.importing.template import (
    LOCAL_TZ,
    TEMPLATE_NAME,
    ParsedRow,
    ParsedSheet,
    TemplateError,
    parse_workbook,
)
from app.models import (
    Agency,
    Application,
    ApplicationFieldChange,
    ApplicationStatusHistory,
    Candidate,
    ChangeSource,
    ImportBatch,
    ImportIssue,
    ImportRow,
    ImportSource,
    ImportStatus,
    IssueSeverity,
    ProcessOutcome,
    ProcessStatus,
    RowOutcome,
    StatusMapping,
    User,
    ValueMapping,
)

MAX_FILE_BYTES = 10 * 1024 * 1024

# Campos da candidatura acompanhados no histórico, com o rótulo exibido na interface.
TRACKED_FIELDS: dict[str, str] = {
    "agency_id": "Agência",
    "regional_raw": "Regional",
    "sub_representative_raw": "Sub-representante",
    "susep_active_raw": "SUSEP ativa",
    "susep_number": "Número SUSEP",
    "relationship_program_raw": "Programa de relacionamento",
    "cohort_name": "Turma",
    "exam_date": "Data da prova",
    "registered_at": "Data de cadastro",
}


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def create_batch(
    db: Session,
    *,
    file_name: str,
    content: bytes,
    source: ImportSource = ImportSource.MANUAL,
    user: User | None = None,
    force: bool = False,
    reprocess_of: ImportBatch | None = None,
) -> ImportBatch:
    """Registra o arquivo recebido. Se já foi importado com sucesso, marca como duplicado."""
    digest = sha256(content)
    batch = ImportBatch(
        source=source,
        status=ImportStatus.RECEIVED,
        file_name=file_name[:255],
        file_sha256=digest,
        file_size=len(content),
        file_content=content,
        template_version=TEMPLATE_NAME,
        triggered_by_id=user.id if user else None,
        reprocess_of_id=reprocess_of.id if reprocess_of else None,
        rows_total=0,
        rows_created=0,
        rows_updated=0,
        rows_unchanged=0,
        rows_rejected=0,
    )
    if not force:
        previous = db.scalar(
            select(ImportBatch)
            .where(
                ImportBatch.file_sha256 == digest,
                ImportBatch.status.in_(
                    [ImportStatus.COMPLETED, ImportStatus.COMPLETED_WITH_ERRORS]
                ),
            )
            .order_by(ImportBatch.id.desc())
        )
        if previous is not None:
            batch.status = ImportStatus.SKIPPED_DUPLICATE
            batch.reprocess_of_id = previous.id
            batch.finished_at = utcnow()
            batch.error_message = (
                f"Este arquivo já foi importado no lote #{previous.id}. "
                "Use 'Reprocessar' se quiser processá-lo de novo."
            )
            batch.file_content = None
    db.add(batch)
    db.commit()
    return batch


@dataclass
class _Context:
    db: Session
    batch: ImportBatch
    is_demo: bool
    agencies: dict[str, Agency] = field(default_factory=dict)
    statuses: dict[str, ProcessStatus | None] = field(default_factory=dict)
    value_maps: dict[tuple[str, str], str] = field(default_factory=dict)


def process_batch(db: Session, batch_id: int) -> ImportBatch:
    batch = db.get(ImportBatch, batch_id)
    if batch is None or batch.status != ImportStatus.RECEIVED:
        return batch  # type: ignore[return-value]
    batch.status = ImportStatus.PROCESSING
    batch.started_at = utcnow()
    db.commit()

    try:
        content = batch.file_content or b""
        sheet = parse_workbook(content)
    except TemplateError as exc:
        _fail(db, batch, str(exc), code="template")
        return batch

    try:
        _apply_sheet(db, batch, sheet)
    except Exception as exc:  # erro inesperado: lote falha inteiro, sem gravação parcial
        db.rollback()
        batch = db.get(ImportBatch, batch_id)  # type: ignore[assignment]
        _fail(db, batch, f"Erro inesperado ao processar o arquivo: {type(exc).__name__}.", "unexpected")
        raise
    return batch


def _fail(db: Session, batch: ImportBatch, message: str, code: str) -> None:
    batch.status = ImportStatus.FAILED
    batch.error_message = message
    batch.finished_at = utcnow()
    db.add(ImportIssue(batch_id=batch.id, code=code, message=message, severity=IssueSeverity.ERROR))
    db.commit()


def _apply_sheet(db: Session, batch: ImportBatch, sheet: ParsedSheet) -> None:
    ctx = _Context(db=db, batch=batch, is_demo=batch.source == ImportSource.DEMO)
    for mapping in db.scalars(select(ValueMapping)):
        ctx.value_maps[(mapping.field, mapping.normalized_key)] = mapping.normalized_value

    batch.sheet_title = sheet.title
    batch.cohort_name = sheet.cohort_name
    batch.exam_date = sheet.exam_date
    if sheet.exam_date:
        batch.reference_period = sheet.exam_date.strftime("%Y-%m")

    if not sheet.cohort_name:
        db.add(
            ImportIssue(
                batch_id=batch.id,
                code="no_title",
                message="Título da turma não encontrado acima do cabeçalho.",
                severity=IssueSeverity.WARNING,
            )
        )
    for label in sheet.missing_optional:
        db.add(
            ImportIssue(
                batch_id=batch.id,
                code="missing_column",
                field=label,
                message=f"Coluna '{label}' não encontrada; o campo ficará vazio.",
                severity=IssueSeverity.WARNING,
            )
        )

    counts = {o: 0 for o in RowOutcome}
    for row in sheet.rows:
        for issue in row.issues:
            db.add(
                ImportIssue(
                    batch_id=batch.id,
                    row_number=row.row_number,
                    field=issue.field,
                    code=issue.code,
                    severity=IssueSeverity(issue.severity),
                    message=issue.message,
                    raw_value=issue.raw_value,
                )
            )
        outcome, application = (
            (RowOutcome.REJECTED, None) if row.rejected else _upsert_row(ctx, sheet, row)
        )
        counts[outcome] += 1
        db.add(
            ImportRow(
                batch_id=batch.id,
                row_number=row.row_number,
                raw=row.raw,
                row_hash=_row_hash(sheet, row),
                outcome=outcome,
                application_id=application.id if application else None,
            )
        )

    batch.rows_total = len(sheet.rows)
    batch.rows_created = counts[RowOutcome.CREATED]
    batch.rows_updated = counts[RowOutcome.UPDATED]
    batch.rows_unchanged = counts[RowOutcome.UNCHANGED]
    batch.rows_rejected = counts[RowOutcome.REJECTED]
    batch.status = (
        ImportStatus.COMPLETED_WITH_ERRORS if batch.rows_rejected else ImportStatus.COMPLETED
    )
    batch.finished_at = utcnow()
    db.commit()


def _row_hash(sheet: ParsedSheet, row: ParsedRow) -> str:
    payload = {
        "cohort": sheet.cohort_name,
        "exam": sheet.exam_date.isoformat() if sheet.exam_date else None,
        **{
            k: (v.isoformat() if hasattr(v, "isoformat") else v)
            for k, v in sorted(row.values.items())
        },
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _agency(ctx: _Context, name: str) -> Agency:
    code = slug(name, 32)
    if code in ctx.agencies:
        return ctx.agencies[code]
    agency = ctx.db.scalar(select(Agency).where(Agency.code == code))
    if agency is None:
        agency = Agency(code=code, name=name, is_active=True, is_demo=ctx.is_demo)
        ctx.db.add(agency)
        ctx.db.flush()
    ctx.agencies[code] = agency
    return agency


def get_or_create_status(db: Session, raw: str, cache: dict | None = None) -> ProcessStatus:
    key = normalize_key(raw)
    if cache is not None and key in cache:
        return cache[key]
    mapping = db.scalar(select(StatusMapping).where(StatusMapping.normalized_key == key))
    if mapping is not None:
        status = mapping.status
    else:
        code = slug(raw)
        status = db.scalar(select(ProcessStatus).where(ProcessStatus.code == code))
        if status is None:
            status = ProcessStatus(
                code=code,
                label=clean(raw) or code,
                outcome=ProcessOutcome.UNMAPPED,
                position=0,
                is_active=True,
                is_provisional=True,
                description="Criado automaticamente na importação. Classifique em Administração.",
            )
            db.add(status)
            db.flush()
        db.add(StatusMapping(raw_value=clean(raw) or raw, normalized_key=key, status_id=status.id))
        db.flush()
    if cache is not None:
        cache[key] = status
    return status


def _norm(ctx: _Context, field_name: str, raw: str | None) -> str | None:
    if raw is None:
        return None
    return ctx.value_maps.get((field_name, normalize_key(raw)), clean(raw))


def _candidate_for(ctx: _Context, full_name: str, existing: Application | None) -> Candidate:
    if existing is not None:
        candidate = existing.candidate
        if candidate.full_name != full_name:
            candidate.full_name = full_name
            candidate.name_search = normalize_key(full_name)
        return candidate
    key = normalize_key(full_name)
    candidate = ctx.db.scalar(select(Candidate).where(Candidate.name_search == key))
    if candidate is None:
        candidate = Candidate(
            full_name=full_name,
            name_search=key,
            first_seen_at=utcnow(),
            is_demo=ctx.is_demo,
        )
        ctx.db.add(candidate)
        ctx.db.flush()
    return candidate


def _fmt(value: object) -> str | None:
    if value is None:
        return None
    if hasattr(value, "strftime"):
        return value.strftime("%d/%m/%Y")
    return str(value)


def _upsert_row(
    ctx: _Context, sheet: ParsedSheet, row: ParsedRow
) -> tuple[RowOutcome, Application]:
    db, batch, v = ctx.db, ctx.batch, row.values
    row_hash = _row_hash(sheet, row)

    existing = db.scalar(
        select(Application).where(Application.external_record_id == v["external_record_id"])
    )
    if existing is not None and existing.row_hash == row_hash:
        return RowOutcome.UNCHANGED, existing

    agency = _agency(ctx, str(v["agency"]))
    candidate = _candidate_for(ctx, str(v["full_name"]), existing)
    status = get_or_create_status(db, str(v["status"]), ctx.statuses) if v["status"] else None
    registered = v["site_registered_at"]

    fields: dict[str, object] = {
        "agency_id": agency.id,
        "regional_raw": v["regional"],
        "regional_norm": _norm(ctx, "regional", v["regional"]),
        "sub_representative_raw": v["sub_representative"],
        "sub_representative_norm": _norm(ctx, "sub_representative", v["sub_representative"]),
        "susep_active_raw": v["susep_active"],
        "susep_number": v["susep_number"],
        "relationship_program_raw": v["relationship_program"],
        "cohort_name": sheet.cohort_name,
        "exam_date": sheet.exam_date,
        "site_registered_at": registered,
        "registered_at": registered.astimezone(LOCAL_TZ).date() if registered else None,
        "raw_payload": row.raw,
        "row_hash": row_hash,
        "last_import_batch_id": batch.id,
    }
    now = utcnow()

    if existing is None:
        application = Application(
            candidate_id=candidate.id,
            external_record_id=v["external_record_id"],
            status_raw=v["status"],
            status_id=status.id if status else None,
            status_changed_at=now,
            first_import_batch_id=batch.id,
            is_demo=ctx.is_demo,
            **fields,
        )
        db.add(application)
        db.flush()
        db.add(
            ApplicationStatusHistory(
                application_id=application.id,
                from_status_raw=None,
                to_status_raw=v["status"],
                to_status_id=status.id if status else None,
                changed_at=now,
                source=ChangeSource.DEMO if ctx.is_demo else ChangeSource.IMPORT,
                import_batch_id=batch.id,
                note="Entrada via importação de planilha.",
            )
        )
        return RowOutcome.CREATED, application

    application = existing
    agency_names = {a.id: a.name for a in ctx.agencies.values()}
    for name, label in TRACKED_FIELDS.items():
        old, new = getattr(application, name), fields[name]
        if old != new:
            if name == "agency_id":
                old_label = application.agency.name if application.agency else None
                old, new = old_label, agency_names.get(int(new)) if new else None  # type: ignore[arg-type]
            db.add(
                ApplicationFieldChange(
                    application_id=application.id,
                    import_batch_id=batch.id,
                    field=label,
                    old_value=_fmt(old),
                    new_value=_fmt(new),
                    changed_at=now,
                )
            )
    if application.status_raw != v["status"]:
        db.add(
            ApplicationStatusHistory(
                application_id=application.id,
                from_status_raw=application.status_raw,
                to_status_raw=v["status"],
                from_status_id=application.status_id,
                to_status_id=status.id if status else None,
                changed_at=now,
                source=ChangeSource.DEMO if ctx.is_demo else ChangeSource.IMPORT,
                import_batch_id=batch.id,
            )
        )
        application.status_raw = v["status"]
        application.status_id = status.id if status else None
        application.status_changed_at = now
    for name, value in fields.items():
        setattr(application, name, value)
    application.candidate_id = candidate.id
    return RowOutcome.UPDATED, application
