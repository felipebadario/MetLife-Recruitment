"""Padrão de colunas em vigor: o que o administrador gravou, completado pelo padrão inicial."""

from __future__ import annotations

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.text import clean, normalize_key, slug
from app.importing.template import (
    CUSTOM_PREFIX,
    FIELDS,
    FIELDS_BY_KEY,
    MAX_CUSTOM_FIELDS,
    Column,
    header_key,
    is_custom,
)
from app.models import ImportColumn

NAME_MAX = 80


def load_columns(db: Session) -> list[Column]:
    rows = list(db.scalars(select(ImportColumn).order_by(ImportColumn.id)))
    saved = {row.field: row for row in rows}
    columns = []
    for spec in FIELDS:
        row = saved.get(spec.key)
        if row is None:
            columns.append(Column(spec.key, spec.headers, spec.required, spec.active, spec.name))
            continue
        name = row.label or spec.name
        if spec.locked and not row.headers:
            columns.append(Column(spec.key, spec.headers, spec.required, spec.active, name))
        else:
            columns.append(
                Column(
                    spec.key,
                    tuple(row.headers),
                    True if spec.locked else row.is_required,
                    True if spec.locked else row.is_active,
                    name,
                )
            )
    for row in rows:
        if is_custom(row.field):
            columns.append(
                Column(row.field, tuple(row.headers), row.is_required, row.is_active, row.label or row.field)
            )
    return columns


def signature(columns: list[Column]) -> str:
    """Identifica o padrão usado num lote (vai em import_batches.template_version)."""
    payload = [[c.key, list(c.headers), c.required, c.active] for c in columns if c.active]
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    return f"padrao-{digest[:12]}"


def _new_key(name: str, taken: set[str]) -> str:
    base = CUSTOM_PREFIX + slug(name, 40 - len(CUSTOM_PREFIX) - 3).lower().replace("-", "_")
    key, n = base, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1
    return key


def check_columns(columns: list[Column], existing: set[str] | None = None) -> list[Column]:
    """Valida e limpa o padrão enviado pelo administrador. Erro → ValueError com a mensagem.

    Campos do sistema que não vierem seguem o padrão inicial; campos criados que não vierem
    são retirados. Campo criado sem chave (ou com chave que ainda não existe) ganha uma chave
    nova a partir do nome. `existing` traz as chaves de campos criados já gravadas.
    """
    existing = existing or set()
    builtin = {c.key: c for c in columns if c.key in FIELDS_BY_KEY}
    custom = [c for c in columns if c.key not in FIELDS_BY_KEY]
    unknown = sorted(c.key for c in custom if c.key and not is_custom(c.key))
    if unknown:
        raise ValueError(f"Campo desconhecido: {', '.join(unknown)}.")
    if len(custom) > MAX_CUSTOM_FIELDS:
        raise ValueError(f"São permitidos até {MAX_CUSTOM_FIELDS} campos novos.")

    taken = set(FIELDS_BY_KEY)
    pending: list[tuple[Column, bool, bool]] = []  # (coluna, travada, criada)
    for spec in FIELDS:
        column = builtin.get(spec.key) or Column(spec.key, spec.headers, spec.required, spec.active, spec.name)
        pending.append((column, spec.locked, False))
    for column in custom:
        key = column.key if column.key in existing and column.key not in taken else ""
        if not key:
            key = _new_key(clean(column.name) or "campo", taken | existing)
        taken.add(key)
        pending.append((Column(key, column.headers, column.required, column.active, column.name), False, True))

    result: list[Column] = []
    used: dict[str, str] = {}
    names: dict[str, str] = {}
    for column, locked, created in pending:
        spec = FIELDS_BY_KEY.get(column.key)
        name = (clean(column.name) or (spec.name if spec else ""))[:NAME_MAX]
        if not name:
            raise ValueError("Informe o nome do campo no sistema.")
        if normalize_key(name) in names:
            raise ValueError(f"Já existe um campo chamado “{names[normalize_key(name)]}”. Use outro nome.")
        names[normalize_key(name)] = name

        headers: list[str] = []
        for header in column.headers:
            text = clean(header)
            if text and header_key(text) and header_key(text) not in {header_key(h) for h in headers}:
                headers.append(text[:120])
        if created and not headers:  # campo novo sem coluna informada: a coluna tem o nome do campo
            headers.append(name)
        active = True if locked else column.active
        required = True if locked else column.required and active
        if active and not headers:
            raise ValueError(f"Informe o nome da coluna de “{name}”.")
        if active:
            for header in headers:
                key = header_key(header)
                if key in used:
                    raise ValueError(
                        f"A coluna “{header}” está em “{used[key]}” e em “{name}”. "
                        "Cada nome de coluna só pode ser usado por um campo."
                    )
                used[key] = name
        result.append(Column(column.key, tuple(headers), required, active, name))
    return result
