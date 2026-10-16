"""Padrão da planilha: nome do campo editável e campos criados pelo administrador.

- `import_columns.label`: nome do campo no sistema (vazio segue o padrão inicial).
- `applications.custom_fields`: valores dos campos criados em Administração > Padrão da
  planilha, como vieram da planilha.
- Status VGCF que chegaram pelas planilhas deixam de ser descritos como "fora da lista".

Revision ID: 0007_campos_criados
Revises: 0006_padrao_planilha
Create Date: 2026-10-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_campos_criados"
down_revision = "0006_padrao_planilha"
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
OLD_DESCRIPTION = "Fora da lista oficial VGCF. Criado automaticamente na importação."
NEW_DESCRIPTION = "Status VGCF recebido na planilha. Criado automaticamente na importação."


def _describe(old: str, new: str) -> None:
    statuses = sa.table("process_statuses", sa.column("description", sa.Text))
    op.execute(statuses.update().where(statuses.c.description == old).values(description=new))


def upgrade() -> None:
    with op.batch_alter_table("import_columns") as batch:
        batch.add_column(sa.Column("label", sa.String(80), nullable=True))
    with op.batch_alter_table("applications") as batch:
        batch.add_column(sa.Column("custom_fields", JSON, nullable=True))
    _describe(OLD_DESCRIPTION, NEW_DESCRIPTION)


def downgrade() -> None:
    _describe(NEW_DESCRIPTION, OLD_DESCRIPTION)
    with op.batch_alter_table("applications") as batch:
        batch.drop_column("custom_fields")
    with op.batch_alter_table("import_columns") as batch:
        batch.drop_column("label")
