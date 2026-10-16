"""Filtros compartilhados pelo CRM e pelo dashboard (todos os componentes respondem a eles)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import Annotated

from fastapi import Query
from sqlalchemy import Select, func, literal_column, or_

from app.core.crypto import cpf_hash, normalize_cpf
from app.core.text import normalize_key
from app.models import Application, Candidate, ProcessStatus

# Categoria do status; candidatura sem status (ou sem classificação) conta como "unmapped".
# O literal vai inline (não como parâmetro) para o PostgreSQL aceitar a expressão no GROUP BY.
OUTCOME_EXPR = func.coalesce(
    ProcessStatus.outcome, literal_column("'unmapped'"), type_=ProcessStatus.outcome.type
)


@dataclass
class ApplicationFilters:
    search: str | None = None
    agency_ids: list[int] = field(default_factory=list)
    regionals: list[str] = field(default_factory=list)
    sub_representatives: list[str] = field(default_factory=list)
    status_ids: list[int] = field(default_factory=list)
    outcomes: list[str] = field(default_factory=list)
    cohorts: list[str] = field(default_factory=list)
    programs: list[str] = field(default_factory=list)
    susep_active: list[str] = field(default_factory=list)
    date_from: date | None = None
    date_to: date | None = None

    def as_dict(self) -> dict:
        return {
            k: (v.isoformat() if isinstance(v, date) else v)
            for k, v in self.__dict__.items()
            if v not in (None, [], "")
        }

    def apply(self, query: Select) -> Select:
        """Espera uma consulta que já tenha Application, Candidate e (outer join) ProcessStatus."""
        if self.search:
            term = self.search.strip()
            key = f"%{normalize_key(term)}%"
            conditions = [Candidate.name_search.like(key), Application.external_record_id == term]
            if len(re.sub(r"\D", "", term)) == 11:
                conditions.append(Candidate.cpf_hash == cpf_hash(normalize_cpf(term) or ""))
            query = query.where(
                or_(
                    *conditions,
                    func.lower(Application.sub_representative_raw).like(f"%{term.lower()}%"),
                )
            )
        if self.agency_ids:
            query = query.where(Application.agency_id.in_(self.agency_ids))
        if self.regionals:
            query = query.where(Application.regional_norm.in_(self.regionals))
        if self.sub_representatives:
            query = query.where(Application.sub_representative_norm.in_(self.sub_representatives))
        if self.status_ids:
            query = query.where(Application.status_id.in_(self.status_ids))
        if self.outcomes:
            query = query.where(OUTCOME_EXPR.in_(self.outcomes))
        if self.cohorts:
            query = query.where(Application.cohort_name.in_(self.cohorts))
        if self.programs:
            query = query.where(Application.relationship_program_raw.in_(self.programs))
        if self.susep_active:
            query = query.where(Application.susep_active_raw.in_(self.susep_active))
        if self.date_from:
            query = query.where(Application.registered_at >= self.date_from)
        if self.date_to:
            query = query.where(Application.registered_at <= self.date_to)
        return query


def application_filters(
    search: Annotated[str | None, Query(max_length=120)] = None,
    agency_id: Annotated[list[int] | None, Query()] = None,
    regional: Annotated[list[str] | None, Query()] = None,
    sub_representative: Annotated[list[str] | None, Query()] = None,
    status_id: Annotated[list[int] | None, Query()] = None,
    outcome: Annotated[list[str] | None, Query()] = None,
    cohort: Annotated[list[str] | None, Query()] = None,
    program: Annotated[list[str] | None, Query()] = None,
    susep_active: Annotated[list[str] | None, Query()] = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> ApplicationFilters:
    return ApplicationFilters(
        search=search or None,
        agency_ids=agency_id or [],
        regionals=regional or [],
        sub_representatives=sub_representative or [],
        status_ids=status_id or [],
        outcomes=outcome or [],
        cohorts=cohort or [],
        programs=program or [],
        susep_active=susep_active or [],
        date_from=date_from,
        date_to=date_to,
    )
