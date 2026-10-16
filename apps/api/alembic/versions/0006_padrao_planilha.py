"""Padrão de planilha configurável e colunas da planilha "Base_selecao".

- `import_columns`: padrão de colunas mantido pelo administrador (Administração > Padrão da
  planilha). Começa vazia: campo sem linha segue o padrão inicial do código
  (app/importing/template.py).
- Candidatura ganha as colunas novas da planilha: código da agência, executivo, suspenso,
  quantidade de provas, Status ENS e Status Final.

Revision ID: 0006_padrao_planilha
Revises: 0005_classificacoes
Create Date: 2026-10-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_padrao_planilha"
down_revision = "0005_classificacoes"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)
JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

NEW_COLUMNS = (
    ("agency_branch_raw", sa.String(100)),
    ("status_ens_raw", sa.String(200)),
    ("status_final_raw", sa.String(200)),
    ("executive_raw", sa.String(200)),
    ("suspended_raw", sa.String(50)),
    ("exams_count", sa.Integer()),
)


def upgrade() -> None:
    op.create_table(
        "import_columns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(40), nullable=False),
        sa.Column("headers", JSON, nullable=False),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_import_columns")),
        sa.UniqueConstraint("field", name=op.f("uq_import_columns_field")),
    )
    with op.batch_alter_table("applications") as batch:
        for name, type_ in NEW_COLUMNS:
            batch.add_column(sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("applications") as batch:
        for name, _ in reversed(NEW_COLUMNS):
            batch.drop_column(name)
    op.drop_table("import_columns")
