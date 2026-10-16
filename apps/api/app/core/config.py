"""Configuração da aplicação, lida de variáveis de ambiente e do arquivo apps/api/.env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = API_DIR.parents[1]
DEFAULT_DATA_DIR = API_DIR / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "MetLife Recruitment CRM"
    app_version: str = "0.1.0"
    environment: Literal["development", "production", "test"] = "development"

    database_url: str = f"sqlite:///{(DEFAULT_DATA_DIR / 'metlife_crm.db').as_posix()}"
    data_dir: Path = DEFAULT_DATA_DIR

    # Segredos — obrigatórios. Gerados por `python -m app.cli init`.
    secret_key: str = ""
    field_encryption_key: str = ""
    cpf_hash_key: str = ""

    session_hours: int = 8
    session_cookie_name: str = "mrc_session"
    cookie_secure: bool = False

    # Proteção contra força bruta no login
    login_max_attempts: int = 5
    login_lockout_minutes: int = 15

    demo_mode: bool = True

    # Retenção da auditoria (dias). Registros de acesso (login, logout, acesso negado) são
    # numerosos e perdem valor rápido; ações administrativas ficam mais tempo.
    audit_access_retention_days: int = Field(default=90, ge=30)
    audit_retention_days: int = Field(default=365, ge=30)

    # Primeiro administrador, criado na inicialização se ainda não houver nenhum usuário.
    # Útil em hospedagens sem terminal (ex.: Render). Depois do primeiro acesso, troque a senha.
    initial_admin_email: str = ""
    initial_admin_password: str = ""
    initial_admin_name: str = "Administrador"

    # Build do frontend servido pelo backend em produção
    web_dist_dir: Path = REPO_DIR / "apps" / "web" / "dist"

    @field_validator("database_url")
    @classmethod
    def _driver(cls, value: str) -> str:
        """Provedores entregam postgres:// ou postgresql://; o SQLAlchemy usa o driver psycopg."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def missing_secrets(self) -> list[str]:
        missing = []
        if len(self.secret_key) < 32:
            missing.append("SECRET_KEY")
        if not self.field_encryption_key:
            missing.append("FIELD_ENCRYPTION_KEY")
        if len(self.cpf_hash_key) < 32:
            missing.append("CPF_HASH_KEY")
        return missing


@lru_cache
def get_settings() -> Settings:
    return Settings()
