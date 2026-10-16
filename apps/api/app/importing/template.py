"""Leitura das planilhas de turma, guiada pelo padrão de colunas configurável.

O padrão (quais colunas existem, com que nomes e quais são obrigatórias) fica em
Administração > Padrão da planilha e é gravado na tabela `import_columns`. Aqui ficam:
- os campos que o sistema sabe interpretar (`FIELDS`), cada um com o tipo de valor;
- o padrão inicial, que segue a planilha "Base_selecao" (Turma, CPF Candidato, Candidato,
  R.N, Nome Agência, Agência, Regional, Executivo, Suspenso, Provas, Status VGCF,
  Status ENS, Status Final, Data Avaliação, Data Cadastro).

O cabeçalho é localizado pelos nomes das colunas (sem diferenciar maiúsculas, acentos
ou pontuação) nas primeiras linhas da aba, então a posição das colunas não importa.
Colunas a mais são preservadas no registro original da linha. Se houver uma linha de
título acima do cabeçalho (ex.: "SAFEE T61 - Prova 21/01/26"), ela dá a turma e a data
da prova quando a planilha não tiver a coluna Turma.
"""

from __future__ import annotations

import io
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo

from openpyxl import load_workbook

from app.core.crypto import is_valid_cpf, mask_cpf, normalize_cpf
from app.core.text import clean, normalize_key
from app.importing import vgcf

LOCAL_TZ = ZoneInfo("America/Sao_Paulo")
HEADER_SEARCH_ROWS = 15


@dataclass(frozen=True)
class FieldSpec:
    """Campo que o sistema sabe interpretar e o padrão inicial dele."""

    key: str
    name: str  # nome no sistema
    description: str
    kind: str  # text | identifier | cpf | date | integer
    headers: tuple[str, ...]  # nomes de coluna aceitos, o primeiro é o principal
    required: bool = False
    active: bool = True
    locked: bool = False  # sempre lida e obrigatória: sem ela a linha não tem sentido


FIELDS: tuple[FieldSpec, ...] = (
    FieldSpec("cohort_name", "Turma", "Turma do candidato. Sem a coluna, vale o título da planilha.",
              "identifier", ("Turma",)),
    FieldSpec("cpf", "CPF", "Identifica o candidato entre planilhas. Guardado criptografado.",
              "cpf", ("CPF Candidato", "CPF")),
    FieldSpec("full_name", "Nome do candidato", "Nome completo.", "text", ("Candidato",),
              required=True, locked=True),
    FieldSpec("sub_representative", "Representante (R.N)", "Quem indicou o candidato na agência.",
              "text", ("R.N", "RN")),
    FieldSpec("agency", "Agência (nome)", "Nome da agência parceira.", "text", ("Nome Agência",),
              required=True, locked=True),
    FieldSpec("agency_branch", "Agência (código)", "Código ou praça da agência (ex.: FLO, POA 2).",
              "text", ("Agência",)),
    FieldSpec("regional", "Regional", "Regional da agência.", "text", ("Regional",)),
    FieldSpec("executive", "Executivo", "Executivo responsável.", "text", ("Executivo",)),
    FieldSpec("suspended", "Suspenso", "Se o candidato está suspenso (sim ou não).", "text",
              ("Suspenso", "Suspensado", "Suspepado")),
    FieldSpec("exams_count", "Provas", "Quantidade de provas feitas.", "integer", ("Provas",)),
    FieldSpec("status", "Status VGCF", "Status classificado em Status e catálogos.", "text",
              ("Status VGCF",), required=True),
    FieldSpec("status_ens", "Status ENS", "Situação na ENS, guardada como veio.", "text", ("Status ENS",)),
    FieldSpec("status_final", "Status final", "Situação final, guardada como veio.", "text",
              ("Status Final",)),
    FieldSpec("evaluation_date", "Data de avaliação", "Aceita data completa ou mês/ano (ex.: Nov/2023).",
              "date", ("Data Avaliação",)),
    FieldSpec("site_registered_at", "Data de cadastro", "Aceita data completa ou mês/ano (ex.: Jan/2024).",
              "date", ("Data Cadastro", "Cadastro no site")),
    # Colunas do modelo anterior (SAFEE): desligadas no padrão inicial.
    FieldSpec("external_record_id", "ID do cadastro",
              "Número do cadastro no site. Quando lido, identifica a candidatura.",
              "identifier", ("ID",), active=False),
    FieldSpec("susep_active", "SUSEP ativa", "", "text", ("SUSEP Ativa?",), active=False),
    FieldSpec("susep_number", "Número SUSEP", "", "identifier", ("Número SUSEP",), active=False),
    FieldSpec("relationship_program", "Programa de relacionamento", "", "text",
              ("Programa Relacionamento",), active=False),
)

