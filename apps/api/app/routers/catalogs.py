"""Catálogos: classificação de status e fórmulas dos indicadores."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.auth.deps import DbSession, require_permission
from app.auth.permissions import Permission
from app.importing.vgcf import VGCF_STATUSES
from app.models import (
    Application,
    MetricDefinition,
    ProcessOutcome,
    ProcessStatus,
    StatusMapping,
    User,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/api/admin", tags=["catalogs"])

OFFICIAL_CODES = {item.code for item in VGCF_STATUSES}

CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOGS_MANAGE))]


# ---------------------------------------------------------------- status
class StatusOut(BaseModel):
    id: int
    code: str
    label: str
    abbreviation: str | None
    is_official: bool
    outcome: ProcessOutcome
    is_provisional: bool
    raw_values: list[str]
    applications: int


class StatusUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    abbreviation: str | None = Field(default=None, max_length=32)  # texto vazio apaga
    outcome: ProcessOutcome | None = None


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
        item.outcome = payload.outcome
        changes["outcome"] = payload.outcome.value
    item.is_provisional = item.outcome == ProcessOutcome.UNMAPPED
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
    numerator_outcomes: list[ProcessOutcome]
    denominator_outcomes: list[ProcessOutcome]
    min_sample_size: int
    is_validated: bool


class MetricUpdate(BaseModel):
    numerator_outcomes: list[ProcessOutcome] | None = None
    denominator_outcomes: list[ProcessOutcome] | None = None
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
    for key, value in changes.items():
        setattr(metric, key, value)
    db.flush()
    record_audit(db, action="catalog.metric_updated", request=request, actor=user,
                 entity_type="metric_definition", entity_id=metric.id, details={"code": code, **changes})
    return _metric_out(metric)
