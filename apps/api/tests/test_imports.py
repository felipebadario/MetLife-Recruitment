"""Importação no modelo real da planilha (dados 100% fictícios)."""

from __future__ import annotations

import io
from datetime import date

from openpyxl import load_workbook
from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.importing.demo import HEADER, build_cohort_workbook
from app.importing.template import parse_title, parse_workbook
from app.models import (
    Application,
    ApplicationStatusHistory,
    Candidate,
    ProcessOutcome,
    ProcessStatus,
    UserRole,
)
from tests.conftest import login

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _workbook(size: int = 20, seed: int = 1) -> bytes:
    return build_cohort_workbook("DEMO T70", date(2026, 1, 21), first_id=5000, size=size, seed=seed)


def _modify(content: bytes, row: int, column: int, value: object) -> bytes:
    wb = load_workbook(io.BytesIO(content))
    wb.active.cell(row=row, column=column).value = value
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _upload(client, content: bytes, name: str = "turma.xlsx"):
    return client.post("/api/imports", files={"file": (name, content, XLSX)})


def _admin(client, make_user):
    make_user("admin@example.com", UserRole.ADMIN)
    login(client, "admin@example.com")


def test_title_parsing():
    assert parse_title("SAFEE T61 - Prova 21/01/26") == ("SAFEE T61", date(2026, 1, 21))
    assert parse_title("Turma sem data") == ("Turma sem data", None)


def test_parser_reads_template():
    sheet = parse_workbook(_workbook(size=12))
    assert sheet.cohort_name == "DEMO T70"
    assert sheet.exam_date == date(2026, 1, 21)
    assert len(sheet.rows) == 12
    assert not any(r.rejected for r in sheet.rows)
    assert list(sheet.rows[0].raw) == HEADER


def test_import_creates_records_and_unmapped_statuses(client, make_user):
    _admin(client, make_user)
    response = _upload(client, _workbook())
    assert response.status_code == 202

    batch = client.get(f"/api/imports/{response.json()['id']}").json()["batch"]
    assert batch["status"] == "completed"
    assert batch["rows_created"] == 20 and batch["rows_rejected"] == 0
    assert batch["cohort_name"] == "DEMO T70"

    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Application)) == 20
        statuses = list(db.scalars(select(ProcessStatus)))
        # Nenhum status é interpretado automaticamente.
        assert statuses and all(s.outcome == ProcessOutcome.UNMAPPED for s in statuses)


def test_same_file_twice_is_skipped(client, make_user):
    _admin(client, make_user)
    content = _workbook()
    _upload(client, content)
    second = _upload(client, content).json()
    assert second["status"] == "skipped_duplicate"
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Application)) == 20


def test_reprocess_is_idempotent(client, make_user):
    _admin(client, make_user)
    first = _upload(client, _workbook()).json()
    again = client.post(f"/api/imports/{first['id']}/reprocess").json()
    detail = client.get(f"/api/imports/{again['id']}").json()["batch"]
    assert detail["rows_unchanged"] == 20 and detail["rows_created"] == 0


def test_status_change_is_recorded_in_history(client, make_user):
    _admin(client, make_user)
    content = _workbook()
    _upload(client, content)
    # Linha 3 = primeiro candidato; coluna 10 = Status
    updated = _modify(content, row=3, column=10, value="NOVO-STATUS")
    batch = _upload(client, updated, "turma_atualizada.xlsx").json()
    detail = client.get(f"/api/imports/{batch['id']}").json()["batch"]
    assert detail["rows_updated"] == 1 and detail["rows_unchanged"] == 19

    with get_sessionmaker()() as db:
        app = db.scalar(select(Application).where(Application.external_record_id == "5000"))
        assert app.status_raw == "NOVO-STATUS"
        history = list(
            db.scalars(
                select(ApplicationStatusHistory).where(ApplicationStatusHistory.application_id == app.id)
            )
        )
        assert len(history) == 2

    timeline = client.get(f"/api/applications/{app.id}").json()["timeline"]
    assert any(e["kind"] == "status" for e in timeline)


def test_invalid_rows_are_rejected_and_reported(client, make_user):
    _admin(client, make_user)
    content = _modify(_workbook(size=5), row=4, column=6, value=None)  # sem nome
    content = _modify(content, row=5, column=1, value=5000)  # ID repetido
    batch = _upload(client, content).json()
    detail = client.get(f"/api/imports/{batch['id']}").json()
    assert detail["batch"]["status"] == "completed_with_errors"
    assert detail["batch"]["rows_rejected"] == 2
    codes = {i["code"] for i in detail["issues"]}
    assert {"required", "duplicate_id"} <= codes


def test_wrong_template_fails_whole_batch(client, make_user):
    _admin(client, make_user)
    from openpyxl import Workbook

    wb = Workbook()
    wb.active.append(["Coluna A", "Coluna B"])
    out = io.BytesIO()
    wb.save(out)
    batch = _upload(client, out.getvalue()).json()
    detail = client.get(f"/api/imports/{batch['id']}").json()["batch"]
    assert detail["status"] == "failed"
    assert "cabeçalho" in detail["error_message"]


def test_non_xlsx_rejected(client, make_user):
    _admin(client, make_user)
    response = client.post("/api/imports", files={"file": ("dados.csv", b"a,b", "text/csv")})
    assert response.status_code == 422


def test_same_person_in_two_cohorts_is_one_candidate(client, make_user):
    _admin(client, make_user)
    first = _workbook(size=3, seed=5)
    _upload(client, first)
    sheet = parse_workbook(first)
    name = sheet.rows[0].values["full_name"]
    second = build_cohort_workbook("DEMO T71", date(2026, 2, 21), first_id=6000, size=3, seed=6)
    second = _modify(second, row=3, column=6, value=name)
    _upload(client, second, "t71.xlsx")
    with get_sessionmaker()() as db:
        candidate = db.scalar(select(Candidate).where(Candidate.full_name == name))
        apps = db.scalar(select(func.count()).where(Application.candidate_id == candidate.id))
        assert apps == 2


def test_viewer_cannot_import(client, make_user):
    make_user("v@example.com")
    login(client, "v@example.com")
    assert _upload(client, _workbook()).status_code == 403


def test_reset_requires_confirmation(client, make_user):
    _admin(client, make_user)
    _upload(client, _workbook())
    assert client.post("/api/imports/reset", json={"confirmation": "sim"}).status_code == 422
    assert client.post("/api/imports/reset", json={"confirmation": "APAGAR"}).status_code == 204
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Application)) == 0


def test_sample_download(client, make_user):
    _admin(client, make_user)
    response = client.get("/api/imports/sample")
    assert response.status_code == 200
    assert parse_workbook(response.content).cohort_name == "DEMO T99"
