"""Lista oficial da coluna Status VGCF e abreviação de exibição dos status.

Cadastra os nove status oficiais (ainda não classificados) e une a eles os status criados
automaticamente em importações anteriores com o mesmo nome. Candidaturas, histórico e a
classificação já feita pelo administrador passam para o status oficial. Abreviações não são
interpretadas: a coluna nova `abbreviation` é só um rótulo opcional preenchido no catálogo.

A lista é copiada aqui de propósito: a migração não deve mudar se app/importing/vgcf.py mudar.

Revision ID: 0004_status_vgcf
Revises: 0003_seed_indicadores
Create Date: 2026-10-16
"""

from __future__ import annotations

import unicodedata

import sqlalchemy as sa
from alembic import op

revision = "0004_status_vgcf"
down_revision = "0003_seed_indicadores"
branch_labels = None
depends_on = None

DESCRIPTION = "Status oficial da coluna Status VGCF."

STATUSES = [
    ("VGCF-AGUARDANDO-PAGAMENTO", "Aguardando Pagamento"),
    ("VGCF-ENVIADO-MLPARCEIRO", "Enviado para MLPARCEIRO"),
    ("VGCF-CANCELADO", "Cancelado VGCF"),
    ("VGCF-REPROVADO-ENTREVISTA", "Reprovado Entrevista"),
    ("VGCF-PAGAMENTO-CONFIRMADO", "Pagamento Confirmado"),
    ("VGCF-ENTREVISTA-METLIFE", "Entrevista METLIFE"),
    ("VGCF-SOLICITADO-KIT-FERRAMENTA", "Solicitado Kit Ferramenta"),
    ("VGCF-ENTREVISTA", "Entrevista"),
    ("VGCF-VALIDACAO-SUSEP", "Validação SUSEP"),
]

statuses = sa.table(
    "process_statuses",
    sa.column("id", sa.Integer),
    sa.column("code", sa.String),
    sa.column("label", sa.String),
    sa.column("outcome", sa.String),
    sa.column("funnel_stage_id", sa.Integer),
    sa.column("position", sa.Integer),
    sa.column("is_active", sa.Boolean),
    sa.column("is_provisional", sa.Boolean),
    sa.column("description", sa.Text),
)
mappings = sa.table(
    "status_mappings",
    sa.column("id", sa.Integer),
    sa.column("normalized_key", sa.String),
    sa.column("status_id", sa.Integer),
)
applications = sa.table("applications", sa.column("status_id", sa.Integer))
history = sa.table(
    "application_status_history",
    sa.column("from_status_id", sa.Integer),
    sa.column("to_status_id", sa.Integer),
)


def _key(value: str) -> str:
    text = " ".join(value.split())
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return text.lower()


def _merge(conn: sa.Connection, old_id: int, official_id: int) -> None:
    old = conn.execute(sa.select(statuses).where(statuses.c.id == old_id)).mappings().one()
    official = conn.execute(sa.select(statuses).where(statuses.c.id == official_id)).mappings().one()
    if official["outcome"] == "unmapped" and old["outcome"] != "unmapped":
        conn.execute(
            statuses.update()
            .where(statuses.c.id == official_id)
            .values(outcome=old["outcome"], is_provisional=False)
        )
    if official["funnel_stage_id"] is None and old["funnel_stage_id"] is not None:
        conn.execute(
            statuses.update()
            .where(statuses.c.id == official_id)
            .values(funnel_stage_id=old["funnel_stage_id"])
        )
    conn.execute(applications.update().where(applications.c.status_id == old_id).values(status_id=official_id))
    conn.execute(history.update().where(history.c.from_status_id == old_id).values(from_status_id=official_id))
    conn.execute(history.update().where(history.c.to_status_id == old_id).values(to_status_id=official_id))
    conn.execute(mappings.update().where(mappings.c.status_id == old_id).values(status_id=official_id))
    conn.execute(statuses.delete().where(statuses.c.id == old_id))


def upgrade() -> None:
    conn = op.get_bind()
    with op.batch_alter_table("process_statuses") as batch:
        batch.add_column(sa.Column("abbreviation", sa.String(32), nullable=True))

    for position, (code, label) in enumerate(STATUSES, start=1):
        official_id = conn.scalar(sa.select(statuses.c.id).where(statuses.c.code == code))
        if official_id is None:
            conn.execute(
                statuses.insert().values(
                    code=code, label=label, outcome="unmapped", position=position,
                    is_active=True, is_provisional=True, description=DESCRIPTION,
                )
            )
            official_id = conn.scalar(sa.select(statuses.c.id).where(statuses.c.code == code))
        old_ids = conn.scalars(
            sa.select(mappings.c.status_id).where(
                mappings.c.normalized_key == _key(label), mappings.c.status_id != official_id
            )
        ).all()
        for old_id in set(old_ids):
            _merge(conn, old_id, official_id)

    # Status fora da lista oficial vão para o fim do catálogo.
    conn.execute(
        statuses.update()
        .where(statuses.c.code.notin_([code for code, _ in STATUSES]))
        .values(position=100)
    )


def downgrade() -> None:
    # A união de status não é reversível; só remove os oficiais que nunca foram usados.
    conn = op.get_bind()
    for code, _ in STATUSES:
        status_id = conn.scalar(sa.select(statuses.c.id).where(statuses.c.code == code))
        if status_id is None:
            continue
        used = conn.scalar(
            sa.select(sa.func.count()).select_from(applications).where(applications.c.status_id == status_id)
        )
        if not used:
            conn.execute(mappings.delete().where(mappings.c.status_id == status_id))
            conn.execute(statuses.delete().where(statuses.c.id == status_id))

    with op.batch_alter_table("process_statuses") as batch:
        batch.drop_column("abbreviation")
