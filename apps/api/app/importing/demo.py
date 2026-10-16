"""Gera planilhas FICTÍCIAS no mesmo modelo das planilhas de turma.

Serve para testes automatizados e para a base de demonstração. Nenhum dado aqui
corresponde a pessoas ou agências reais: nomes são combinações aleatórias de
prenomes e sobrenomes comuns, e as agências têm nomes inventados.
"""

from __future__ import annotations

import io
import random
from datetime import date, datetime, timedelta

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

HEADER = [
    "ID",
    "Cadastro no site",
    "Agência",
    "Regional",
    "Sub Representante",
    "Nome Potencial Parceiro",
    "SUSEP Ativa?",
    "Número SUSEP",
    "Programa Relacionamento",
    "Status VGCF",
]

DEMO_AGENCIES = [
    ("AURORA", "SUD"), ("BÚSSOLA", "SUD"), ("CEDRO", "SUL"), ("DUNAS", "CE-NO-NE"),
    ("ESTEIO", "SUD"), ("FAROL", "CE-NO-NE"), ("GALÁXIA", "SUD"), ("HORIZONTE", "SUL"),
    ("ÍCONE", "SUD"), ("JATOBÁ", "CE-NO-NE"), ("LUMEN", "SUD"), ("MARÉ", "CE-NO-NE"),
    ("NÚCLEO", "SUL"), ("ÓRBITA", "SUD"), ("PRISMA", "SUD"), ("QUARTZO", "SUL"),
    ("RUMO", "CE-NO-NE"), ("SEIVA", "SUD"), ("TERRA", "SUL"), ("URBANA", "SUD"),
    ("VÉRTICE", "CE-NO-NE"), ("XISTO", "SUD"), ("ZÊNITE", "SUL"),
]

FIRST_NAMES = [
    "Ana", "Bruno", "Carla", "Daniel", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela",
    "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Pedro", "Quésia", "Rafael",
    "Sofia", "Thiago", "Úrsula", "Vinícius", "Yasmin", "Leonardo", "Beatriz", "Caio", "Débora",
    "Fernanda", "Gustavo", "Helena", "Igor", "Juliana", "Larissa", "Marcelo", "Natália",
    "Otávio", "Paula", "Renata", "Samuel", "Tatiane",
]
LAST_NAMES = [
    "Almeida", "Barros", "Cardoso", "Duarte", "Esteves", "Farias", "Gomes", "Henriques", "Lima",
    "Macedo", "Nogueira", "Oliveira", "Pacheco", "Queiroz", "Ribeiro", "Siqueira", "Teixeira",
    "Valente", "Xavier", "Zanetti", "Moura", "Prado", "Rezende", "Sampaio", "Tavares", "Vieira",
]

# Status VGCF no formato das planilhas. Sem interpretação aqui: a classificação
# (aprovado, reprovado, contratado...) é feita pelo administrador no sistema.
FINAL_STATUS_WEIGHTS = {
    "Pagamento Confirmado": 40, "Reprovado Entrevista": 14, "Cancelado VGCF": 13,
    "Aguardando Pagamento": 12, "Solicitado Kit Ferramenta": 6, "Enviado para MLPARCEIRO": 5,
    "Validação SUSEP": 4, "Entrevista METLIFE": 3, "Entrevista": 3,
}
RECENT_STATUS_WEIGHTS = {
    "Entrevista": 20, "Entrevista METLIFE": 15, "Validação SUSEP": 12, "Enviado para MLPARCEIRO": 12,
    "Aguardando Pagamento": 15, "Solicitado Kit Ferramenta": 6, "Pagamento Confirmado": 8,
    "Cancelado VGCF": 6, "Reprovado Entrevista": 6,
}
PAID = "Pagamento Confirmado"

# Eficiência diferente por agência, para que o ranking tenha o que mostrar.
_AGENCY_SKEW = {name: 0.6 + (i * 37 % 23) / 23 * 0.9 for i, (name, _) in enumerate(DEMO_AGENCIES)}


def _person(rng: random.Random) -> str:
    middle = rng.choice(LAST_NAMES)
    last = rng.choice([n for n in LAST_NAMES if n != middle])
    return f"{rng.choice(FIRST_NAMES)} {middle} {last}"


def _status(rng: random.Random, agency: str, recent: bool) -> str:
    weights = dict(RECENT_STATUS_WEIGHTS if recent else FINAL_STATUS_WEIGHTS)
    weights[PAID] = weights[PAID] * _AGENCY_SKEW[agency]
    codes = list(weights)
    return rng.choices(codes, weights=[weights[c] for c in codes])[0]


def build_cohort_workbook(
    cohort: str,
    exam: date,
    *,
    first_id: int,
    size: int,
    seed: int,
    recent: bool = False,
) -> bytes:
    rng = random.Random(seed)
    sub_reps = {agency: [_person(rng) for _ in range(3)] for agency, _ in DEMO_AGENCIES}

    wb = Workbook()
    ws = wb.active
    ws.title = "Turma (demonstração)"
    ws.append([f"{cohort} - Prova {exam.strftime('%d/%m/%y')}"])
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(HEADER))
    ws["A1"].font = Font(bold=True, size=13)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.append(HEADER)
    for cell in ws[2]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0061A0")

    start = datetime.combine(exam - timedelta(days=75), datetime.min.time())
    for offset in range(size):
        agency, regional = rng.choice(DEMO_AGENCIES)
        registered = start + timedelta(
            days=rng.randint(0, 60), hours=rng.randint(8, 18), minutes=rng.randint(0, 59),
            seconds=rng.randint(0, 59),
        )
        susep = rng.random() < 0.1
        ws.append(
            [
                first_id + offset,
                registered.strftime("%d/%m/%Y %H:%M:%S"),
                agency,
                regional,
                rng.choice(sub_reps[agency]),
                _person(rng),
                "SIM" if susep else "NÃO",
                str(rng.randint(200000000, 259999999)) if susep else None,
                "Básico" if rng.random() < 0.05 else "Integral",
                _status(rng, agency, recent),
            ]
        )
    for column, width in zip("ABCDEFGHIJ", (8, 20, 16, 12, 28, 32, 12, 14, 22, 26), strict=True):
        ws.column_dimensions[column].width = width

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def demo_cohorts(count: int = 8, today: date | None = None) -> list[tuple[str, bytes]]:
    """Turmas fictícias mensais, da mais antiga para a mais recente."""
    today = today or date.today()
    files = []
    next_id = 1000
    for index in range(count):
        months_back = count - 1 - index
        exam = date(today.year, today.month, 20) - timedelta(days=30 * months_back)
        size = 45 + (index * 13) % 30
        name = f"DEMO T{50 + index}"
        content = build_cohort_workbook(
            name, exam, first_id=next_id, size=size, seed=index + 7, recent=months_back <= 1
        )
        files.append((f"{name.replace(' ', '_')}.xlsx", content))
        next_id += size
    return files
