import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, withQuery } from "@/lib/api";
import type { AuditLog, Page } from "@/lib/types";
import { formatDateTime, formatNumber } from "@/lib/utils";

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<string, { label: string; tone: "neutral" | "brand" | "positive" | "warning" | "danger" }> = {
  "auth.login_success": { label: "Entrou", tone: "positive" },
  "auth.login_failed": { label: "Falha de login", tone: "warning" },
  "auth.login_locked": { label: "Login bloqueado", tone: "danger" },
  "auth.logout": { label: "Saiu", tone: "neutral" },
  "auth.password_changed": { label: "Alterou a senha", tone: "brand" },
  "user.created": { label: "Criou usuário", tone: "brand" },
  "user.updated": { label: "Editou usuário", tone: "brand" },
  "user.password_reset": { label: "Redefiniu senha", tone: "brand" },
  "security.access_denied": { label: "Acesso negado", tone: "danger" },
  "imports.uploaded": { label: "Enviou planilha", tone: "brand" },
  "imports.reprocessed": { label: "Reprocessou planilha", tone: "brand" },
  "imports.deleted": { label: "Excluiu planilha", tone: "warning" },
  "imports.data_reset": { label: "Apagou os dados", tone: "danger" },
  "catalog.status_updated": { label: "Classificou status", tone: "brand" },
  "catalog.metric_updated": { label: "Alterou fórmula", tone: "brand" },
  "candidates.exported": { label: "Exportou candidatos", tone: "neutral" },
  "candidates.note_added": { label: "Registrou observação", tone: "neutral" },
  "audit.purged": { label: "Limpeza da auditoria", tone: "neutral" },
};

const FILTERS = [
  { value: "", label: "Todas as ações" },
  { value: "auth.", label: "Acessos" },
  { value: "user.", label: "Gestão de usuários" },
  { value: "security.", label: "Segurança" },
  { value: "imports.", label: "Importações" },
  { value: "catalog.", label: "Catálogos" },
  { value: "candidates.", label: "Candidatos" },
  { value: "audit.", label: "Limpeza da auditoria" },
];

interface Retention {
  access_retention_days: number;
  retention_days: number;
  last_purge_at: string | null;
}

function describe(log: AuditLog): string {
  if (!log.details) return "";
  return Object.entries(log.details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(", ");
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const logs = useQuery({
    queryKey: ["admin", "audit", page, action],
    queryFn: () => api.get<Page<AuditLog>>(withQuery("/api/admin/audit-logs", { page, page_size: PAGE_SIZE, action })),
    placeholderData: keepPreviousData,
  });

  const retention = useQuery({
    queryKey: ["admin", "audit", "retention"],
    queryFn: () => api.get<Retention>("/api/admin/audit-logs/retention"),
  });

  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / PAGE_SIZE)) : 1;

  return (
    <Panel>
      <PanelHeader
        title="Auditoria"
        description={
          retention.data
            ? `Registro de acessos e ações relevantes, que não pode ser editado. Acessos (entradas, saídas e acessos negados) ficam ${retention.data.access_retention_days} dias; as demais ações, ${retention.data.retention_days} dias. A limpeza é automática${retention.data.last_purge_at ? ` (última em ${formatDateTime(retention.data.last_purge_at)})` : ""}.`
            : "Registro de acessos e ações relevantes, que não pode ser editado."
        }
        actions={
          <Select
            aria-label="Filtrar por tipo de ação"
            className="h-8 w-48 text-[13px]"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        }
      />

      {logs.isPending ? (
        <div className="flex flex-col gap-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : logs.isError ? (
        <div className="p-5">
          <Alert>{logs.error instanceof ApiError ? logs.error.message : "Não foi possível carregar a auditoria."}</Alert>
        </div>
      ) : logs.data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum registro para este filtro" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-surface/60 text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Quando</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Quem</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Ação</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Detalhes</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.data.items.map((log) => {
                  const meta = ACTION_LABELS[log.action] ?? { label: log.action, tone: "neutral" as const };
                  return (
                    <tr key={log.id}>
                      <td className="tabular px-5 py-2.5 whitespace-nowrap text-body">{formatDateTime(log.created_at)}</td>
                      <td className="px-5 py-2.5 text-ink">{log.actor_email ?? "—"}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="max-w-xs truncate px-5 py-2.5 text-muted" title={describe(log)}>
                        {describe(log) || "—"}
                      </td>
                      <td className="tabular px-5 py-2.5 text-muted">{log.ip_address ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-muted">
            <span className="tabular">{formatNumber(logs.data.total)} registros</span>
            <div className="flex items-center gap-2">
              <span className="tabular">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Página anterior"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                aria-label="Próxima página"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
