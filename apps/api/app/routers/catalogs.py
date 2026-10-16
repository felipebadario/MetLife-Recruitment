"""Catálogos: classificação de status, etapas do funil e fórmulas dos indicadores."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update

from app.auth.deps import DbSession, require_permission
from app.auth.permissions import Permission
from app.models import (
    Application,
    FunnelStage,
    MetricDefinition,
    ProcessOutcome,
    ProcessStatus,
    StatusMapping,
    User,
)
from app.services.audit import record_audit

router = APIRouter(prefix="/api/admin", tags=["catalogs"])

CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOGS_MANAGE))]


# ---------------------------------------------------------------- status
class StatusOut(BaseModel):
    id: int
    code: str
    label: str
    outcome: ProcessOutcome
    funnel_stage_id: int | None
    is_provisional: bool
    raw_values: list[str]
    applications: int


class StatusUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    outcome: ProcessOutcome | None = None
    funnel_stage_id: int | None = None
    clear_funnel_stage: bool = False


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
            outcome=s.outcome,
            funnel_stage_id=s.funnel_stage_id,
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
    if payload.outcome is not None and payload.outcome != item.outcome:
        item.outcome = payload.outcome
        changes["outcome"] = payload.outcome.value
    if payload.clear_funnel_stage and item.funnel_stage_id is not None:
        item.funnel_stage_id = None
        changes["funnel_stage_id"] = None
    elif payload.funnel_stage_id is not None and payload.funnel_stage_id != item.funnel_stage_id:
        if db.get(FunnelStage, payload.funnel_stage_id) is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Etapa inválida.")
        item.funnel_stage_id = payload.funnel_stage_id
        changes["funnel_stage_id"] = payload.funnel_stage_id
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


# ---------------------------------------------------------------- etapas do funil
class StageOut(BaseModel):
    id: int
    code: str
    label: str
    position: int
    is_active: bool
    is_provisional: bool


class StageIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)


class StageUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    position: int | None = Field(default=None, ge=0, le=1000)
    is_active: bool | None = None


def _stage_out(s: FunnelStage) -> StageOut:
    return StageOut(
        id=s.id, code=s.code, label=s.label, position=s.position,
        is_active=s.is_active, is_provisional=s.is_provisional,
    )


@router.get("/funnel-stages", response_model=list[StageOut])
def list_stages(_: CatalogManager, db: DbSession) -> list[StageOut]:
    return [_stage_out(s) for s in db.scalars(select(FunnelStage).order_by(FunnelStage.position, FunnelStage.id))]


@router.post("/funnel-stages", response_model=StageOut, status_code=status.HTTP_201_CREATED)
def create_stage(payload: StageIn, request: Request, user: CatalogManager, db: DbSession) -> StageOut:
    from app.core.text import slug

    base = slug(payload.label)
    code, n = base, 2
    while db.scalar(select(FunnelStage).where(FunnelStage.code == code)):
        code, n = f"{base}-{n}", n + 1
    last = db.scalar(select(func.max(FunnelStage.position))) or 0
    stage = FunnelStage(
        code=code, label=payload.label.strip(), position=last + 10, is_active=True, is_provisional=False
    )
    db.add(stage)
    db.flush()
    record_audit(db, action="catalog.stage_created", request=request, actor=user,
                 entity_type="funnel_stage", entity_id=stage.id, details={"label": stage.label})
    return _stage_out(stage)


@router.patch("/funnel-stages/{stage_id}", response_model=StageOut)
def update_stage(
    stage_id: int, payload: StageUpdate, request: Request, user: CatalogManager, db: DbSession
) -> StageOut:
    stage = db.get(FunnelStage, stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etapa não encontrada.")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in changes.items():
        setattr(stage, key, value.strip() if isinstance(value, str) else value)
    stage.is_provisional = False
    db.flush()
    record_audit(db, action="catalog.stage_updated", request=request, actor=user,
                 entity_type="funnel_stage", entity_id=stage.id, details=changes)
    return _stage_out(stage)


@router.delete("/funnel-stages/{stage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stage(stage_id: int, request: Request, user: CatalogManager, db: DbSession) -> None:
    stage = db.get(FunnelStage, stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etapa não encontrada.")
    db.execute(
        update(ProcessStatus).where(ProcessStatus.funnel_stage_id == stage_id).values(funnel_stage_id=None)
    )
    label = stage.label
    db.delete(stage)
    db.flush()
    record_audit(db, action="catalog.stage_deleted", request=request, actor=user,
                 entity_type="funnel_stage", entity_id=stage_id, details={"label": label})


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
