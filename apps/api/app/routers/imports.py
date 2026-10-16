"""Importação de planilhas: upload, acompanhamento, inconsistências e reprocessamento."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, func, select

from app.auth.deps import DbSession, require_permission
from app.auth.permissions import Permission
from app.db.session import get_sessionmaker
from app.importing.demo import build_cohort_workbook
from app.importing.service import MAX_FILE_BYTES, create_batch, process_batch
from app.models import (
    Agency,
    Application,
    ApplicationFieldChange,
    ApplicationStatusHistory,
    Candidate,
    ImportBatch,
    ImportIssue,
    ImportRow,
    ImportSource,
    ImportStatus,
    InternalNote,
    User,
)
from app.schemas import Page
from app.services.audit import record_audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/imports", tags=["imports"])

ImportManager = Annotated[User, Depends(require_permission(Permission.IMPORTS_MANAGE))]


class BatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: ImportSource
    status: ImportStatus
    file_name: str
    file_size: int | None
    sheet_title: str | None
    cohort_name: str | None
    exam_date: date | None
    received_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    rows_total: int
    rows_created: int
    rows_updated: int
    rows_unchanged: int
    rows_rejected: int
    error_message: str | None
    reprocess_of_id: int | None


class IssueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    row_number: int | None
    field: str | None
    code: str
    severity: str
    message: str
    raw_value: str | None


class BatchDetail(BaseModel):
    batch: BatchOut
    issues: list[IssueOut]
    issues_total: int


def run_import(batch_id: int) -> None:
    """Processa o lote em segundo plano, com sessão própria."""
    with get_sessionmaker()() as db:
        try:
            process_batch(db, batch_id)
        except Exception:  # o lote já foi marcado como falho; registra para diagnóstico
            logger.exception("Falha ao processar lote %s", batch_id)


@router.post("", response_model=BatchOut, status_code=status.HTTP_202_ACCEPTED)
async def upload(
    request: Request,
    background: BackgroundTasks,
    user: ImportManager,
    db: DbSession,
    file: Annotated[UploadFile, File()],
) -> ImportBatch:
    name = file.filename or "planilha.xlsx"
    if not name.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Envie um arquivo Excel no formato .xlsx.",
        )
    content = await file.read(MAX_FILE_BYTES + 1)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Arquivo maior que 10 MB.",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Arquivo vazio.")

    batch = create_batch(db, file_name=name, content=content, user=user)
    record_audit(
        db,
        action="imports.uploaded",
        request=request,
        actor=user,
        entity_type="import_batch",
        entity_id=batch.id,
        details={"file_name": name, "size": len(content), "status": batch.status.value},
    )
    if batch.status == ImportStatus.RECEIVED:
        background.add_task(run_import, batch.id)
    return batch


@router.get("", response_model=Page[BatchOut])
def list_batches(
    _: ImportManager,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> Page[BatchOut]:
    total = db.scalar(select(func.count()).select_from(ImportBatch)) or 0
    rows = db.scalars(
        select(ImportBatch).order_by(ImportBatch.id.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return Page[BatchOut](
        items=[BatchOut.model_validate(b) for b in rows], total=total, page=page, page_size=page_size
    )


@router.get("/sample")
def sample_spreadsheet(_: ImportManager) -> Response:
    """Planilha FICTÍCIA no mesmo modelo das turmas, para testar a importação."""
    content = build_cohort_workbook(
        "DEMO T99", date.today() + timedelta(days=20), first_id=900000, size=60, seed=99
    )
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="planilha_ficticia_DEMO_T99.xlsx"'},
    )


class ResetIn(BaseModel):
    confirmation: str


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_candidate_data(payload: ResetIn, request: Request, user: ImportManager, db: DbSession) -> None:
    """Apaga candidatos, candidaturas e importações. Mantém usuários, auditoria e a
    classificação de status, etapas do funil e fórmulas dos indicadores."""
    if payload.confirmation.strip().upper() != "APAGAR":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Digite APAGAR para confirmar.",
        )
    counts = {
        "applications": db.scalar(select(func.count()).select_from(Application)) or 0,
        "import_batches": db.scalar(select(func.count()).select_from(ImportBatch)) or 0,
    }
    for model in (
        ApplicationFieldChange,
        ApplicationStatusHistory,
        InternalNote,
        ImportRow,
        ImportIssue,
        Application,
        Candidate,
        ImportBatch,
        Agency,
    ):
        db.execute(delete(model))
    db.flush()
    record_audit(
        db, action="imports.data_reset", request=request, actor=user, details=counts,
    )


@router.get("/{batch_id}", response_model=BatchDetail)
def batch_detail(batch_id: int, _: ImportManager, db: DbSession) -> BatchDetail:
    batch = db.get(ImportBatch, batch_id)
    if batch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Importação não encontrada.")
    issues = db.scalars(
        select(ImportIssue)
        .where(ImportIssue.batch_id == batch_id)
        .order_by(ImportIssue.severity, ImportIssue.row_number.nulls_first(), ImportIssue.id)
        .limit(500)
    )
    total = db.scalar(select(func.count()).where(ImportIssue.batch_id == batch_id)) or 0
    return BatchDetail(
        batch=BatchOut.model_validate(batch),
        issues=[IssueOut.model_validate(i) for i in issues],
        issues_total=total,
    )


@router.post("/{batch_id}/reprocess", response_model=BatchOut, status_code=status.HTTP_202_ACCEPTED)
def reprocess(
    batch_id: int, request: Request, background: BackgroundTasks, user: ImportManager, db: DbSession
) -> ImportBatch:
    original = db.get(ImportBatch, batch_id)
    if original is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Importação não encontrada.")
    source = original
    if not original.file_content and original.reprocess_of_id:
        source = db.get(ImportBatch, original.reprocess_of_id) or original
    if not source.file_content:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O arquivo original deste lote não está guardado. Envie a planilha novamente.",
        )
    batch = create_batch(
        db, file_name=source.file_name, content=source.file_content, user=user, force=True,
        reprocess_of=original,
    )
    record_audit(
        db,
        action="imports.reprocessed",
        request=request,
        actor=user,
        entity_type="import_batch",
        entity_id=batch.id,
        details={"reprocess_of": original.id},
    )
    background.add_task(run_import, batch.id)
    return batch