FIELDS_BY_KEY = {f.key: f for f in FIELDS}


@dataclass(frozen=True)
class Column:
    """Configuração em vigor de um campo: nomes aceitos, se é obrigatório e se é lido."""

    key: str
    headers: tuple[str, ...]
    required: bool
    active: bool

    @property
    def spec(self) -> FieldSpec:
        return FIELDS_BY_KEY[self.key]

    @property
    def label(self) -> str:
        return self.headers[0] if self.headers else self.spec.name


def default_columns() -> list[Column]:
    return [Column(f.key, f.headers, f.required, f.active) for f in FIELDS]


def header_key(value: object) -> str:
    return _HEADER_PUNCT.sub("", normalize_key(value)).strip()


_HEADER_PUNCT = re.compile(r"[^a-z0-9 ]+")
_TITLE_EXAM = re.compile(r"prova\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", re.IGNORECASE)
_TITLE_SPLIT = re.compile(r"\s+[-–—]\s+prova\b.*$", re.IGNORECASE)
_DATE_TEXT = re.compile(
    r"^(\d{1,2})/(\d{1,2})/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$"
)
_MONTH_TEXT = re.compile(r"^([a-zç]+)\.?\s*[/\-. ]\s*(\d{2}|\d{4})$")
_MONTH_NUMBER = re.compile(r"^(\d{1,2})[/\-.](\d{4})$")
# Abreviações em português e em inglês (o Excel pode exibir "Feb/2024" ou "fev/2024").
_MONTHS = {
    "jan": 1, "fev": 2, "feb": 2, "mar": 3, "abr": 4, "apr": 4, "mai": 5, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "aug": 8, "set": 9, "sep": 9, "out": 10, "oct": 10, "nov": 11,
    "dez": 12, "dec": 12,
}


class TemplateError(Exception):
    """A planilha não segue o padrão configurado (lote inteiro rejeitado)."""


@dataclass
class Issue:
    code: str
    message: str
    field: str | None = None
    raw_value: str | None = None
    severity: str = "error"


@dataclass
class ParsedRow:
    row_number: int
    values: dict[str, object]
    raw: dict[str, str | None]
    issues: list[Issue] = field(default_factory=list)

    @property
    def rejected(self) -> bool:
        return any(i.severity == "error" for i in self.issues)


@dataclass
class ParsedSheet:
    sheet_name: str
    title: str | None
    cohort_name: str | None
    exam_date: date | None
    rows: list[ParsedRow]
    missing_optional: list[str]
    issues: list[Issue] = field(default_factory=list)  # avisos que valem para a planilha toda
    has_cohort_column: bool = False


def _match_columns(header: list[object], columns: list[Column]) -> dict[str, int]:
    found: dict[str, int] = {}
    keys = [header_key(h) for h in header]
    for column in columns:
        if not column.active:
            continue
        for alias in column.headers:
            wanted = header_key(alias)
            index = next(
                (i for i, k in enumerate(keys) if k and k == wanted and i not in found.values()), None
            )
            if index is not None:
                found[column.key] = index
                break
    return found


def parse_title(title: str | None) -> tuple[str | None, date | None]:
    """ "SAFEE T61 - Prova 21/01/26" → ("SAFEE T61", 2026-01-21)."""
    if not title:
        return None, None
    exam: date | None = None
    match = _TITLE_EXAM.search(title)
    if match:
        day, month, year = (int(g) for g in match.groups())
        year = year + 2000 if year < 100 else year
        try:
            exam = date(year, month, day)
        except ValueError:
            exam = None
    cohort = clean(_TITLE_SPLIT.sub("", title))
    return cohort, exam


