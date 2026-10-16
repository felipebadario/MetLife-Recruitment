import type { Outcome } from "./types";

/**
 * Categorias de resultado: ordem e cores fixas em todo o produto (a cor segue a categoria,
 * nunca a posição). Paleta validada para daltonismo nessa ordem; sempre acompanhada de
 * rótulo ou legenda — a cor nunca carrega o significado sozinha.
 */
export const OUTCOME_ORDER: Outcome[] = ["hired", "approved", "in_progress", "rejected", "withdrawn", "unmapped"];

export const OUTCOME_LABELS: Record<Outcome, string> = {
  hired: "Contratado",
  approved: "Aprovado",
  in_progress: "Em andamento",
  rejected: "Reprovado",
  withdrawn: "Desistência",
  unmapped: "Não classificado",
};

export const OUTCOME_COLORS: Record<Outcome, string> = {
  hired: "#5E8F1B",
  approved: "#0061A0",
  in_progress: "#4FA3D9",
  rejected: "#C2412C",
  withdrawn: "#D39A1E",
  unmapped: "#AAB4C0",
};

export const OUTCOME_TONES: Record<Outcome, "positive" | "brand" | "neutral" | "danger" | "warning"> = {
  hired: "positive",
  approved: "brand",
  in_progress: "neutral",
  rejected: "danger",
  withdrawn: "warning",
  unmapped: "neutral",
};

export function formatRate(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
