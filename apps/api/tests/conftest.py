from __future__ import annotations

import os
import secrets
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="mrc-tests-"))
os.environ.update(
    {
        "ENVIRONMENT": "test",
        # Em CI, TEST_DATABASE_URL roda a mesma suíte contra PostgreSQL.
        "DATABASE_URL": os.environ.get("TEST_DATABASE_URL")
        or f"sqlite:///{(_TMP / 'test.db').as_posix()}",
        "DATA_DIR": str(_TMP),
        "SECRET_KEY": secrets.token_urlsafe(48),
        "FIELD_ENCRYPTION_KEY": "x" * 43 + "=",  # substituída abaixo por uma chave Fernet válida
        "CPF_HASH_KEY": secrets.token_urlsafe(48),
        "WEB_DIST_DIR": str(_TMP / "no-frontend"),
    }
)
from cryptography.fernet import Fernet  # noqa: E402

os.environ["FIELD_ENCRYPTION_KEY"] = Fernet.generate_key().decode()

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete, update  # noqa: E402

from app.core.config import API_DIR  # noqa: E402
from app.core.security import hash_password, utcnow  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.importing.vgcf import VGCF_STATUSES  # noqa: E402
from app.models import ProcessOutcome, ProcessStatus, User, UserRole  # noqa: E402

# Catálogos semeados pelas migrações: preservados entre testes.
_KEEP_TABLES = {"metric_definitions", "funnel_stages"}

PASSWORD = "SenhaForte123"


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    """Cria o banco de testes aplicando as migrações reais (também valida a migração)."""
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    yield
    with get_sessionmaker()() as db:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name == "process_statuses":
                # Os status oficiais VGCF vêm da migração: voltam ao estado inicial.
                official = [item.code for item in VGCF_STATUSES]
                db.execute(delete(ProcessStatus).where(ProcessStatus.code.notin_(official)))
                db.execute(
                    update(ProcessStatus).values(
                        outcome=ProcessOutcome.UNMAPPED, funnel_stage_id=None, abbreviation=None,
                        is_provisional=True,
                    )
                )
            elif table.name not in _KEEP_TABLES:
                db.execute(delete(table))
        db.commit()


@pytest.fixture
def make_user():
    def _make(email: str, role: UserRole = UserRole.VIEWER, *, active: bool = True) -> User:
        with get_sessionmaker()() as db:
            user = User(
                name=email.split("@")[0].title(),
                email=email,
                role=role,
                password_hash=hash_password(PASSWORD),
                password_changed_at=utcnow(),
                is_active=active,
                failed_login_attempts=0,
            )
            db.add(user)
            db.commit()
            return user

    return _make


@pytest.fixture
def client() -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app, headers={"X-Requested-With": "XMLHttpRequest"}) as test_client:
        yield test_client


def login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})