def _year(text: str) -> int:
    value = int(text)
    return value + 2000 if value < 100 else value


def parse_datetime(value: object) -> datetime | None:
    """Data do Excel, "dd/mm/aaaa [hh:mm[:ss]]" ou só mês e ano ("Nov/2023", "11/2023").

    Horário de Brasília. Quando vem só o mês, a data fica no dia 1º.
    """
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=LOCAL_TZ)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=LOCAL_TZ)
    text = str(value).strip()
    match = _DATE_TEXT.match(text)
    if match:
        day, month, year, hour, minute, second = match.groups()
        return datetime(
            _year(year), int(month), int(day), int(hour or 0), int(minute or 0), int(second or 0),
            tzinfo=LOCAL_TZ,
        )
    match = _MONTH_TEXT.match(normalize_key(text))
    if match and match.group(1)[:3] in _MONTHS:
        return datetime(_year(match.group(2)), _MONTHS[match.group(1)[:3]], 1, tzinfo=LOCAL_TZ)
    match = _MONTH_NUMBER.match(text)
    if match:
        return datetime(int(match.group(2)), int(match.group(1)), 1, tzinfo=LOCAL_TZ)
    raise ValueError(text)


def _as_identifier(value: object) -> str | None:
    """IDs, turma e números SUSEP: o Excel pode trazer 3094.0 ou texto; guardamos o texto limpo."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return clean(value)


def _as_integer(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError(str(value))
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    text = clean(value) or ""
    if re.fullmatch(r"\d+", text):
        return int(text)
    raise ValueError(text)


def _cell_text(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y" if value.time() == datetime.min.time() else "%d/%m/%Y %H:%M:%S")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return clean(value)


def _find_header(ws, columns: list[Column]) -> tuple[int, list[object], dict[str, int]] | None:
    required = [c.key for c in columns if c.active and c.required]
    for row_index, row in enumerate(
        ws.iter_rows(min_row=1, max_row=HEADER_SEARCH_ROWS, values_only=True), start=1
    ):
        header = list(row)
        found = _match_columns(header, columns)
        if all(key in found for key in required):
            return row_index, header, found
    return None


def parse_workbook(content: bytes, columns: list[Column] | None = None) -> ParsedSheet:
    columns = columns or default_columns()
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:  # arquivo corrompido ou não-XLSX
        raise TemplateError("Não foi possível abrir o arquivo como planilha Excel (.xlsx).") from exc

    try:
        for ws in wb.worksheets:
            located = _find_header(ws, columns)
            if located is None:
                continue
            header_row, header, found = located

            title = None
            for row in ws.iter_rows(min_row=1, max_row=header_row - 1, values_only=True):
                title = next((clean(v) for v in row if clean(v)), None) or title
                if title:
                    break
            cohort, exam = parse_title(title)

            rows: list[ParsedRow] = []
            seen: dict[object, int] = {}
            for row_number, row in enumerate(
                ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1
            ):
                cells = list(row)
                if not any(clean(c) for c in cells):
                    continue
                parsed = _parse_row(row_number, cells, header, found, cohort)
                _check_duplicate(parsed, seen)
                rows.append(parsed)

            missing = [c.label for c in columns if c.active and not c.required and c.key not in found]
            sheet = ParsedSheet(
                ws.title, title, cohort, exam, rows, missing, has_cohort_column="cohort_name" in found
            )
            if sheet.has_cohort_column:
                turmas = sorted({str(r.values["cohort_name"]) for r in rows if r.values.get("cohort_name")})
                if turmas:
                    sheet.cohort_name = ", ".join(turmas)[:120]
            sheet.issues.extend(_unknown_statuses(rows))
            return sheet
    finally:
        wb.close()

    required = ", ".join(c.label for c in columns if c.active and c.required)
    raise TemplateError(
        f"Nenhuma aba tem o cabeçalho esperado. Colunas obrigatórias: {required}. "
        "Confira o padrão em Administração > Padrão da planilha."
    )


def row_identity(values: dict[str, object]) -> tuple | None:
    """Chave da linha: o ID do cadastro, se houver; senão CPF (ou nome) + turma."""
    if values.get("external_record_id"):
        return ("id", values["external_record_id"])
    person = values.get("cpf") or normalize_key(values.get("full_name"))
    if not person:
        return None
    return ("person", person, values.get("cohort_name"))


def _check_duplicate(parsed: ParsedRow, seen: dict[object, int]) -> None:
    key = row_identity(parsed.values)
    if key is None:
        return
    if key in seen:
        if key[0] == "id":
            message = f"ID repetido na planilha (já aparece na linha {seen[key]})."
            parsed.issues.append(Issue("duplicate_id", message, "external_record_id", str(key[1])))
        else:
            message = f"Candidato repetido na mesma turma (já aparece na linha {seen[key]})."
            parsed.issues.append(Issue("duplicate_candidate", message, "full_name"))
    else:
        seen[key] = parsed.row_number


def _unknown_statuses(rows: list[ParsedRow]) -> list[Issue]:
    """Um aviso por status fora da lista oficial, com a quantidade de linhas."""
    counts = Counter(
        str(r.values["status"]) for r in rows
        if not r.rejected and r.values.get("status") and vgcf.lookup(r.values["status"]) is None
    )
    return [
        Issue(
            "status_unknown",
            f"Status fora da lista oficial VGCF em {n} linha{'s' if n > 1 else ''}. "
            "Ele foi cadastrado como novo status, sem classificação.",
            "status",
            value,
            severity="warning",
        )
        for value, n in counts.items()
    ]


def _parse_row(
    row_number: int,
    cells: list[object],
    header: list[object],
    found: dict[str, int],
    title_cohort: str | None,
) -> ParsedRow:
    def cell(key: str) -> object:
        index = found.get(key)
        return cells[index] if index is not None and index < len(cells) else None

    cpf_index = found.get("cpf")
    raw: dict[str, str | None] = {}
    for index, name in enumerate(header):
        label = clean(name) or f"Coluna {index + 1}"
        value = cells[index] if index < len(cells) else None
        # O CPF nunca fica em claro no registro original da linha.
        raw[label] = (mask_cpf(_cell_text(value)) or None) if index == cpf_index else _cell_text(value)

    parsed = ParsedRow(row_number=row_number, values={}, raw=raw)
    values = parsed.values

    for spec in FIELDS:
        value = cell(spec.key)
        if spec.kind == "identifier":
            values[spec.key] = _as_identifier(value)
        elif spec.kind == "cpf":
            values[spec.key] = _parse_cpf(parsed, value)
        elif spec.kind == "integer":
            try:
                values[spec.key] = _as_integer(value)
            except ValueError:
                values[spec.key] = None
                parsed.issues.append(
                    Issue("invalid_number", f"{spec.name}: número não reconhecido.", spec.key,
                          _cell_text(value), severity="warning")
                )
        elif spec.kind == "date":
            try:
                values[spec.key] = parse_datetime(value)
            except ValueError:
                values[spec.key] = None
                parsed.issues.append(
                    Issue(
                        "invalid_date",
                        f"{spec.name}: data não reconhecida (use dd/mm/aaaa ou mês/ano, como Nov/2023).",
                        spec.key, _cell_text(value), severity="warning",
                    )
                )
        else:
            values[spec.key] = clean(value)

    if not values["cohort_name"]:
        values["cohort_name"] = title_cohort

    if "external_record_id" in found and not values["external_record_id"]:
        parsed.issues.append(Issue("required", "ID não preenchido.", "external_record_id"))
    for key, label in (("agency", "Agência"), ("full_name", "Nome do candidato")):
        if not values[key]:
            parsed.issues.append(Issue("required", f"{label} não preenchido.", key))
    if "status" in found and not values["status"]:
        parsed.issues.append(
            Issue("status_empty", "Status não preenchido.", "status", severity="warning")
        )
    return parsed


def _parse_cpf(parsed: ParsedRow, value: object) -> str | None:
    text = _as_identifier(value)
    if not text:
        return None
    cpf = normalize_cpf(text)
    if cpf is None or not is_valid_cpf(cpf):
        parsed.issues.append(
            Issue("invalid_cpf", "CPF inválido; o candidato foi identificado pelo nome.", "cpf",
                  severity="warning")
        )
        return None
    return cpf
