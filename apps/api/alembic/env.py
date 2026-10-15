from __future__ import annotations

from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401  (registra todos os modelos no metadata)
from app.db.base import Base
from app.db.session import get_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    engine = get_engine()
    context.configure(
        url=str(engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=engine.dialect.name == "sqlite",
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = get_engine()
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # SQLite não suporta ALTER TABLE completo; o modo batch recria a tabela.
            render_as_batch=connection.dialect.name == "sqlite",
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
