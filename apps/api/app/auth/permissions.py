"""Matriz de permissões por perfil.

A checagem sempre acontece no backend; o frontend usa a mesma lista apenas para
esconder o que o usuário não pode acessar.
"""

from __future__ import annotations

from enum import Enum

from app.models import UserRole


class Permission(str, Enum):
    CANDIDATES_VIEW = "candidates.view"
    # Ver CPF, e-mail e telefone sem máscara
    CANDIDATES_VIEW_SENSITIVE = "candidates.view_sensitive"
    CANDIDATES_EXPORT = "candidates.export"
    CANDIDATES_NOTES_WRITE = "candidates.notes_write"
    PERFORMANCE_VIEW = "performance.view"
    IMPORTS_MANAGE = "imports.manage"
    # Apagar de uma vez todos os candidatos e importações (só administrador)
    IMPORTS_RESET = "imports.reset"
    CATALOGS_MANAGE = "catalogs.manage"
    USERS_MANAGE = "users.manage"
    AUDIT_VIEW = "audit.view"
    INTEGRATIONS_MANAGE = "integrations.manage"


ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.ADMIN: frozenset(Permission),
    # Operacional: Candidatos, Performance e Importação completos, sem o menu Administração
    # (nem o "Apagar dados", que zera a base inteira).
    UserRole.OPERATIONAL: frozenset(
        {
            Permission.CANDIDATES_VIEW,
            Permission.CANDIDATES_VIEW_SENSITIVE,
            Permission.CANDIDATES_EXPORT,
            Permission.CANDIDATES_NOTES_WRITE,
            Permission.PERFORMANCE_VIEW,
            Permission.IMPORTS_MANAGE,
        }
    ),
    UserRole.VIEWER: frozenset({Permission.CANDIDATES_VIEW}),
}


def permissions_for(role: UserRole) -> frozenset[Permission]:
    return ROLE_PERMISSIONS.get(role, frozenset())
