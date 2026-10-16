"""Fórmulas iniciais dos indicadores e etapas ilustrativas do funil (provisórias).

Todas marcadas como não validadas: o administrador ajusta em Administração > Status e
catálogos. Ver docs/pending-validations.md.

Revision ID: 0003_seed_indicadores
Revises: 0002_template_turma
Create Date: 2026-10-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_seed_indicadores"
down_revision = "0002_template_turma"
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")

CLASSIFIED = ["in_progress", "approved", "rejected", "hired", "withdrawn"]

METRICS = [
    (
        "approval_rate",
        "Taxa de aprovação",
        "Aprovados e contratados sobre o total de candidaturas classificadas.",
        ["approved", "hired"],
    ),
    (
        "hiring_rate",
        "Taxa de contratação",
        "Contratados sobre o total de candidaturas classificadas.",
        ["hired"],
    ),
    (
        "rejection_rate",
        "Taxa de reprovação",
        "Reprovados sobre o total de candidaturas classificadas.",
        ["rejected"],
    ),
    (
        "withdrawal_rate",
        "Taxa de desistência",
        "Desistências sobre o total de candidaturas classificadas.",
        ["withdrawn"],
    ),
]

STAGES = [
    "Candidatura recebida",
    "Triagem",
    "Avaliação comercial",
    "Aprovação",
    "Documentação",
    "Contratação",
]


def upgrade() -> None:
    metrics = sa.table(
        "metric_definitions",
        sa.column("code", sa.String),
        sa.column("label", sa.String),
        sa.column("description", sa.Text),
        sa.column("numerator_outcomes", JSON),
        sa.column("denominator_outcomes", JSON),
        sa.column("min_sample_size", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("is_validated", sa.Boolean),
    )
    op.bulk_insert(
        metrics,
        [
            {
                "code": code,
                "label": label,
                "description": description,
                "numerator_outcomes": numerator,
                "denominator_outcomes": CLASSIFIED,
                "min_sample_size": 10,
                "is_active": True,
                "is_validated": False,
            }
            for code, label, description, numerator in METRICS
        ],
    )

    stages = sa.table(
        "funnel_stages",
        sa.column("code", sa.String),
        sa.column("label", sa.String),
        sa.column("position", sa.Integer),
        sa.column("is_active", sa.Boolean),
        sa.column("is_provisional", sa.Boolean),
    )
    op.bulk_insert(
        stages,
        [
            {
                "code": f"STAGE-{index + 1}",
                "label": label,
                "position": (index + 1) * 10,
                "is_active": True,
                "is_provisional": True,
            }
            for index, label in enumerate(STAGES)
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM funnel_stages WHERE is_provisional = true AND code LIKE 'STAGE-%'")
    op.execute(
        "DELETE FROM metric_definitions WHERE code IN "
        "('approval_rate', 'hiring_rate', 'rejection_rate', 'withdrawal_rate')"
    )
