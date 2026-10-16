"""Classificações editáveis: tabela `outcome_categories`.

Até aqui as classificações de resultado (Em andamento, Aprovado, Reprovado...) eram fixas
no código. Agora ficam numa tabela que o administrador mantém em Status e catálogos. As seis
de sempre são cadastradas com os mesmos códigos, então status já classificados e fórmulas
dos indicadores continuam valendo sem mudança. "Não classificado" é do sistema e não pode
ser excluída.

Revision ID: 0005_classificacoes
Revises: 0004_status_vgcf
Create Date: 2026-10-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_classificacoes"
down_revision = "0004_status_vgcf"
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)

# Mesma ordem e cores usadas até aqui no frontend (paleta validada para daltonismo).
DEFAULTS = [
    ("hired", "Contratado", "#5E8F1B", False),
    ("approved", "Aprovado", "#0061A0", False),
    ("in_progress", "Em andamento", "#4FA3D9", False),
    ("rejected", "Reprovado", "#C2412C", False),
    ("withdrawn", "Desistência", "#D39A1E", False),
    ("unmapped", "Não classificado", "#AAB4C0", True),
]


def upgrade() -> None:
    table = op.create_table(
        "outcome_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("label", sa.String(60), nullable=False),
        sa.Column("color", sa.String(7), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outcome_categories")),
        sa.UniqueConstraint("code", name=op.f("uq_outcome_categories_code")),
    )
    op.bulk_insert(
        table,
        [
            {"code": code, "label": label, "color": color, "position": i, "is_system": system}
            for i, (code, label, color, system) in enumerate(DEFAULTS)
        ],
    )


def downgrade() -> None:
    # Status em classificações criadas depois voltam a "não classificado".
    statuses = sa.table("process_statuses", sa.column("outcome", sa.String))
    op.execute(
        statuses.update()
        .where(statuses.c.outcome.notin_([code for code, *_ in DEFAULTS]))
        .values(outcome="unmapped")
    )
    op.drop_table("outcome_categories")
