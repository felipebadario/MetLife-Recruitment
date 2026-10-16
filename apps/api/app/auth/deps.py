from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.permissions import Permission, permissions_for
from app.core.config import get_settings
from app.core.security import decode_session_token, token_matches_password
from app.db.session import get_db
from app.models import User
from app.services.audit import AuditAction, record_audit

DbSession = Annotated[Session, Depends(get_db)]

_UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada."
)


def get_current_user(request: Request, db: DbSession) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        raise _UNAUTHENTICATED
    payload = decode_session_token(token)
    if payload is None:
        raise _UNAUTHENTICATED
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise _UNAUTHENTICATED from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _UNAUTHENTICATED
    if not token_matches_password(payload, user.password_changed_at):
        raise _UNAUTHENTICATED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(permission: Permission) -> Callable[..., User]:
    def dependency(request: Request, user: CurrentUser, db: DbSession) -> User:
        if permission not in permissions_for(user.role):
            record_audit(
                db,
                action=AuditAction.ACCESS_DENIED,
                request=request,
                actor=user,
                details={"permission": permission.value, "path": request.url.path},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Seu perfil não tem acesso a este recurso.",
            )
        return user

    return dependency
