import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DialogContent, DialogRoot } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import type { ImportBatch, ImportDetail, ImportStatus, Page } from "@/lib/types";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";

const STATUS: Record<ImportStatus, { label: string; tone: "neutral" | "brand" | "positive" | "warning" | "danger" }> = {
  received: { label: "Na fila", tone: "neutral" },
  processing: { label: "Processando", tone: "brand" },
  completed: { label: "Concluída", tone: "positive" },
  completed_with_errors: { label: "Concluída com rejeições", tone: "warning" },
  failed: { label: "Falhou", tone: "danger" },
  skipped_duplicate: { label: "Arquivo repetido", tone: "neutral" },
};

const BATCHES_KEY = ["imports"] as const;

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function invalidateData(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["imports", "candidates", "candidates-summary", "candidate-options", "dashboard"]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

function UploadZone() {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => api.upload<ImportBatch>("/api/imports", file),
    onSuccess: () => invalidateData(queryClient),
  });

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) upload.mutate(file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  }

  const sample = useMutation({
    mutationFn: () => api.post<ImportBatch>("/api/imports/sample-load"),
    onSuccess: () => invalidateData(queryClient),
    onError: (e) => setSampleError(errorText(e, "Não foi possível importar a planilha fictícia.")),
  });
  const result = upload.data ?? sample.data;

  return (
    <Panel>
      <PanelHeader
        title="Importar planilha da turma"
        description="Arquivo .xlsx no modelo da turma: título com a turma e a data da prova, seguido do cabeçalho com ID, Agência, Nome, Status e demais colunas."
        actions={
          PREVIEW ? (
            <Button variant="secondary" size="sm" onClick={() => sample.mutate()} loading={sample.isPending}>
              <FileSpreadsheet className="size-4" aria-hidden />
              Importar planilha fictícia de teste
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                api.download("/api/imports/sample", "planilha_ficticia.xlsx").catch((e) => setSampleError(errorText(e, "Não foi possível baixar.")))
              }
            >
              <Download className="size-4" aria-hidden />
              Baixar planilha fictícia de teste
            </Button>
          )
        }
      />
      <div className="p-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-panel)] border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-brand-500 bg-brand-50" : "border-line-strong bg-surface/50",
          )}
        >
          <div className="grid size-12 place-items-center rounded-full bg-white text-brand-500 shadow-[var(--shadow-panel)]">
            <Upload className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Arraste a planilha aqui</p>
            <p className="text-[13px] text-muted">ou escolha o arquivo no computador (até 10 MB)</p>
          </div>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            id="import-file"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
          <Button onClick={() => input.current?.click()} loading={upload.isPending}>
            Escolher arquivo
          </Button>
        </div>
        {upload.error && <Alert className="mt-4">{errorText(upload.error, "Não foi possível enviar o arquivo.")}</Alert>}
        {sampleError && <Alert className="mt-4">{sampleError}</Alert>}
        {result && (
          <Alert tone="info" className="mt-4">
            {result.status === "skipped_duplicate"
              ? result.error_message
              : `Arquivo ${result.file_name} recebido. O resultado aparece na lista abaixo em instantes.`}
          </Alert>
        )}
        {PREVIEW && (
          <p className="mt-4 text-xs text-muted">
            Nesta pré-visualização a planilha é lida pelo próprio navegador: os dados não são enviados a nenhum servidor
            e ficam guardados só neste navegador.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">
          Reimportar uma planilha atualizada da mesma turma é seguro: candidaturas sem mudança ficam como estão, e
          mudanças de status entram no histórico de cada candidato.
        </p>
      </div>
    </Panel>
  );
}

