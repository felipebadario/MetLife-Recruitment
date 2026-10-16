from __future__ import annotations

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models import AuditLog, UserRole
from tests.conftest import PASSWORD, login


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_exposes_demo_mode(client):
    body = client.get("/api/meta").json()
    assert body["app_name"] == "MetLife Recruitment CRM"
    assert "demo_mode" in body


def test_login_sets_httponly_cookie_and_returns_permissions(client, make_user):
    make_user("ana@example.com", UserRole.ADMIN)
    response = login(client, "ANA@example.com ")
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    body = response.json()
    assert body["user"]["role"] == "admin"
    assert "users.manage" in body["permissions"]
    assert "password_hash" not in body["user"]


def test_me_requires_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_wrong_password_is_rejected_and_audited(client, make_user):
    make_user("bia@example.com")
    assert login(client, "bia@example.com", "SenhaErrada999").status_code == 401
    assert login(client, "naoexiste@example.com", "SenhaErrada999").status_code == 401
    with get_sessionmaker()() as db:
        actions = list(db.scalars(select(AuditLog.action)))
    assert actions.count("auth.login_failed") == 2


def test_lockout_after_repeated_failures(client, make_user):
    make_user("caio@example.com")
    statuses = [login(client, "caio@example.com", "SenhaErrada999").status_code for _ in range(5)]
    assert statuses[-1] == 429
    # Mesmo com a senha certa, segue bloqueado durante a janela de bloqueio.
    assert login(client, "caio@example.com").status_code == 429


def test_inactive_user_cannot_login(client, make_user):
    make_user("davi@example.com", active=False)
    assert login(client, "davi@example.com").status_code == 401


def test_viewer_has_only_candidates_view(client, make_user):
    make_user("eva@example.com", UserRole.VIEWER)
    body = login(client, "eva@example.com").json()
    assert body["permissions"] == ["candidates.view"]


def test_viewer_is_blocked_from_admin_and_access_is_audited(client, make_user):
    make_user("fabio@example.com", UserRole.VIEWER)
    login(client, "fabio@example.com")
    assert client.get("/api/admin/users").status_code == 403
    assert client.get("/api/admin/audit-logs").status_code == 403
    with get_sessionmaker()() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "security.access_denied"))


def test_logout_clears_session(client, make_user):
    make_user("gil@example.com")
    login(client, "gil@example.com")
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_csrf_header_required_for_mutations(make_user):
    from fastapi.testclient import TestClient

    from app.main import app

    make_user("hugo@example.com")
    with TestClient(app) as bare:
        response = bare.post(
            "/api/auth/login", json={"email": "hugo@example.com", "password": PASSWORD}
        )
    assert response.status_code == 403


def test_change_password_invalidates_old_sessions(client, make_user):
    from fastapi.testclient import TestClient

    from app.main import app

    make_user("iara@example.com")
    login(client, "iara@example.com")
    with TestClient(app, headers={"X-Requested-With": "XMLHttpRequest"}) as other:
        login(other, "iara@example.com")
        assert other.get("/api/auth/me").status_code == 200

        response = client.post(
            "/api/auth/change-password",
            json={"current_password": PASSWORD, "new_password": "NovaSenha4567"},
        )
        assert response.status_code == 200
        assert client.get("/api/auth/me").status_code == 200  # sessão atual renovada
        assert other.get("/api/auth/me").status_code == 401  # outra sessão encerrada


def test_weak_password_rejected(client, make_user):
    make_user("jo@example.com")
    login(client, "jo@example.com")
    response = client.post(
        "/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "curta"}
    )
    assert response.status_code == 422


def test_security_headers(client):
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"
