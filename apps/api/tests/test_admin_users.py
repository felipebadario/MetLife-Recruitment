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
