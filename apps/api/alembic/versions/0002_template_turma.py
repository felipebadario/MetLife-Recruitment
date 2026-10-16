"""Ajustes ao modelo real da planilha: turma/prova, data e hora do cadastro no site,
arquivo original guardado no lote de importação.

Revision ID: 0002_template_turma
Revises: 0001_initial_schema
Create Date: 2026-10-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_template_turma"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("applications") as batch:
        batch.add_column(sa.Column("site_registered_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("cohort_name", sa.String(120), nullable=True))
        batch.add_column(sa.Column("exam_date", sa.Date(), nullable=True))
        batch.create_index("ix_applications_cohort_name", ["cohort_name"])
        batch.create_index("ix_applications_exam_date", ["exam_date"])
        batch.create_index("ix_applications_external_record_id", ["external_record_id"])

    with op.batch_alter_table("import_batches") as batch:
        batch.add_column(sa.Column("sheet_title", sa.String(255), nullable=True))
        batch.add_column(sa.Column("cohort_name", sa.String(120), nullable=True))
        batch.add_column(sa.Column("exam_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("file_content", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("import_batches") as batch:
        batch.drop_column("file_content")
        batch.drop_column("exam_date")
        batch.drop_column("cohort_name")
        batch.drop_column("sheet_title")

    with op.batch_alter_table("applications") as batch:
        batch.drop_index("ix_applications_external_record_id")
        batch.drop_index("ix_applications_exam_date")
        batch.drop_index("ix_applications_cohort_name")
        batch.drop_column("exam_date")
        batch.drop_column("cohort_name")
        batch.drop_column("site_registered_at")
