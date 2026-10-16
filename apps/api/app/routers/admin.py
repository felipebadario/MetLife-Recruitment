"""Administração: usuários e trilha de auditoria (somente perfil admin)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from app.auth.deps import DbSession, require_permission
from app.auth.permissions import Permission
from app.core.security import hash_password, utcnow
from app.models import AuditLog, User, UserRole
from app.schemas import (
    AuditLogOut,
    Page,
    PasswordResetIn,
    UserCreateIn,
    UserOut,
    UserUpdateIn,
)
from app.services.audit import AuditAction, record_audit

router = APIRouter(prefix="/api/admin", tags=["admin"])

UsersAdmin = Annotated[User, Depends(require_permission(Permission.USERS_MANAGE))]
AuditViewer = Annotated[User, Depends(require_permission(Permission.AUDIT_VIEW))]


def _active_admins(db: DbSession) -> int:
    return db.scalar(
        select(func.count()).select_from(User).where(User.role == UserRole.ADMIN, User.is_active)
    ) or 0


def _get_user_or_404(db: DbSession, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    return user


# ---------------------------------------------------------------- usuários
@router.get("/users", response_model=list[UserOut])
def list_users(_: UsersAdmin, db: DbSession) -> list[User]:
    return list(db.scalars(select(User).order_by(User.name)))


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreateIn, request: Request, actor: UsersAdmin, db: DbSession) -> User:
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Já existe um usuário com este e-mail."
        )
    user = User(
        name=payload.name,
        email=payload.email,
        role=payload.role,
        password_hash=hash_password(payload.password),
        password_changed_at=utcnow(),
        is_active=True,
        failed_login_attempts=0,
    )
    db.add(user)
    db.flush()
    record_audit(
        db,
        action=AuditAction.USER_CREATED,
        request=request,
        actor=actor,
        entity_type="user",
        entity_id=user.id,
        details={"email": user.email, "role": user.role.value},
    )
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int, payload: UserUpdateIn, request: Request, actor: UsersAdmin, db: DbSession
) -> User:
    user = _get_user_or_404(db, user_id)
    changes = payload.model_dump(exclude_unset=True)

    losing_admin = user.role == UserRole.ADMIN and user.is_active and (
        changes.get("role") not in (None, UserRole.ADMIN) or changes.get("is_active") is False
    )
    if losing_admin and _active_admins(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="É preciso manter pelo menos um administrador ativo.",
        )
    if user.id == actor.id and changes.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode desativar o próprio acesso.",
        )

    new_email = changes.get("email")
    if new_email and new_email != user.email and db.scalar(select(User).where(User.email == new_email)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Já existe um usuário com este e-mail."
        )

    applied: dict[str, object] = {}
    for field, value in changes.items():
        if value is None or getattr(user, field) == value:
            continue
        if field == "email":
            applied["previous_email"] = user.email
        setattr(user, field, value)
        applied[field] = value.value if isinstance(value, UserRole) else value

    if applied:
        db.flush()
        record_audit(
            db,
            action=AuditAction.USER_UPDATED,
            request=request,
            actor=actor,
            entity_type="user",
            entity_id=user.id,
            details=applied,
        )
    return user


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: int, payload: PasswordResetIn, request: Request, actor: UsersAdmin, db: DbSession
) -> None:
    user = _get_user_or_404(db, user_id)
    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = utcnow()  # encerra as sessões abertas desse usuário
    user.failed_login_attempts = 0
    user.locked_until = None
    db.flush()
    record_audit(
        db,
        action=AuditAction.USER_PASSWORD_RESET,
        request=request,
        actor=actor,
        entity_type="user",
        entity_id=user.id,
    )


# ---------------------------------------------------------------- auditoria
@router.get("/audit-logs", response_model=Page[AuditLogOut])
def list_audit_logs(
    _: AuditViewer,
    db: DbSession,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    action: Annotated[str | None, Query(max_length=64)] = None,
    user_id: int | None = None,
) -> Page[AuditLogOut]:
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action.startswith(action))
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page[AuditLogOut](
        items=[AuditLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
