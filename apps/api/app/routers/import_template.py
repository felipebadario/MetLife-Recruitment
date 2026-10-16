"""Padrão da planilha: quais colunas a importação lê, com que nomes e quais são obrigatórias."""

from __future__ import annotations

import io
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.auth.deps import DbSession, require_permission
from app.auth.permissions import Permission
from app.importing.columns import check_columns, load_columns
from app.importing.template import FIELDS, FIELDS_BY_KEY, Column
from app.models import ImportColumn, User
from app.services.audit import record_audit

router = APIRouter(prefix="/api/admin/import-template", tags=["catalogs"])

CatalogManager = Annotated[User, Depends(require_permission(Permission.CATALOGS_MANAGE))]


class ColumnOut(BaseModel):
    field: str
    name: str
    description: str
    kind: str
    headers: list[str]
    required: bool
    active: bool
    locked: bool
    default_headers: list[str]
    default_required: bool
    default_active: bool


class TemplateOut(BaseModel):
    columns: list[ColumnOut]
    is_default: bool


class ColumnIn(BaseModel):
    field: str = Field(max_length=40)
    headers: list[Annotated[str, Field(max_length=120)]] = Field(max_length=10)
    required: bool = False
    active: bool = True


class TemplateIn(BaseModel):
    columns: list[ColumnIn] = Field(max_length=len(FIELDS))


def _template(db) -> TemplateOut:
    columns = load_columns(db)
    out = []
    for column in columns:
        spec = column.spec
        out.append(
            ColumnOut(
                field=spec.key, name=spec.name, description=spec.description, kind=spec.kind,
                headers=list(column.headers), required=column.required, active=column.active,
                locked=spec.locked, default_headers=list(spec.headers), default_required=spec.required,
                default_active=spec.active,
            )
        )
    is_default = all(
        (list(c.headers), c.required, c.active) == (list(c.spec.headers), c.spec.required, c.spec.active)
        for c in columns
    )
    return TemplateOut(columns=out, is_default=is_default)


def _snapshot(columns: list[Column]) -> dict[str, dict]:
    return {c.key: {"headers": list(c.headers), "required": c.required, "active": c.active} for c in columns}


@router.get("", response_model=TemplateOut)
def get_template(_: CatalogManager, db: DbSession) -> TemplateOut:
    return _template(db)


@router.put("", response_model=TemplateOut)
def save_template(payload: TemplateIn, request: Request, user: CatalogManager, db: DbSession) -> TemplateOut:
    before = _snapshot(load_columns(db))
    try:
        columns = check_columns(
            [Column(c.field, tuple(c.headers), c.required, c.active) for c in payload.columns]
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    saved = {row.field: row for row in db.scalars(select(ImportColumn))}
    for column in columns:
        row = saved.get(column.key) or ImportColumn(field=column.key)
        row.headers = list(column.headers)
        row.is_required = column.required
        row.is_active = column.active
        db.add(row)
    db.flush()

    after = _snapshot(load_columns(db))
    changes = {
        FIELDS_BY_KEY[key].name: {"antes": before[key], "depois": value}
        for key, value in after.items()
        if before[key] != value
    }
    if changes:
        record_audit(
            db, action="catalog.import_template_updated", request=request, actor=user,
            entity_type="import_template", details={"changes": changes},
        )
    else:
        db.commit()
    return _template(db)


@router.delete("", response_model=TemplateOut)
def reset_template(request: Request, user: CatalogManager, db: DbSession) -> TemplateOut:
    """Volta ao padrão inicial (planilha "Base_selecao")."""
    db.execute(delete(ImportColumn))
    db.flush()
    record_audit(
        db, action="catalog.import_template_reset", request=request, actor=user, entity_type="import_template",
    )
    return _template(db)


@router.get("/sample")
def template_sample(_: CatalogManager, db: DbSession) -> Response:
    """Planilha vazia só com o cabeçalho do padrão em vigor."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Modelo"
    ws.append([c.label for c in load_columns(db) if c.active])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0061A0")
        ws.column_dimensions[cell.column_letter].width = max(12, len(str(cell.value)) + 4)
    buffer = io.BytesIO()
    wb.save(buffer)
    return Response(
        buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="modelo_planilha_turma.xlsx"'},
    )
