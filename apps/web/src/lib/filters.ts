import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { Outcome } from "./types";

/** Filtros globais. Ficam na URL: a tela pode ser recarregada ou compartilhada com o recorte. */
export interface Filters {
  search: string;
  agency_id: string[];
  regional: string[];
  status_id: string[];
  outcome: Outcome[];
  cohort: string[];
  program: string[];
  susep_active: string[];
  date_from: string;
  date_to: string;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  agency_id: [],
  regional: [],
  status_id: [],
  outcome: [],
  cohort: [],
  program: [],
  susep_active: [],
  date_from: "",
  date_to: "",
};

const LIST_KEYS = ["agency_id", "regional", "status_id", "outcome", "cohort", "program", "susep_active"] as const;
type ListKey = (typeof LIST_KEYS)[number];

export function filtersFromSearch(params: URLSearchParams): Filters {
  const filters: Filters = { ...EMPTY_FILTERS };
  for (const key of LIST_KEYS) {
    (filters[key] as string[]) = params.getAll(key);
  }
  filters.search = params.get("search") ?? "";
  filters.date_from = params.get("date_from") ?? "";
  filters.date_to = params.get("date_to") ?? "";
  return filters;
}

export function filtersToQuery(filters: Filters): Record<string, string | string[]> {
  return { ...filters };
}

export function activeFilterCount(filters: Filters): number {
  return (
    LIST_KEYS.reduce((n, key) => n + (filters[key].length ? 1 : 0), 0) +
    (filters.date_from || filters.date_to ? 1 : 0) +
    (filters.search ? 1 : 0)
  );
}

export function useFilters(extraKeys: string[] = []) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromSearch(params), [params]);

  const setFilters = useCallback(
    (next: Partial<Filters>) => {
      setParams(
        (current) => {
          const merged = { ...filtersFromSearch(current), ...next };
          const out = new URLSearchParams();
          for (const key of extraKeys) {
            const value = current.get(key);
            if (value && !(key === "page")) out.set(key, value);
          }
          for (const key of LIST_KEYS) for (const v of merged[key]) out.append(key, v);
          if (merged.search) out.set("search", merged.search);
          if (merged.date_from) out.set("date_from", merged.date_from);
          if (merged.date_to) out.set("date_to", merged.date_to);
          return out;
        },
        { replace: true },
      );
    },
    [setParams, extraKeys],
  );

  const clear = useCallback(() => setFilters(EMPTY_FILTERS), [setFilters]);
  return { filters, setFilters, clear, params, setParams };
}

export type { ListKey };
export { LIST_KEYS };
