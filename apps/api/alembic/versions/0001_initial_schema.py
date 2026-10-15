"""Esquema inicial: usuários, auditoria, agências, catálogos, candidatos, candidaturas e importação.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None

JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
TS = sa.DateTime(timezone=True)


def _enum(*values: str, length: int) -> sa.Enum:
    return sa.Enum(*values, native_enum=False, create_constraint=False, length=length)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    ]


def _fk(column: str, table: str, ref: str, ondelete: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column], [f"{ref}.id"], name=op.f(f"fk_{table}_{column}_{ref}"), ondelete=ondelete
    )


def _pk(table: str) -> sa.PrimaryKeyConstraint:
    return sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}"))


def _uq(table: str, *columns: str) -> sa.UniqueConstraint:
    return sa.UniqueConstraint(*columns, name=op.f(f"uq_{table}_{'_'.join(columns)}"))


def _ix(table: str, *columns: str, unique: bool = False, name: str | None = None) -> None:
    op.create_index(name or op.f(f"ix_{table}_{columns[0]}"), table, list(columns), unique=unique)


OUTCOMES = ("in_progress", "approved", "rejected", "hired", "withdrawn", "unmapped")
CHANGE_SOURCES = ("import", "manual", "system", "demo")
IMPORT_SOURCES = ("manual", "sharepoint", "onedrive", "outlook", "demo")
IMPORT_STATUSES = (
    "received",
    "processing",
    "completed",
    "completed_with_errors",
    "failed",
    "skipped_duplicate",
)
ROW_OUTCOMES = ("pending", "created", "updated", "unchanged", "rejected")


def upgrade() -> None:
    # ---------------------------------------------------------------- users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", _enum("admin", "viewer", length=16), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("password_changed_at", TS, nullable=True),
        sa.Column("last_login_at", TS, nullable=True),
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", TS, nullable=True),
        *_timestamps(),
        _pk("users"),
    )
    _ix("users", "email", unique=True)

    # ---------------------------------------------------------------- audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("actor_email", sa.String(254), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(64), nullable=True),
        sa.Column("entity_id", sa.String(64), nullable=True),
        sa.Column("details", JSON, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        _fk("user_id", "audit_logs", "users", "SET NULL"),
        _pk("audit_logs"),
    )
    _ix("audit_logs", "created_at")
    _ix("audit_logs", "user_id")
    _ix("audit_logs", "action")
    _ix("audit_logs", "entity_type", "entity_id", name="ix_audit_logs_entity")

    # ---------------------------------------------------------------- agencies
    op.create_table(
        "agencies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        *_timestamps(),
        _pk("agencies"),
        _uq("agencies", "code"),
    )
    _ix("agencies", "is_demo")

    # ---------------------------------------------------------------- catálogos
    op.create_table(
        "funnel_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_provisional", sa.Boolean(), nullable=False),
        *_timestamps(),
        _pk("funnel_stages"),
        _uq("funnel_stages", "code"),
    )

    op.create_table(
        "process_statuses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("outcome", _enum(*OUTCOMES, length=32), nullable=False),
        sa.Column("funnel_stage_id", sa.Integer(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_provisional", sa.Boolean(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        *_timestamps(),
        _fk("funnel_stage_id", "process_statuses", "funnel_stages", "SET NULL"),
        _pk("process_statuses"),
        _uq("process_statuses", "code"),
    )

    op.create_table(
        "status_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("raw_value", sa.String(255), nullable=False),
        sa.Column("normalized_key", sa.String(255), nullable=False),
        sa.Column("status_id", sa.Integer(), nullable=False),
        *_timestamps(),
        _fk("status_id", "status_mappings", "process_statuses", "CASCADE"),
        _pk("status_mappings"),
        _uq("status_mappings", "normalized_key"),
    )

    op.create_table(
        "loss_reasons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_provisional", sa.Boolean(), nullable=False),
        *_timestamps(),
        _pk("loss_reasons"),
        _uq("loss_reasons", "code"),
    )

    op.create_table(
        "loss_reason_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("raw_value", sa.String(255), nullable=False),
        sa.Column("normalized_key", sa.String(255), nullable=False),
        sa.Column("loss_reason_id", sa.Integer(), nullable=False),
        *_timestamps(),
        _fk("loss_reason_id", "loss_reason_mappings", "loss_reasons", "CASCADE"),
        _pk("loss_reason_mappings"),
        _uq("loss_reason_mappings", "normalized_key"),
    )

    op.create_table(
        "value_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("raw_value", sa.String(255), nullable=False),
        sa.Column("normalized_key", sa.String(255), nullable=False),
        sa.Column("normalized_value", sa.String(160), nullable=False),
        *_timestamps(),
        _pk("value_mappings"),
        _uq("value_mappings", "field", "normalized_key"),
    )
    _ix("value_mappings", "field")

    op.create_table(
        "metric_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("numerator_outcomes", JSON, nullable=False),
        sa.Column("denominator_outcomes", JSON, nullable=False),
        sa.Column("min_sample_size", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_validated", sa.Boolean(), nullable=False),
        *_timestamps(),
        _pk("metric_definitions"),
        _uq("metric_definitions", "code"),
    )

    # ---------------------------------------------------------------- plataforma
    op.create_table(
        "saved_filters",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("definition", JSON, nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False),
        *_timestamps(),
        _fk("user_id", "saved_filters", "users", "CASCADE"),
        _pk("saved_filters"),
        _uq("saved_filters", "user_id", "scope", "name"),
    )
    _ix("saved_filters", "user_id")

    op.create_table(
        "integration_sources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", _enum("sharepoint", "onedrive", "outlook", length=16), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("config", JSON, nullable=True),
        sa.Column("delta_token", sa.Text(), nullable=True),
        sa.Column("subscription_id", sa.String(255), nullable=True),
        sa.Column("subscription_expires_at", TS, nullable=True),
        sa.Column("last_sync_at", TS, nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        *_timestamps(),
        _pk("integration_sources"),
    )

    # ---------------------------------------------------------------- candidates
    op.create_table(
        "candidates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cpf_hash", sa.String(64), nullable=True),
        sa.Column("cpf_encrypted", sa.String(255), nullable=True),
        sa.Column("cpf_masked", sa.String(14), nullable=True),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("name_search", sa.String(200), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("phone", sa.String(32), nullable=True),
        sa.Column("address", JSON, nullable=True),
        sa.Column("linkedin_url", sa.String(500), nullable=True),
        sa.Column("first_seen_at", TS, nullable=False),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        *_timestamps(),
        _pk("candidates"),
        _uq("candidates", "cpf_hash"),
    )
    _ix("candidates", "name_search")
    _ix("candidates", "email")
    _ix("candidates", "is_demo")

    # ---------------------------------------------------------------- import_batches
    op.create_table(
        "import_batches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", _enum(*IMPORT_SOURCES, length=16), nullable=False),
        sa.Column("status", _enum(*IMPORT_STATUSES, length=32), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_sha256", sa.String(64), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("storage_path", sa.String(500), nullable=True),
        sa.Column("external_id", sa.String(255), nullable=True),
        sa.Column("external_etag", sa.String(255), nullable=True),
        sa.Column("agency_id", sa.Integer(), nullable=True),
        sa.Column("reference_period", sa.String(7), nullable=True),
        sa.Column("template_version", sa.String(20), nullable=True),
        sa.Column("received_at", TS, nullable=False),
        sa.Column("started_at", TS, nullable=True),
        sa.Column("finished_at", TS, nullable=True),
        sa.Column("rows_total", sa.Integer(), nullable=False),
        sa.Column("rows_created", sa.Integer(), nullable=False),
        sa.Column("rows_updated", sa.Integer(), nullable=False),
        sa.Column("rows_unchanged", sa.Integer(), nullable=False),
        sa.Column("rows_rejected", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("triggered_by_id", sa.Integer(), nullable=True),
        sa.Column("reprocess_of_id", sa.Integer(), nullable=True),
        _fk("agency_id", "import_batches", "agencies", "SET NULL"),
        _fk("triggered_by_id", "import_batches", "users", "SET NULL"),
        _fk("reprocess_of_id", "import_batches", "import_batches", "SET NULL"),
        _pk("import_batches"),
    )
    _ix("import_batches", "status")
    _ix("import_batches", "file_sha256")
    _ix("import_batches", "external_id")
    _ix("import_batches", "agency_id")
    _ix("import_batches", "received_at")

    # ---------------------------------------------------------------- applications
    def text_col(name: str, length: int | None = None) -> sa.Column:
        return sa.Column(name, sa.String(length) if length else sa.Text(), nullable=True)

    op.create_table(
        "applications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("candidate_id", sa.Integer(), nullable=False),
        sa.Column("agency_id", sa.Integer(), nullable=False),
        text_col("external_record_id", 100),
        sa.Column("registered_at", sa.Date(), nullable=True),
        text_col("regional_raw", 200),
        text_col("regional_norm", 160),
        text_col("sub_representative_raw", 200),
        text_col("sub_representative_norm", 160),
        text_col("origin_raw", 200),
        text_col("origin_norm", 160),
        text_col("company_segment_raw", 200),
        text_col("company_segment_norm", 160),
        text_col("activity_segment_raw", 200),
        text_col("activity_segment_norm", 160),
        text_col("occupation_raw", 200),
        text_col("education_raw", 200),
        text_col("education_norm", 160),
        text_col("income_band_raw", 200),
        text_col("income_band_norm", 160),
        text_col("exp_entrepreneurship_raw", 200),
        text_col("exp_entrepreneurship_norm", 160),
        text_col("exp_sales_raw", 200),
        text_col("exp_sales_norm", 160),
        text_col("exp_life_insurance_raw", 200),
        text_col("exp_life_insurance_norm", 160),
        text_col("commercial_evaluation_raw", 200),
        text_col("evaluator_name", 200),
        sa.Column("evaluation_date", sa.Date(), nullable=True),
        sa.Column("evaluation_time", sa.Time(), nullable=True),
        text_col("status_raw", 200),
        sa.Column("status_id", sa.Integer(), nullable=True),
        sa.Column("status_changed_at", TS, nullable=True),
        text_col("loss_reason_raw", 255),
        sa.Column("loss_reason_id", sa.Integer(), nullable=True),
        text_col("relationship_program_raw", 200),
        text_col("susep_active_raw", 50),
        text_col("susep_number", 50),
        text_col("is_paused_raw", 50),
        text_col("pause_reason_raw"),
        text_col("notes"),
        sa.Column("raw_payload", JSON, nullable=True),
        text_col("row_hash", 64),
        sa.Column("first_import_batch_id", sa.Integer(), nullable=True),
        sa.Column("last_import_batch_id", sa.Integer(), nullable=True),
        sa.Column("is_demo", sa.Boolean(), nullable=False),
        *_timestamps(),
        _fk("candidate_id", "applications", "candidates", "RESTRICT"),
        _fk("agency_id", "applications", "agencies", "RESTRICT"),
        _fk("status_id", "applications", "process_statuses", "SET NULL"),
        _fk("loss_reason_id", "applications", "loss_reasons", "SET NULL"),
        _fk("first_import_batch_id", "applications", "import_batches", "SET NULL"),
        _fk("last_import_batch_id", "applications", "import_batches", "SET NULL"),
        _pk("applications"),
    )
    for column in (
        "candidate_id",
        "agency_id",
        "registered_at",
        "regional_norm",
        "sub_representative_norm",
        "education_norm",
        "income_band_norm",
        "exp_sales_norm",
        "exp_life_insurance_norm",
        "loss_reason_id",
        "is_demo",
    ):
        _ix("applications", column)
    _ix("applications", "agency_id", "registered_at", name="ix_applications_agency_registered")
    _ix("applications", "status_id", "registered_at", name="ix_applications_status_registered")
    _ix("applications", "agency_id", "external_record_id", name="ix_applications_agency_external")

    # ---------------------------------------------------------------- histórico
    op.create_table(
        "application_status_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("from_status_raw", sa.String(200), nullable=True),
        sa.Column("to_status_raw", sa.String(200), nullable=True),
        sa.Column("from_status_id", sa.Integer(), nullable=True),
        sa.Column("to_status_id", sa.Integer(), nullable=True),
        sa.Column("changed_at", TS, nullable=False),
        sa.Column("source", _enum(*CHANGE_SOURCES, length=16), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        _fk("application_id", "application_status_history", "applications", "CASCADE"),
        _fk("from_status_id", "application_status_history", "process_statuses", "SET NULL"),
        _fk("to_status_id", "application_status_history", "process_statuses", "SET NULL"),
        _fk("import_batch_id", "application_status_history", "import_batches", "SET NULL"),
        _fk("user_id", "application_status_history", "users", "SET NULL"),
        _pk("application_status_history"),
    )
    _ix("application_status_history", "application_id")
    _ix("application_status_history", "changed_at")

    op.create_table(
        "application_field_changes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("import_batch_id", sa.Integer(), nullable=True),
        sa.Column("field", sa.String(64), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changed_at", TS, nullable=False),
        _fk("application_id", "application_field_changes", "applications", "CASCADE"),
        _fk("import_batch_id", "application_field_changes", "import_batches", "SET NULL"),
        _pk("application_field_changes"),
    )
    _ix("application_field_changes", "application_id")

    op.create_table(
        "internal_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=False),
        sa.Column("author_id", sa.Integer(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        *_timestamps(),
        _fk("application_id", "internal_notes", "applications", "CASCADE"),
        _fk("author_id", "internal_notes", "users", "SET NULL"),
        _pk("internal_notes"),
    )
    _ix("internal_notes", "application_id")

    # ---------------------------------------------------------------- staging e erros
    op.create_table(
        "import_rows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("raw", JSON, nullable=False),
        sa.Column("row_hash", sa.String(64), nullable=False),
        sa.Column("outcome", _enum(*ROW_OUTCOMES, length=16), nullable=False),
        sa.Column("application_id", sa.Integer(), nullable=True),
        _fk("batch_id", "import_rows", "import_batches", "CASCADE"),
        _fk("application_id", "import_rows", "applications", "SET NULL"),
        _pk("import_rows"),
    )
    _ix("import_rows", "batch_id")

    op.create_table(
        "import_errors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=True),
        sa.Column("field", sa.String(64), nullable=True),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("severity", _enum("error", "warning", length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=True),
        sa.Column("details", JSON, nullable=True),
        _fk("batch_id", "import_errors", "import_batches", "CASCADE"),
        _pk("import_errors"),
    )
    _ix("import_errors", "batch_id")


def downgrade() -> None:
    for table in (
        "import_errors",
        "import_rows",
        "internal_notes",
        "application_field_changes",
        "application_status_history",
        "applications",
        "import_batches",
        "candidates",
        "integration_sources",
        "saved_filters",
        "metric_definitions",
        "value_mappings",
        "loss_reason_mappings",
        "loss_reasons",
        "status_mappings",
        "process_statuses",
        "funnel_stages",
        "agencies",
        "audit_logs",
        "users",
    ):
        op.drop_table(table)
