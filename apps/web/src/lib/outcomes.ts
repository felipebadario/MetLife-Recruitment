import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "./api";
import type { Outcome, OutcomeCategory } from "./types";

/**
 * Classificações de resultado. Ficam no banco e o administrador cria, renomeia e exclui em
 * Status e catálogos; aqui ficam só as seis que vêm cadastradas, usadas enquanto a lista
 * carrega. A cor segue a classificação, nunca a posição, e vem sempre com rótulo ou legenda:
 * a cor nunca carrega o significado sozinha. A paleta padrão foi validada para daltonismo.
 */
export const UNMAPPED: Outcome = "unmapped";

export const DEFAULT_OUTCOMES: OutcomeCategory[] = [
  { code: "hired", label: "Contratado", color: "#5E8F1B", is_system: false },
  { code: "approved", label: "Aprovado", color: "#0061A0", is_system: false },
  { code: "in_progress", label: "Em andamento", color: "#4FA3D9", is_system: false },
  { code: "rejected", label: "Reprovado", color: "#C2412C", is_system: false },
  { code: "withdrawn", label: "Desistência", color: "#D39A1E", is_system: false },
  { code: UNMAPPED, label: "Não classificado", color: "#AAB4C0", is_system: true },
];

/** Sugestões de cor para classificações novas (distintas da paleta padrão). */
export const EXTRA_COLORS = ["#7B5EA7", "#2A9D8F", "#B5578C", "#8C6D46", "#3F5873", "#E07B39"];

type Tone = "positive" | "brand" | "neutral" | "danger" | "warning";

const DEFAULT_TONES: Record<string, Tone> = {
  hired: "positive",
  approved: "brand",
  in_progress: "neutral",
  rejected: "danger",
  withdrawn: "warning",
  unmapped: "neutral",
};

export interface OutcomeCatalog {
  categories: OutcomeCategory[];
  /** Todas, na ordem de exibição ("não classificado" por último). */
  order: Outcome[];
  /** As que podem ser escolhidas para um status (sem "não classificado"). */
  classifiable: Outcome[];
  label: (code: Outcome) => string;
  color: (code: Outcome) => string;
}

/** Tom do selo de status. Classificações novas usam o neutro (a cor fica nos gráficos). */
export function outcomeTone(code: Outcome): Tone {
  return DEFAULT_TONES[code] ?? "neutral";
}

export function buildCatalog(categories: OutcomeCategory[]): OutcomeCatalog {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  return {
    categories,
    order: categories.map((c) => c.code),
    classifiable: categories.filter((c) => !c.is_system).map((c) => c.code),
    label: (code) => byCode.get(code)?.label ?? code,
    color: (code) => byCode.get(code)?.color ?? "#AAB4C0",
  };
}

export const DEFAULT_CATALOG = buildCatalog(DEFAULT_OUTCOMES);

/** Classificações cadastradas (para qualquer usuário logado). */
export function useOutcomes(): OutcomeCatalog {
  const query = useQuery({
    queryKey: ["catalog", "outcomes", "public"],
    queryFn: () => api.get<OutcomeCategory[]>("/api/catalogs/outcomes"),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => (query.data ? buildCatalog(query.data) : DEFAULT_CATALOG), [query.data]);
}

export function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
