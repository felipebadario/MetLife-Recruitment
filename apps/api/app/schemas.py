"""Esquemas de entrada e saída da API."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Generic, TypeVar

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator

from app.core.security import password_policy_errors
from app.models import UserRole

T = TypeVar("T")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    value = value.strip().lower()
    if len(value) > 254 or not _EMAIL_RE.match(value):
        raise ValueError("E-mail inválido.")
    return value


def _check_password(value: str) -> str:
    errors = password_policy_errors(value)
    if errors:
        raise ValueError(" ".join(errors))
    return value


Email = Annotated[str, AfterValidator(_normalize_email)]
NewPassword = Annotated[str, AfterValidator(_check_password)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------- auth
class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return value.strip().lower()


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: NewPassword


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime


class SessionOut(BaseModel):
    user: UserOut
    permissions: list[str]


# ---------------------------------------------------------------- usuários (admin)
class UserCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: Email
    role: UserRole = UserRole.VIEWER
    password: NewPassword

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return value.strip()


class UserUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None


class PasswordResetIn(BaseModel):
    new_password: NewPassword


# ---------------------------------------------------------------- auditoria
class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    user_id: int | None
    actor_email: str | None
    action: str
    entity_type: str | None
    entity_id: str | None
    details: dict[str, Any] | None
    ip_address: str | None


# ---------------------------------------------------------------- meta
class AppMetaOut(BaseModel):
    app_name: str
    version: str
    environment: str
    demo_mode: bool