function BatchDialog({ batchId, onClose }: { batchId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["imports", batchId],
    queryFn: () => api.get<ImportDetail>(`/api/imports/${batchId}`),
  });
  const reprocess = useMutation({
    mutationFn: () => api.post<ImportBatch>(`/api/imports/${batchId}/reprocess`),
    onSuccess: () => {
      invalidateData(queryClient);
      onClose();
    },
  });
  const b = detail.data?.batch;

  return (
    <DialogRoot open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Importação #${batchId}`} description={b?.file_name} className="max-w-2xl">
        {detail.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : detail.isError || !b ? (
          <Alert>{errorText(detail.error, "Não foi possível carregar a importação.")}</Alert>
        ) : (
          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
              {[
                ["Situação", <Badge key="s" tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>],
                ["Turma", b.cohort_name ?? "—"],
                ["Data da prova", formatDate(b.exam_date)],
                ["Linhas lidas", formatNumber(b.rows_total)],
                ["Criadas", formatNumber(b.rows_created)],
                ["Atualizadas", formatNumber(b.rows_updated)],
                ["Sem alteração", formatNumber(b.rows_unchanged)],
                ["Rejeitadas", formatNumber(b.rows_rejected)],
                ["Processada em", formatDateTime(b.finished_at)],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {b.error_message && <Alert>{b.error_message}</Alert>}
            <div>
              <h3 className="text-sm font-semibold">
                Inconsistências {detail.data.issues_total > 0 && `(${formatNumber(detail.data.issues_total)})`}
              </h3>
              {detail.data.issues.length === 0 ? (
                <p className="mt-1 text-[13px] text-muted">Nenhuma inconsistência encontrada.</p>
              ) : (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-line">
                  <table className="w-full text-left text-[13px]">
                    <thead className="sticky top-0 bg-surface text-muted">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Linha</th>
                        <th className="px-3 py-2 font-semibold">Tipo</th>
                        <th className="px-3 py-2 font-semibold">Mensagem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {detail.data.issues.map((issue) => (
                        <tr key={issue.id}>
                          <td className="tabular px-3 py-2 text-body">{issue.row_number ?? "—"}</td>
                          <td className="px-3 py-2">
                            <Badge tone={issue.severity === "error" ? "danger" : "warning"}>
                              {issue.severity === "error" ? "Linha rejeitada" : "Aviso"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-body">
                            {issue.message}
                            {issue.raw_value && <span className="text-muted"> Valor: {issue.raw_value}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {reprocess.error && <Alert>{errorText(reprocess.error, "Não foi possível reprocessar.")}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Fechar
              </Button>
              <Button variant="secondary" onClick={() => reprocess.mutate()} loading={reprocess.isPending}>
                <RotateCcw className="size-4" aria-hidden />
                Reprocessar arquivo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}

function ResetData() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const reset = useMutation({
    mutationFn: () => api.post("/api/imports/reset", { confirmation }),
    onSuccess: () => {
      invalidateData(queryClient);
      setOpen(false);
      setConfirmation("");
    },
  });
  return (
    <Panel className="border-danger-600/20">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <AlertTriangle className="size-4 text-danger-600" aria-hidden />
            Apagar candidatos e importações
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Remove todos os candidatos, candidaturas, históricos e importações. Usuários, auditoria e a classificação dos
            status continuam. Útil para trocar a planilha de teste pela real.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Apagar dados
        </Button>
      </div>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent title="Apagar candidatos e importações" description="Essa ação não pode ser desfeita.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reset.mutate();
            }}
            className="flex flex-col gap-4"
          >
            <Field label="Digite APAGAR para confirmar">
              {(p) => <Input {...p} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />}
            </Field>
            {reset.error && <Alert>{errorText(reset.error, "Não foi possível apagar.")}</Alert>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="danger" loading={reset.isPending} disabled={confirmation.trim().toUpperCase() !== "APAGAR"}>
                Apagar dados
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </Panel>
  );
}

export function ImportsPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const batches = useQuery({
    queryKey: BATCHES_KEY,
    queryFn: () => api.get<Page<ImportBatch>>("/api/imports?page_size=50"),
    // Enquanto houver lote na fila ou processando, atualiza a lista sozinha.
    refetchInterval: (q) =>
      q.state.data?.items.some((b) => b.status === "received" || b.status === "processing") ? 2000 : false,
  });

  return (
    <div className="flex flex-col gap-6">
      <UploadZone />
      <Panel>
        <PanelHeader title="Histórico de importações" description="Cada arquivo recebido, com o resultado do processamento." />
        {batches.isPending ? (
          <div className="flex flex-col gap-2.5 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : batches.isError ? (
          <div className="p-5">
            <Alert>{errorText(batches.error, "Não foi possível carregar as importações.")}</Alert>
          </div>
        ) : batches.data.items.length === 0 ? (
          <EmptyState icon={FileSpreadsheet} title="Nenhuma planilha importada ainda" description="O histórico aparece aqui depois do primeiro envio." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="bg-surface/60 text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Arquivo</th>
                  <th className="px-5 py-2.5 font-semibold">Turma</th>
                  <th className="px-5 py-2.5 font-semibold">Recebido em</th>
                  <th className="px-5 py-2.5 font-semibold">Situação</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Criadas</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Atualizadas</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Rejeitadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {batches.data.items.map((b) => (
                  <tr
                    key={b.id}
                    tabIndex={0}
                    onClick={() => setSelected(b.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(b.id)}
                    className="cursor-pointer hover:bg-brand-50/50"
                  >
                    <td className="max-w-64 truncate px-5 py-2.5 font-medium text-ink">{b.file_name}</td>
                    <td className="px-5 py-2.5">{b.cohort_name ?? "—"}</td>
                    <td className="tabular px-5 py-2.5 whitespace-nowrap">{formatDateTime(b.received_at)}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={STATUS[b.status].tone} dot>
                        {STATUS[b.status].label}
                      </Badge>
                    </td>
                    <td className="tabular px-5 py-2.5 text-right">{formatNumber(b.rows_created)}</td>
                    <td className="tabular px-5 py-2.5 text-right">{formatNumber(b.rows_updated)}</td>
                    <td className={cn("tabular px-5 py-2.5 text-right", b.rows_rejected > 0 && "font-semibold text-danger-600")}>
                      {formatNumber(b.rows_rejected)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <ResetData />
      {selected != null && <BatchDialog batchId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
