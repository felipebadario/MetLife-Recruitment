from __future__ import annotations

from app.models import UserRole
from tests.conftest import login


def _admin(client, make_user, email="admin@example.com"):
    user = make_user(email, UserRole.ADMIN)
    login(client, email)
    return user


def test_admin_creates_viewer(client, make_user):
    _admin(client, make_user)
    response = client.post(
        "/api/admin/users",
        json={
            "name": "Nova Pessoa",
            "email": "Nova@Example.com",
            "role": "viewer",
            "password": "SenhaForte987",
        },
    )
    assert response.status_code == 201
    assert response.json()["email"] == "nova@example.com"
    assert login(client, "nova@example.com", "SenhaForte987").status_code == 200


def test_duplicate_email_conflict(client, make_user):
    _admin(client, make_user)
    payload = {"name": "X Y", "email": "dup@example.com", "password": "SenhaForte987"}
    assert client.post("/api/admin/users", json=payload).status_code == 201
    assert client.post("/api/admin/users", json=payload).status_code == 409


def test_cannot_remove_last_admin(client, make_user):
    admin = _admin(client, make_user)
    response = client.patch(f"/api/admin/users/{admin.id}", json={"role": "viewer"})
    assert response.status_code == 400


def test_cannot_deactivate_self(client, make_user):
    admin = _admin(client, make_user)
    make_user("outro-admin@example.com", UserRole.ADMIN)
    response = client.patch(f"/api/admin/users/{admin.id}", json={"is_active": False})
    assert response.status_code == 400


def test_role_change_and_audit_log(client, make_user):
    _admin(client, make_user)
    viewer = make_user("v@example.com")
    response = client.patch(f"/api/admin/users/{viewer.id}", json={"role": "admin"})
    assert response.status_code == 200 and response.json()["role"] == "admin"

    logs = client.get("/api/admin/audit-logs", params={"action": "user."}).json()
    assert logs["total"] >= 1
    assert logs["items"][0]["details"] == {"role": "admin"}


def test_reset_password_ends_sessions(client, make_user):
    from fastapi.testclient import TestClient

    from app.main import app

    _admin(client, make_user)
    viewer = make_user("w@example.com")
    with TestClient(app, headers={"X-Requested-With": "XMLHttpRequest"}) as other:
        login(other, "w@example.com")
        response = client.post(
            f"/api/admin/users/{viewer.id}/reset-password", json={"new_password": "Trocada12345"}
        )
        assert response.status_code == 204
        assert other.get("/api/auth/me").status_code == 401


def test_admin_edits_user_email(client, make_user):
    _admin(client, make_user)
    other = make_user("antigo@example.com", UserRole.VIEWER)
    response = client.patch(f"/api/admin/users/{other.id}", json={"email": "Novo@Example.com"})
    assert response.status_code == 200 and response.json()["email"] == "novo@example.com"
    assert login(client, "antigo@example.com").status_code == 401
    assert login(client, "novo@example.com").status_code == 200


def test_email_edit_conflict_and_validation(client, make_user):
    _admin(client, make_user)
    other = make_user("outro@example.com", UserRole.VIEWER)
    assert client.patch(f"/api/admin/users/{other.id}", json={"email": "admin@example.com"}).status_code == 409
    assert client.patch(f"/api/admin/users/{other.id}", json={"email": "sem-arroba"}).status_code == 422


def test_cannot_demote_last_admin_to_operational(client, make_user):
    admin = _admin(client, make_user)
    assert client.patch(f"/api/admin/users/{admin.id}", json={"role": "operational"}).status_code == 400


def test_operational_sees_everything_but_admin(client, make_user):
    make_user("op@example.com", UserRole.OPERATIONAL)
    response = login(client, "op@example.com")
    assert set(response.json()["permissions"]) == {
        "candidates.view", "candidates.view_sensitive", "candidates.export", "candidates.notes_write",
        "performance.view",
    }
    assert client.get("/api/performance/dashboard").status_code == 200
    assert client.get("/api/candidates").status_code == 200
    for path in ("/api/admin/users", "/api/admin/statuses", "/api/imports", "/api/admin/audit-logs"):
        assert client.get(path).status_code == 403, path
