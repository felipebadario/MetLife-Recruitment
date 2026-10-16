import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, FilePen, FileSpreadsheet, LogIn, MessageSquareText } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sheet, Tabs } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import { outcomeTone, useOutcomes } from "@/lib/outcomes";
import type { ApplicationDetail, TimelineEvent } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

type Tab = "personal" | "profile" | "process" | "history";

const TABS: { value: Tab; label: string }[] = [
  { value: "personal", label: "Dados pessoais" },
  { value: "profile", label: "Perfil profissional" },
  { value: "process", label: "Processo seletivo" },
  { value: "history", label: "Histórico" },
];

function Fields({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[13px] text-muted">{label}</dt>
          <dd className="mt-0.5 text-sm break-words text-ink">{value ?? <span className="text-muted">Não informado</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

const EVENT_ICONS: Record<TimelineEvent["kind"], typeof LogIn> = {
  created: LogIn,
  status: ArrowRightLeft,
  field: FilePen,
  note: MessageSquareText,
};

function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-line">
      {events.map((event, index) => {
        const Icon = EVENT_ICONS[event.kind];
        return (
          <li key={index} className="relative flex gap-3">
            <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white text-brand-500">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium text-ink">{event.title}</p>
              {event.detail && <p className="mt-0.5 text-[13px] whitespace-pre-wrap text-body">{event.detail}</p>}
              <p className="mt-1 text-xs text-muted">
                {formatDateTime(event.at)}
                {event.author && ` por ${event.author}`}
                {event.source && `, arquivo ${event.source}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function NoteForm({ applicationId }: { applicationId: number }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.post(`/api/applications/${applicationId}/notes`, { body }),
    onSuccess: () => {
      setBody("");
      void queryClient.invalidateQueries({ queryKey: ["application", applicationId] });
    },
  });
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (body.trim()) mutation.mutate();
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="note" className="text-[13px] font-semibold text-ink">
        Nova observação interna
      </label>
      <textarea
        id="note"
        rows={3}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Visível apenas para a equipe interna."
        className="w-full rounded-[var(--radius-control)] border border-line-strong px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none"
      />
      {mutation.error && (
        <Alert>{mutation.error instanceof ApiError ? mutation.error.message : "Não foi possível salvar."}</Alert>
      )}
      <Button type="submit" size="sm" className="self-end" loading={mutation.isPending} disabled={!body.trim()}>
        Salvar observação
      </Button>
    </form>
  );
}

export function CandidateSheet({ applicationId, onClose }: { applicationId: number | null; onClose: () => void }) {
  const catalog = useOutcomes();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("personal");
  const detail = useQuery({
    queryKey: ["application", applicationId],
    queryFn: () => api.get<ApplicationDetail>(`/api/applications/${applicationId}`),
    enabled: applicationId != null,
  });
  const data = detail.data;
  const app = data?.application;

  return (
    <Sheet
      open={applicationId != null}
      onOpenChange={(open) => !open && onClose()}
      title={app?.full_name ?? "Carregando…"}
      description={app ? `${app.agency_name}, ID ${app.external_record_id ?? "—"}` : undefined}
    >
      {detail.isPending ? (
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : detail.isError || !data || !app ? (
        <div className="p-6">
          <Alert>{detail.error instanceof ApiError ? detail.error.message : "Não foi possível carregar o candidato."}</Alert>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-6 pt-4 pb-3">
            <Badge tone={outcomeTone(app.status.outcome)} dot>
              {app.status.label ?? "Sem status"}
            </Badge>
            <span className="text-[13px] text-muted">{catalog.label(app.status.outcome)}</span>
            {app.is_demo && <Badge tone="warning">Dado de demonstração</Badge>}
          </div>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <div className="px-6 py-6">
            {tab === "personal" && (
              <div className="flex flex-col gap-6">
                <Fields
                  items={[
                    ["Nome", app.full_name],
                    ["ID do registro", app.external_record_id],
                    ["Cadastro no site", app.registered_at ? formatDateTime(app.registered_at) : null],
                  ]}
                />
                <p className="text-[13px] text-muted">
                  O modelo atual da planilha não traz CPF, contato nem endereço.
                </p>
              </div>
            )}
            {tab === "profile" && (
              <Fields
                items={[
                  ["Agência", app.agency_name],
                  ["Regional", app.regional],
                  ["Sub-representante", app.sub_representative],
                  ["Programa de relacionamento", app.relationship_program],
                  ["SUSEP ativa", app.susep_active],
                  ["Número SUSEP", app.susep_number],
                ]}
              />
            )}
            {tab === "process" && (
              <div className="flex flex-col gap-8">
                <Fields
                  items={[
                    ["Turma", app.cohort_name],
                    ["Data da prova", app.exam_date ? formatDate(app.exam_date) : null],
                    ["Status na planilha", app.status_raw],
                    ["Classificação", catalog.label(app.status.outcome)],
                    ["Importado pela primeira vez", data.first_import?.file_name ?? null],
                  ]}
                />
                <div>
                  <h3 className="text-sm font-semibold">Outras candidaturas desta pessoa</h3>
                  {data.other_applications.length === 0 ? (
                    <p className="mt-1 text-[13px] text-muted">Nenhuma outra candidatura registrada.</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-line rounded-[var(--radius-control)] border border-line">
                      {data.other_applications.map((other) => (
                        <li key={other.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                          <span className="min-w-0">
                            <span className="font-medium text-ink">{other.cohort_name ?? "Sem turma"}</span>
                            <span className="text-muted">, {other.agency_name}</span>
                          </span>
                          <Badge tone={outcomeTone(other.status.outcome)}>{other.status.label ?? "—"}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {tab === "history" && (
              <div className="flex flex-col gap-8">
                {can("candidates.notes_write") && <NoteForm applicationId={app.id} />}
                {data.timeline.length ? (
                  <Timeline events={data.timeline} />
                ) : (
                  <p className="text-[13px] text-muted">Sem eventos registrados.</p>
                )}
              </div>
            )}
          </div>
          {data.raw_payload && tab === "process" && (
            <details className="mx-6 mb-6 rounded-[var(--radius-control)] border border-line bg-surface/60 px-4 py-3 text-[13px]">
              <summary className="flex cursor-pointer items-center gap-2 font-medium text-ink">
                <FileSpreadsheet className="size-4 text-muted" aria-hidden />
                Linha original da planilha
              </summary>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {Object.entries(data.raw_payload).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted">{key}</dt>
                    <dd className="break-words text-ink">{value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </>
      )}
    </Sheet>
  );
}
