"""Lista oficial de status da coluna "Status VGCF" das planilhas de turma.

Fonte: lista informada pela área de negócio. Aqui ficam só os nomes; o significado de
cada status (aprovado, reprovado, contratado...) e a etapa do funil continuam sendo
definidos pelo administrador em Administração > Status e catálogos.

A planilha traz sempre o nome completo do status. Abreviações não são reconhecidas na
importação; o administrador pode registrar uma abreviação de exibição no catálogo.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.core.text import normalize_key


@dataclass(frozen=True)
class VgcfStatus:
    code: str
    label: str


VGCF_STATUSES: tuple[VgcfStatus, ...] = (
    VgcfStatus("VGCF-AGUARDANDO-PAGAMENTO", "Aguardando Pagamento"),
    VgcfStatus("VGCF-ENVIADO-MLPARCEIRO", "Enviado para MLPARCEIRO"),
    VgcfStatus("VGCF-CANCELADO", "Cancelado VGCF"),
    VgcfStatus("VGCF-REPROVADO-ENTREVISTA", "Reprovado Entrevista"),
    VgcfStatus("VGCF-PAGAMENTO-CONFIRMADO", "Pagamento Confirmado"),
    VgcfStatus("VGCF-ENTREVISTA-METLIFE", "Entrevista METLIFE"),
    VgcfStatus("VGCF-SOLICITADO-KIT-FERRAMENTA", "Solicitado Kit Ferramenta"),
    VgcfStatus("VGCF-ENTREVISTA", "Entrevista"),
    VgcfStatus("VGCF-VALIDACAO-SUSEP", "Validação SUSEP"),
)

DESCRIPTION = "Status oficial da coluna Status VGCF."

# Posição na lista do catálogo: oficiais primeiro, na ordem acima; os demais depois.
OTHER_POSITION = 100


def _index() -> dict[str, tuple[int, VgcfStatus]]:
    return {
        normalize_key(status.label): (position, status)
        for position, status in enumerate(VGCF_STATUSES, start=1)
    }


_BY_KEY = _index()


def lookup(raw: object) -> tuple[int, VgcfStatus] | None:
    """Posição e status oficial correspondentes ao nome vindo da planilha."""
    return _BY_KEY.get(normalize_key(raw))
