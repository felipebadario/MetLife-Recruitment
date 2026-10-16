"""Classificações editáveis: criar, renomear, excluir e o efeito nos status e indicadores."""

from __future__ import annotations

from datetime import date

from app.importing.demo import build_cohort_workbook
from app.models import UserRole
from tests.conftest import login

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _admin(client, make_user):
    make_user("admin@example.com", UserRole.ADMIN)
    login(client, "admin@example.com")


def _status(client, label: str) -> dict:
    return next(s for s in client.get("/api/admin/statuses").json() if s["label"] == label)


def test_default_outcomes_are_seeded(client, make_user):
    _admin(client, make_user)
    outcomes = client.get("/api/admin/outcomes").json()
    assert [o["code"] for o in outcomes] == ["hired", "approved", "in_progress", "rejected", "withdrawn", "unmapped"]
    assert outcomes[-1]["is_system"] and outcomes[-1]["label"] == "Não classificado"


def test_create_update_and_delete_outcome(client, make_user):
    _admin(client, make_user)
    created = client.post("/api/admin/outcomes", json={"label": " Em  treinamento ", "color": "#7b5ea7"})
    assert created.status_code == 201
    body = created.json()
    assert body == {
        "code": "em_treinamento", "label": "Em treinamento", "color": "#7B5EA7", "is_system": False, "statuses": 0,
    }
    # Fica antes de "não classificado".
    codes = [o["code"] for o in client.get("/api/catalogs/outcomes").json()]
    assert codes[-2:] == ["em_treinamento", "unmapped"]

    duplicate = client.post("/api/admin/outcomes", json={"label": "em treinamento", "color": "#000000"})
    assert duplicate.status_code == 409
    assert client.post("/api/admin/outcomes", json={"label": "X", "color": "azul"}).status_code == 422

    renamed = client.patch("/api/admin/outcomes/em_treinamento", json={"label": "Treinamento", "color": "#2A9D8F"})
    assert renamed.json()["label"] == "Treinamento" and renamed.json()["code"] == "em_treinamento"
    assert client.patch("/api/admin/outcomes/em_treinamento", json={"label": "Aprovado"}).status_code == 409

    # Um status classificado nela volta a "não classificado" na exclusão.
    entrevista = _status(client, "Entrevista")
    moved = client.patch(f"/api/admin/statuses/{entrevista['id']}", json={"outcome": "em_treinamento"})
    assert moved.status_code == 200
    assert next(o for o in client.get("/api/admin/outcomes").json() if o["code"] == "em_treinamento")["statuses"] == 1
    client.patch("/api/admin/metrics/approval_rate", json={"numerator_outcomes": ["approved", "em_treinamento"]})

    assert client.delete("/api/admin/outcomes/em_treinamento").status_code == 204
    assert _status(client, "Entrevista")["outcome"] == "unmapped"
    metric = next(m for m in client.get("/api/admin/metrics").json() if m["code"] == "approval_rate")
    assert "em_treinamento" not in metric["numerator_outcomes"]
    assert client.delete("/api/admin/outcomes/em_treinamento").status_code == 404

    actions = {e["action"] for e in client.get("/api/admin/audit-logs", params={"action": "catalog."}).json()["items"]}
    assert {"catalog.outcome_created", "catalog.outcome_updated", "catalog.outcome_deleted"} <= actions


def test_delete_rules(client, make_user):
    _admin(client, make_user)
    assert client.delete("/api/admin/outcomes/unmapped").status_code == 409
    # Excluir a única base de uma fórmula deixaria a taxa sem denominador.
    client.patch(
        "/api/admin/metrics/hiring_rate", json={"numerator_outcomes": ["hired"], "denominator_outcomes": ["hired"]}
    )
    blocked = client.delete("/api/admin/outcomes/hired")
    assert blocked.status_code == 409 and "Ajuste a fórmula" in blocked.json()["detail"]
    # As classificações padrão podem ser excluídas.
    assert client.delete("/api/admin/outcomes/withdrawn").status_code == 204
    assert "withdrawn" not in [o["code"] for o in client.get("/api/catalogs/outcomes").json()]


def test_unknown_outcome_rejected(client, make_user):
    _admin(client, make_user)
    entrevista = _status(client, "Entrevista")
    assert client.patch(f"/api/admin/statuses/{entrevista['id']}", json={"outcome": "inexistente"}).status_code == 422
    bad = client.patch("/api/admin/metrics/approval_rate", json={"numerator_outcomes": ["inexistente"]})
    assert bad.status_code == 422


def test_new_outcome_counts_in_dashboard(client, make_user):
    _admin(client, make_user)
    content = build_cohort_workbook("DEMO T81", date(2026, 3, 10), size=30, seed=5)
    client.post("/api/imports", files={"file": ("t81.xlsx", content, XLSX)})
    client.post("/api/admin/outcomes", json={"label": "Em treinamento", "color": "#7B5EA7"})
    data = client.get("/api/performance/dashboard").json()
    assert data["totals"]["by_outcome"]["em_treinamento"] == 0

    counts = {s["label"]: s["applications"] for s in client.get("/api/admin/statuses").json()}
    label = max(counts, key=counts.get)
    client.patch(f"/api/admin/statuses/{_status(client, label)['id']}", json={"outcome": "em_treinamento"})
    data = client.get("/api/performance/dashboard").json()
    assert data["totals"]["by_outcome"]["em_treinamento"] == counts[label]
    summary = client.get("/api/candidates/summary", params={"outcome": "em_treinamento"}).json()
    assert summary["applications"] == counts[label]


def test_outcomes_readable_by_any_user_but_managed_by_admin(client, make_user):
    make_user("viewer@example.com", UserRole.VIEWER)
    login(client, "viewer@example.com")
    assert len(client.get("/api/catalogs/outcomes").json()) == 6
    assert client.post("/api/admin/outcomes", json={"label": "X", "color": "#000000"}).status_code == 403
    assert client.delete("/api/admin/outcomes/hired").status_code == 403
