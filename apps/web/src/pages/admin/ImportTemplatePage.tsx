import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import { FIELDS_QUERY_KEY } from "@/lib/fields";
import type { ImportTemplate, ImportTemplateColumn } from "@/lib/types";

const QUERY_KEY = ["catalog", "import-template"];

/** Linha em edição: os nomes ficam como texto até salvar. */
interface Draft {
  /** Chave local da linha (campo novo ainda não tem `field`). */
  id: string;
  field: string | null;
  name: string;
  headers: string;
  required: boolean;
  active: boolean;
}

const KIND_HINT: Record<ImportTemplateColumn["kind"], string> = {
  text: "Texto",
  identifier: "Texto ou número",
  cpf: "CPF",
  date: "Data ou mês/ano",
  integer: "Número",
};

function toDrafts(template: ImportTemplate): Draft[] {
  return template.columns.map((c) => ({
    id: c.field,
    field: c.field,
    name: c.name,
    headers: c.headers.join(", "),
    required: c.required,
    active: c.active,
  }));
}

function splitHeaders(text: string) {
  return text
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Não foi possível salvar.";
}

export function ImportTemplatePage() {
  const queryClient = useQueryClient();
  const template = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<ImportTemplate>("/api/admin/import-template"),
  });
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (template.data) setDrafts(toDrafts(template.data));
  }, [template.data]);

  const onSaved = (data: ImportTemplate) => {
    queryClient.setQueryData(QUERY_KEY, data);
    void queryClient.invalidateQueries({ queryKey: FIELDS_QUERY_KEY });
    setSaved(true);
  };
  const save = useMutation({
    mutationFn: () =>
      api.put<ImportTemplate>("/api/admin/import-template", {
        columns: (drafts ?? []).map(({ id: _id, ...d }) => ({ ...d, name: d.name.trim(), headers: splitHeaders(d.headers) })),
      }),
    onSuccess: onSaved,
  });
  const reset = useMutation({
    mutationFn: () => api.delete<ImportTemplate>("/api/admin/import-template"),
    onSuccess: onSaved,
  });

  const dirty =
    !!template.data &&
    !!drafts &&
    JSON.stringify(toDrafts(template.data)) !==
      JSON.stringify(drafts.map((d) => ({ ...d, name: d.name.trim(), headers: splitHeaders(d.headers).join(", ") })));

  function edit(update: (current: Draft[]) => Draft[]) {
    setSaved(false);
    save.reset();
    setDrafts((current) => (current ? update(current) : null));
  }

  function change(id: string, patch: Partial<Draft>) {
    edit((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addField() {
    const id = `novo-${Date.now()}`;
    edit((current) => [...current, { id, field: null, name: "", headers: "", required: false, active: true }]);
  }

  return (
    <Panel>
      <PanelHeader
        title="Padrão da planilha"
        description="Quais colunas a importação lê nas planilhas das turmas e com que nome elas aparecem no cabeçalho. Maiúsculas, acentos e pontuação não fazem diferença, e a ordem das colunas não importa."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                api
                  .download("/api/admin/import-template/sample", "modelo_planilha_turma.xlsx")
                  .then(() => setDownloadError(null))
                  .catch((e) => setDownloadError(errorText(e)))
              }
            >
              <Download className="size-4" aria-hidden />
              Baixar modelo
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={template.data?.is_default}
              loading={reset.isPending}
              onClick={() => {
                if (window.confirm("Voltar ao padrão inicial? As alterações feitas aqui serão desfeitas.")) reset.mutate();
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Restaurar padrão
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3 px-5 pt-4">
        <Alert tone="info">
          O nome do campo no sistema é o que aparece na tela de Candidatos e na exportação. Para aceitar mais de um nome
          na mesma coluna, separe por vírgula (o primeiro é o principal). Coluna obrigatória que não estiver na planilha
          impede a importação do arquivo; as demais só geram aviso. Colunas que não estão aqui são guardadas no registro
          original da linha; para mostrá-las na tela de Candidatos, inclua um campo novo.
        </Alert>
        {downloadError && <Alert>{downloadError}</Alert>}
      </div>

      {template.isPending || !drafts ? (
        <div className="flex flex-col gap-2.5 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : template.isError ? (
        <div className="p-5">
          <Alert>{errorText(template.error)}</Alert>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="bg-surface/60 text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Campo no sistema</th>
                  <th className="px-5 py-2.5 font-semibold">Nome da coluna na planilha</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Ler</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Obrigatória</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">Retirar</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {drafts.map((draft) => {
                  const column = template.data.columns.find((c) => c.field === draft.field);
                  const custom = !column || column.custom;
                  const label = draft.name.trim() || "campo novo";
                  return (
                    <tr key={draft.id} className={draft.active ? undefined : "bg-surface/40"}>
                      <td className="px-5 py-3 align-top">
                        <Input
                          aria-label={`Nome no sistema de ${label}`}
                          value={draft.name}
                          maxLength={80}
                          placeholder="Nome do campo"
                          onChange={(e) => change(draft.id, { name: e.target.value })}
                          className={draft.active ? "h-9 text-[13px] font-semibold" : "h-9 text-[13px] font-semibold text-muted"}
                        />
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {column?.locked && <Badge>Sempre lida</Badge>}
                          {custom && <Badge tone="brand">Campo novo</Badge>}
                          <p className="max-w-xs text-xs text-muted">
                            {column && !custom ? column.description || KIND_HINT[column.kind] : "Texto, guardado como veio na planilha."}
                          </p>
                        </div>
                        {column?.default_name && draft.name.trim() !== column.default_name && (
                          <p className="mt-1 text-xs text-muted">Nome inicial: {column.default_name}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 align-top">
                        <Input
                          aria-label={`Nome da coluna de ${label}`}
                          value={draft.headers}
                          maxLength={400}
                          disabled={!draft.active}
                          placeholder={custom ? draft.name.trim() || "Igual ao nome do campo" : undefined}
                          onChange={(e) => change(draft.id, { headers: e.target.value })}
                          className="h-9 text-[13px]"
                        />
                        {column && !custom && splitHeaders(draft.headers).join(", ") !== column.default_headers.join(", ") && (
                          <p className="mt-1 text-xs text-muted">Padrão inicial: {column.default_headers.join(", ")}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center align-top">
                        <input
                          type="checkbox"
                          aria-label={`Ler a coluna ${label}`}
                          className="mt-2.5 size-4 accent-brand-500"
                          checked={draft.active}
                          disabled={column?.locked}
                          onChange={(e) =>
                            change(draft.id, { active: e.target.checked, required: e.target.checked && draft.required })
                          }
                        />
                      </td>
                      <td className="px-3 py-3 text-center align-top">
                        <input
                          type="checkbox"
                          aria-label={`Coluna ${label} obrigatória`}
                          className="mt-2.5 size-4 accent-brand-500"
                          checked={draft.required}
                          disabled={column?.locked || !draft.active}
                          onChange={(e) => change(draft.id, { required: e.target.checked })}
                        />
                      </td>
                      <td className="px-3 py-3 text-right align-top">
                        {custom && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Retirar o campo ${label}`}
                            title="Retirar campo"
                            onClick={() => {
                              if (
                                !draft.field ||
                                window.confirm(
                                  `Retirar o campo “${label}”? Ele some da tela de Candidatos; os valores já importados continuam no registro original da linha.`,
                                )
                              )
                                edit((current) => current.filter((d) => d.id !== draft.id));
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3">
            <Button type="button" variant="secondary" size="sm" onClick={addField}>
              <Plus className="size-4" aria-hidden />
              Incluir campo
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-3">
            {save.error && <p className="mr-auto text-[13px] text-danger-600">{errorText(save.error)}</p>}
            {reset.error && <p className="mr-auto text-[13px] text-danger-600">{errorText(reset.error)}</p>}
            {saved && !dirty && <p className="mr-auto text-[13px] text-green-700">Padrão salvo. Vale para as próximas importações.</p>}
            <Button
              variant="secondary"
              type="button"
              disabled={!dirty}
              onClick={() => {
                save.reset();
                setDrafts(toDrafts(template.data));
              }}
            >
              Descartar alterações
            </Button>
            <Button type="submit" disabled={!dirty} loading={save.isPending}>
              <Save className="size-4" aria-hidden />
              Salvar padrão
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
