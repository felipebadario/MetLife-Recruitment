"""Classificações de resultado cadastradas (tabela `outcome_categories`)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutcomeCategory


def list_categories(db: Session) -> list[OutcomeCategory]:
    """Na ordem de exibição; "não classificado" (do sistema) sempre por último."""
    return list(
        db.scalars(
            select(OutcomeCategory).order_by(
                OutcomeCategory.is_system, OutcomeCategory.position, OutcomeCategory.id
            )
        )
    )


def outcome_codes(db: Session) -> list[str]:
    return [c.code for c in list_categories(db)]


def outcome_labels(db: Session) -> dict[str, str]:
    return {c.code: c.label for c in list_categories(db)}
