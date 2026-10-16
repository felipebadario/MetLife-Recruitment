"""Catálogos: classificações, classificação de status e fórmulas dos indicadores."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.auth.deps import CurrentUser, DbSession, require_permission
from app.auth.permissions import Permission
from app.core.text import normalize_key
from app.importing.vgcf import VGCF_STATUSES
from app.models import (
    UNMAPPED_OUTCOME,
    Application,
    MetricDefinition,
    OutcomeCategory,
    ProcessStatus,
    StatusMapping,
    User,
)
from app.services.audit import record_audit
from app.services.outcomes import list_categories, outcome_codes

router = APIRouter(prefix="/api/admin", tags=["catalogs"])
# Leitura das classificações (nomes e cores) para qualquer usuário logado: toda tela usa.
public_router = APIRouter(prefix="/api/catalogs", tags=["catalogs"])

OFFICIAL_CODES = {item.code for item in VGCF_STATUSES}
HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"

CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOGS_MANAGE))]


def _unknown_outcomes(db, codes: list[str]) -> None:
    unknown = sorted(set(codes) - set(outcome_codes(db)))
    if unknown:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Classificação não encontrada: {', '.join(unknown)}.",
        )


# ---------------------------------------------------------------- classificações
class OutcomeOut(BaseModel):
    code: str
    label: str
    color: str
    is_system: bool


class OutcomeAdminOut(OutcomeOut):
    statuses: int


class OutcomeCreate(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    color: str = Field(pattern=HEX_COLOR)


class OutcomeUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = Field(default=None, pattern=HEX_COLOR)


@public_router.get("/outcomes", response_model=list[OutcomeOut])
def public_outcomes(_: CurrentUser, db: DbSession) -> list[OutcomeOut]:
    return [OutcomeOut(code=c.code, label=c.label, color=c.color, is_system=c.is_system) for c in list_categories(db)]


def _outcomes_admin(db) -> list[OutcomeAdminOut]:
    counts = dict(db.execute(select(ProcessStatus.outcome, func.count()).group_by(ProcessStatus.outcome)).all())
    return [
        OutcomeAdminOut(
            code=c.code, label=c.label, color=c.color, is_system=c.is_system, statuses=counts.get(c.code, 0)
        )
        for c in list_categories(db)
    ]


@router.get("/outcomes", response_model=list[OutcomeAdminOut])
def list_outcomes(_: CatalogManager, db: DbSession) -> list[OutcomeAdminOut]:
    return _outcomes_admin(db)


def _get_outcome(db, code: str) -> OutcomeCategory:
    item = db.scalar(select(OutcomeCategory).where(OutcomeCategory.code == code))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classificação não encontrada.")
    return item


def _check_label(db, label: str, current: OutcomeCategory | None = None) -> str:
    label = " ".join(label.split())
    if not label:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o nome.")
    key = normalize_key(label)
    for other in list_categories(db):
        if other is not current and normalize_key(other.label) == key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=f"Já existe a classificação “{other.label}”."
            )
    return label


def _new_code(db, label: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", normalize_key(label)).strip("_")[:24] or "classificacao"
    taken = set(outcome_codes(db))
    code, n = base, 2
    while code in taken:
        code, n = f"{base}_{n}", n + 1
    return code


def _outcome_out(db, code: str) -> OutcomeAdminOut:
    return next(o for o in _outcomes_admin(db) if o.code == code)


@router.post("/outcomes", response_model=OutcomeAdminOut, status_code=status.HTTP_201_CREATED)
def create_outcome(payload: OutcomeCreate, request: Request, user: CatalogManager, db: DbSession) -> OutcomeAdminOut:
    label = _check_label(db, payload.label)
    position = db.scalar(select(func.max(OutcomeCategory.position))) or 0
    item = OutcomeCategory(
        code=_new_code(db, label), label=label, color=payload.color.upper(), position=position + 1, is_system=False
    )
    db.add(item)
    db.flush()
    record_audit(
        db, action="catalog.outcome_created", request=request, actor=user, entity_type="outcome_category",
        entity_id=item.id, details={"code": item.code, "label": item.label, "color": item.color},
    )
    return _outcome_out(db, item.code)


@router.patch("/outcomes/{code}", response_model=OutcomeAdminOut)
def update_outcome(
    code: str, payload: OutcomeUpdate, request: Request, user: CatalogManager, db: DbSession
) -> OutcomeAdminOut:
    item = _get_outcome(db, code)
    changes: dict[str, object] = {}
    if payload.label is not None:
        label = _check_label(db, payload.label, item)
        if label != item.label:
            item.label = changes["label"] = label
    if payload.color is not None and payload.color.upper() != item.color:
        item.color = changes["color"] = payload.color.upper()
    db.flush()
    if changes:
        record_audit(
            db, action="catalog.outcome_updated", request=request, actor=user, entity_type="outcome_category",
            entity_id=item.id, details={"code": code, **changes},
        )
    else:
        db.commit()
    return _outcome_out(db, code)


@router.delete("/outcomes/{code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_outcome(code: str, request: Request, user: CatalogManager, db: DbSession) -> None:
    """Exclui a classificação. Os status dela voltam a "não classificado" e ela sai das fórmulas."""
    item = _get_outcome(db, code)
    if item.is_system:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="“Não classificado” é do sistema e não pode ser excluída."
        )
    metrics = list(db.scalars(select(MetricDefinition)))
    blocked = [m.label for m in metrics if m.denominator_outcomes and set(m.denominator_outcomes) <= {code}]
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A classificação é a única base de cálculo de: {', '.join(blocked)}. "
                "Ajuste a fórmula antes de excluir."
            ),
        )
    statuses = list(db.scalars(select(ProcessStatus).where(ProcessStatus.outcome == code)))
    for s in statuses:
        s.outcome = UNMAPPED_OUTCOME
        s.is_provisional = True
    changed_metrics = []
    for m in metrics:
        if code in m.numerator_outcomes or code in m.denominator_outcomes:
            # Listas novas: o SQLAlchemy não percebe alteração dentro do JSON.
            m.numerator_outcomes = [o for o in m.numerator_outcomes if o != code]
            m.denominator_outcomes = [o for o in m.denominator_outcomes if o != code]
            changed_metrics.append(m.code)
    db.delete(item)
    db.flush()
    record_audit(
        db, action="catalog.outcome_deleted", request=request, actor=user, entity_type="outcome_category",
        entity_id=item.id,
        details={
            "code": code, "label": item.label,
            "statuses_unclassified": [s.code for s in statuses], "metrics_changed": changed_metrics,
        },
    )


# ---------------------------------------------------------------- status
class StatusOut(BaseModel):
    id: int
    code: str
    label: str
    abbreviation: str | None
    is_official: bool
    outcome: str
    is_provisional: bool
    raw_values: list[str]
    applications: int


class StatusUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    abbreviation: str | None = Field(default=None, max_length=32)  # texto vazio apaga
    outcome: str | None = Field(default=None, max_length=32)


@router.get("/statuses", response_model=list[StatusOut])
def list_statuses(_: CatalogManager, db: DbSession) -> list[StatusOut]:
    counts = dict(
        db.execute(select(Application.status_id, func.count()).group_by(Application.status_id)).all()
    )
    raw: dict[int, list[str]] = {}
    for mapping in db.scalars(select(StatusMapping).order_by(StatusMapping.raw_value)):
        raw.setdefault(mapping.status_id, []).append(mapping.raw_value)
    statuses = db.scalars(select(ProcessStatus).order_by(ProcessStatus.position, ProcessStatus.label))
    return [
        StatusOut(
            id=s.id,
            code=s.code,
            label=s.label,
            abbreviation=s.abbreviation,
            is_official=s.code in OFFICIAL_CODES,
            outcome=s.outcome,
            is_provisional=s.is_provisional,
            raw_values=raw.get(s.id, []),
            applications=counts.get(s.id, 0),
        )
        for s in statuses
    ]


@router.patch("/statuses/{status_id}", response_model=StatusOut)
def update_status(
    status_id: int, payload: StatusUpdate, request: Request, user: CatalogManager, db: DbSession
) -> StatusOut:
    item = db.get(ProcessStatus, status_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Status não encontrado.")
    changes: dict[str, object] = {}
    if payload.label is not None and payload.label.strip() != item.label:
        item.label = payload.label.strip()
        changes["label"] = item.label
    if payload.abbreviation is not None:
        abbreviation = payload.abbreviation.strip() or None
        if abbreviation != item.abbreviation:
            item.abbreviation = abbreviation
            changes["abbreviation"] = abbreviation
    if payload.outcome is not None and payload.outcome != item.outcome:
        _unknown_outcomes(db, [payload.outcome])
        item.outcome = changes["outcome"] = payload.outcome
    item.is_provisional = item.outcome == UNMAPPED_OUTCOME
    db.flush()
    if changes:
        record_audit(
            db, action="catalog.status_updated", request=request, actor=user,
            entity_type="process_status", entity_id=item.id, details={"code": item.code, **changes},
        )
    else:
        db.commit()
    return next(s for s in list_statuses(user, db) if s.id == item.id)


# ---------------------------------------------------------------- indicadores
class MetricOut(BaseModel):
    code: str
    label: str
    description: str | None
    numerator_outcomes: list[str]
    denominator_outcomes: list[str]
    min_sample_size: int
    is_validated: bool


class MetricUpdate(BaseModel):
    numerator_outcomes: list[str] | None = None
    denominator_outcomes: list[str] | None = None
    min_sample_size: int | None = Field(default=None, ge=1, le=10_000)
    is_validated: bool | None = None


def _metric_out(m: MetricDefinition) -> MetricOut:
    return MetricOut(
        code=m.code, label=m.label, description=m.description,
        numerator_outcomes=m.numerator_outcomes, denominator_outcomes=m.denominator_outcomes,
        min_sample_size=m.min_sample_size, is_validated=m.is_validated,
    )


@router.get("/metrics", response_model=list[MetricOut])
def list_metrics(_: CatalogManager, db: DbSession) -> list[MetricOut]:
    return [_metric_out(m) for m in db.scalars(select(MetricDefinition).order_by(MetricDefinition.id))]


@router.patch("/metrics/{code}", response_model=MetricOut)
def update_metric(
    code: str, payload: MetricUpdate, request: Request, user: CatalogManager, db: DbSession
) -> MetricOut:
    metric = db.scalar(select(MetricDefinition).where(MetricDefinition.code == code))
    if metric is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Indicador não encontrado.")
    changes = payload.model_dump(exclude_none=True, mode="json")
    if "denominator_outcomes" in changes and not changes["denominator_outcomes"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O denominador precisa de pelo menos uma categoria.",
        )
    _unknown_outcomes(db, [*changes.get("numerator_outcomes", []), *changes.get("denominator_outcomes", [])])
    for key, value in changes.items():
        setattr(metric, key, value)
    db.flush()
    record_audit(db, action="catalog.metric_updated", request=request, actor=user,
                 entity_type="metric_definition", entity_id=metric.id, details={"code": code, **changes})
    return _metric_out(metric)
