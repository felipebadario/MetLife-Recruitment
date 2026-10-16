"""Dashboard de performance.

Uma única consulta agregada (GROUP BY nas dimensões do dashboard) alimenta todos os
blocos; os recortes são montados em memória a partir desse resultado, que tem no máximo
uma linha por combinação de dimensões — bem menor que a base de candidaturas.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.auth.deps import DbSession, require_permission
from app.auth.permissions import Permission
from app.models import (
    Agency,
    Application,
    Candidate,
    MetricDefinition,
    ProcessOutcome,
    ProcessStatus,
    User,
)
from app.services.filters import OUTCOME_EXPR, ApplicationFilters, application_filters

router = APIRouter(prefix="/api/performance", tags=["performance"])

Analyst = Annotated[User, Depends(require_permission(Permission.PERFORMANCE_VIEW))]
Filters = Annotated[ApplicationFilters, Depends(application_filters)]

OUTCOMES = [o.value for o in ProcessOutcome]
# Grupos de perfil com menos candidaturas que isto não têm taxas exibidas (evita conclusões
# sobre poucos casos e reduz o risco de reidentificação).
PROFILE_MIN_GROUP = 5


@dataclass
class Cell:
    agency_id: int
    regional: str | None
    status_id: int | None
    outcome: str
    cohort: str | None
    exam_date: date | None
    registered: date | None
    susep: str | None
    program: str | None
    count: int


def _empty() -> dict[str, int]:
    return {o: 0 for o in OUTCOMES}


def _rates(by_outcome: dict[str, int], metrics: list[MetricDefinition]) -> dict[str, float | None]:
    rates: dict[str, float | None] = {}
    for m in metrics:
        den = sum(by_outcome.get(o, 0) for o in m.denominator_outcomes)
        num = sum(by_outcome.get(o, 0) for o in m.numerator_outcomes)
        rates[m.code] = round(num / den, 4) if den else None
    return rates


def _denominator(by_outcome: dict[str, int], metrics: list[MetricDefinition]) -> int:
    """Base comum das taxas (maior denominador entre os indicadores)."""
    return max((sum(by_outcome.get(o, 0) for o in m.denominator_outcomes) for m in metrics), default=0)


@router.get("/dashboard")
def dashboard(_: Analyst, db: DbSession, filters: Filters) -> dict:
    metrics = list(
        db.scalars(select(MetricDefinition).where(MetricDefinition.is_active).order_by(MetricDefinition.id))
    )
    min_sample = min((m.min_sample_size for m in metrics), default=10)

    columns = (
        Application.agency_id,
        Application.regional_norm,
        Application.status_id,
        OUTCOME_EXPR,
        Application.cohort_name,
        Application.exam_date,
        Application.registered_at,
        Application.susep_active_raw,
        Application.relationship_program_raw,
    )
    query = (
        select(*columns, func.count(Application.id))
        .join(Candidate, Candidate.id == Application.candidate_id)
        .outerjoin(ProcessStatus, ProcessStatus.id == Application.status_id)
        .group_by(*columns)
    )
    cells = [
        Cell(
            agency_id=r[0], regional=r[1], status_id=r[2],
            outcome=r[3].value if isinstance(r[3], ProcessOutcome) else str(r[3]),
            cohort=r[4], exam_date=r[5], registered=r[6],
            susep=r[7], program=r[8], count=r[9],
        )
        for r in db.execute(filters.apply(query))
    ]
    candidates = db.scalar(
        filters.apply(
            select(func.count(func.distinct(Application.candidate_id)))
            .select_from(Application)
            .join(Candidate, Candidate.id == Application.candidate_id)
            .outerjoin(ProcessStatus, ProcessStatus.id == Application.status_id)
        )
    ) or 0

    agencies = {a.id: a.name for a in db.scalars(select(Agency))}
    statuses = {s.id: s for s in db.scalars(select(ProcessStatus))}

    total = _empty()
    by_agency: dict[int, dict[str, int]] = defaultdict(_empty)
    by_status: dict[int | None, int] = defaultdict(int)
    by_agency_status: dict[tuple[int, int | None], int] = defaultdict(int)
    by_month: dict[str, dict[str, int]] = defaultdict(_empty)
    by_cohort: dict[str, dict[str, int]] = defaultdict(_empty)
    cohort_dates: dict[str, date | None] = {}
    profiles: dict[str, dict[str, dict[str, int]]] = {
        "susep": defaultdict(_empty), "program": defaultdict(_empty), "regional": defaultdict(_empty),
    }

    for c in cells:
        total[c.outcome] += c.count
        by_agency[c.agency_id][c.outcome] += c.count
        by_status[c.status_id] += c.count
        by_agency_status[(c.agency_id, c.status_id)] += c.count
        if c.registered:
            by_month[c.registered.strftime("%Y-%m")][c.outcome] += c.count
        if c.cohort:
            by_cohort[c.cohort][c.outcome] += c.count
            cohort_dates[c.cohort] = c.exam_date
        profiles["susep"][c.susep or "Não informado"][c.outcome] += c.count
        profiles["program"][c.program or "Não informado"][c.outcome] += c.count
        profiles["regional"][c.regional or "Não informado"][c.outcome] += c.count

    applications = sum(total.values())
    classified = applications - total["unmapped"]

    def metric_values(by_outcome: dict[str, int]) -> list[dict]:
        out = []
        for m in metrics:
            den = sum(by_outcome.get(o, 0) for o in m.denominator_outcomes)
            num = sum(by_outcome.get(o, 0) for o in m.numerator_outcomes)
            out.append({
                "code": m.code,
                "label": m.label,
                "description": m.description,
                "value": round(num / den, 4) if den else None,
                "numerator": num,
                "denominator": den,
                "min_sample_size": m.min_sample_size,
                "low_sample": den < m.min_sample_size,
                "is_validated": m.is_validated,
            })
        return out

    def group_row(by_outcome: dict[str, int]) -> dict:
        base = _denominator(by_outcome, metrics)
        return {
            "total": sum(by_outcome.values()),
            "by_outcome": by_outcome,
            "rates": _rates(by_outcome, metrics),
            "rate_base": base,
            "low_sample": base < min_sample,
        }

    unmapped_statuses = [
        {"id": s.id, "label": s.label, "count": by_status.get(s.id, 0)}
        for s in statuses.values()
        if s.outcome == ProcessOutcome.UNMAPPED and by_status.get(s.id, 0)
    ]

    profile_labels = {"susep": "SUSEP ativa", "program": "Programa de relacionamento", "regional": "Regional"}
    profile_out = []
    for key, groups in profiles.items():
        rows = []
        for value, by_outcome in sorted(groups.items(), key=lambda kv: -sum(kv[1].values())):
            row = {"value": value, **group_row(by_outcome)}
            if row["total"] < PROFILE_MIN_GROUP:
                row["rates"] = {code: None for code in row["rates"]}
                row["suppressed"] = True
            rows.append(row)
        profile_out.append({"key": key, "label": profile_labels[key], "groups": rows})

    return {
        "totals": {
            "applications": applications,
            "candidates": candidates,
            "classified": classified,
            "by_outcome": total,
        },
        "metrics": metric_values(total),
        "min_sample_size": min_sample,
        "unmapped_statuses": unmapped_statuses,
        "agencies": sorted(
            (
                {"agency_id": aid, "name": agencies.get(aid, "?"), **group_row(by_outcome)}
                for aid, by_outcome in by_agency.items()
            ),
            key=lambda r: -r["total"],
        ),
        "statuses": sorted(
            (
                {
                    "status_id": sid,
                    "label": statuses[sid].label if sid in statuses else "Sem status",
                    "outcome": statuses[sid].outcome.value if sid in statuses else "unmapped",
                    "count": count,
                }
                for sid, count in by_status.items()
            ),
            key=lambda r: -r["count"],
        ),
        "agency_status": [
            {"agency_id": aid, "status_id": sid, "count": count}
            for (aid, sid), count in by_agency_status.items()
        ],
        "timeline": [
            {"period": period, **group_row(by_outcome)} for period, by_outcome in sorted(by_month.items())
        ],
        "cohorts": sorted(
            (
                {
                    "name": name,
                    "exam_date": cohort_dates.get(name).isoformat() if cohort_dates.get(name) else None,
                    **group_row(by_outcome),
                }
                for name, by_outcome in by_cohort.items()
            ),
            key=lambda r: r["exam_date"] or "",
        ),
        "profile": profile_out,
        "profile_min_group": PROFILE_MIN_GROUP,
        # Fórmula ainda não definida pelo negócio (pendência #5).
        "time_to_hire_days": None,
    }
