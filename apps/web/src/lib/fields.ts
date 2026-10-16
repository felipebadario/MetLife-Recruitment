import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { SystemField } from "@/lib/types";

export const FIELDS_QUERY_KEY = ["catalog", "fields"];

/** Nomes dos campos definidos em Administração > Padrão da planilha, inclusive os campos novos. */
export function useSystemFields() {
  return useQuery({
    queryKey: FIELDS_QUERY_KEY,
    queryFn: () => api.get<SystemField[]>("/api/catalogs/fields"),
    staleTime: 5 * 60_000,
  });
}

/** Nome de um campo do sistema: o que o administrador definiu, ou o texto da tela quando não foi renomeado. */
export function fieldLabel(fields: SystemField[] | undefined, field: string, fallback: string) {
  const found = fields?.find((f) => f.field === field);
  return found && found.name !== found.default_name ? found.name : fallback;
}
