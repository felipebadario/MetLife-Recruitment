"""Padrão de colunas em vigor: o que o administrador gravou, completado pelo padrão inicial."""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.text import clean
from app.importing.template import FIELDS, FIELDS_BY_KEY, Column, header_key
from app.models import ImportColumn


def load_columns(db: Session) -> list[Column]:
    saved = {row.field: row for row in db.scalars(select(ImportColumn))}
    columns = []
    for spec in FIELDS:
        row = saved.get(spec.key)
        if row is None or spec.locked and not row.headers:
            columns.append(Column(spec.key, spec.headers, spec.required, spec.active))
        else:
            columns.append(
                Column(
                    spec.key,
                    tuple(row.headers),
                    True if spec.locked else row.is_required,
                    True if spec.locked else row.is_active,
                )
            )
    return columns


def signature(columns: list[Column]) -> str:
    """Identifica o padrão usado num lote (vai em import_batches.template_version)."""
    payload = [[c.key, list(c.headers), c.required, c.active] for c in columns if c.active]
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return f"padrao-{digest[:12]}"


def check_columns(columns: list[Column]) -> list[Column]:
    """Valida e limpa o padrão enviado pelo administrador. Erro → ValueError com a mensagem."""
    by_key = {c.key: c for c in columns}
    unknown = sorted(set(by_key) - set(FIELDS_BY_KEY))
    if unknown:
        raise ValueError(f"Campo desconhecido: {', '.join(unknown)}.")

    result: list[Column] = []
    used: dict[str, str] = {}
    for spec in FIELDS:
        column = by_key.get(spec.key) or Column(spec.key, spec.headers, spec.required, spec.active)
        headers: list[str] = []
        for name in column.headers:
            text = clean(name)
            if text and header_key(text) and header_key(text) not in {header_key(h) for h in headers}:
                headers.append(text[:120])
        active = True if spec.locked else column.active
        required = True if spec.locked else column.required and active
        if active and not headers:
            raise ValueError(f"Informe o nome da coluna de “{spec.name}”.")
        if active:
            for name in headers:
                key = header_key(name)
                if key in used:
                    raise ValueError(
                        f"A coluna “{name}” está em “{used[key]}” e em “{spec.name}”. "
                        "Cada nome de coluna só pode ser usado por um campo."
                    )
                used[key] = spec.name
        result.append(Column(spec.key, tuple(headers), required, active))
    return result
