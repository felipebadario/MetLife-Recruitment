import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { activeFilterCount, type Filters } from "@/lib/filters";
import { OUTCOME_LABELS, OUTCOME_ORDER } from "@/lib/outcomes";
import type { FilterOptions, Outcome } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
  count?: number;
  hint?: string;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const active = selected.length > 0;
  const summary = !active
    ? label
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? label)
      : `${label}: ${selected.length}`;

  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className={cn(
          "inline-flex h-9 max-w-56 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-[13px] font-medium transition-colors",
          active
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-line-strong bg-white text-body hover:border-brand-300",
        )}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-80 w-64 animate-fade-in overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-white p-1.5 shadow-[var(--shadow-overlay)]"
        >
          {options.length === 0 && <p className="px-2.5 py-2 text-[13px] text-muted">Sem opções na base.</p>}
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <Dropdown.CheckboxItem
                key={option.value}
                checked={checked}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(next) =>
                  onChange(next ? [...selected, option.value] : selected.filter((v) => v !== option.value))
                }
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-body outline-none select-none data-[highlighted]:bg-brand-50"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border",
                    checked ? "border-brand-500 bg-brand-500 text-white" : "border-line-strong",
                  )}
                >
                  {checked && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{option.label}</span>
                  {option.hint && <span className="block text-xs text-muted">{option.hint}</span>}
                </span>
                {option.count != null && (
                  <span className="tabular text-xs text-muted">{formatNumber(option.count)}</span>
                )}
              </Dropdown.CheckboxItem>
            );
          })}
          {active && (
            <>
              <Dropdown.Separator className="my-1 h-px bg-line" />
              <Dropdown.Item
                onSelect={() => onChange([])}
                className="cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] text-brand-600 outline-none data-[highlighted]:bg-brand-50"
              >
                Limpar seleção
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft.trim()), 350);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Buscar por nome, ID ou sub-representante"
        aria-label="Buscar candidatos"
        className="h-9 pl-9 text-[13px]"
      />
    </div>
  );
}

export function FilterBar({
  filters,
  options,
  onChange,
  onClear,
  withSearch = false,
  actions,
}: {
  filters: Filters;
  options: FilterOptions | undefined;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
  withSearch?: boolean;
  actions?: ReactNode;
}) {
  const count = activeFilterCount(filters);
  const outcomes: Option[] = OUTCOME_ORDER.map((o) => ({ value: o, label: OUTCOME_LABELS[o] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {withSearch && <SearchBox value={filters.search} onChange={(search) => onChange({ search })} />}
        <MultiSelect
          label="Agência"
          selected={filters.agency_id}
          onChange={(agency_id) => onChange({ agency_id })}
          options={(options?.agencies ?? []).map((a) => ({ value: String(a.id), label: a.name, count: a.count }))}
        />
        <MultiSelect
          label="Regional"
          selected={filters.regional}
          onChange={(regional) => onChange({ regional })}
          options={(options?.regionals ?? []).map((r) => ({ value: r.value, label: r.value, count: r.count }))}
        />
        <MultiSelect
          label="Representante"
          selected={filters.sub_representative}
          onChange={(sub_representative) => onChange({ sub_representative })}
          options={(options?.sub_representatives ?? []).map((r) => ({
            value: r.value,
            label: r.value,
            count: r.count,
            hint: r.agencies.join(", "),
          }))}
        />
        <MultiSelect
          label="Turma"
          selected={filters.cohort}
          onChange={(cohort) => onChange({ cohort })}
          options={(options?.cohorts ?? []).map((c) => ({
            value: c.value,
            label: c.value,
            count: c.count,
            hint: c.exam_date ? `Prova em ${formatDate(c.exam_date)}` : undefined,
          }))}
        />
        <MultiSelect
          label="Status"
          selected={filters.status_id}
          onChange={(status_id) => onChange({ status_id })}
          options={(options?.statuses ?? []).map((s) => ({
            value: String(s.id),
            label: s.label,
            count: s.count,
            hint: OUTCOME_LABELS[s.outcome],
          }))}
        />
        <MultiSelect
          label="Classificação"
          selected={filters.outcome}
          onChange={(outcome) => onChange({ outcome: outcome as Outcome[] })}
          options={outcomes}
        />
        <MultiSelect
          label="SUSEP ativa"
          selected={filters.susep_active}
          onChange={(susep_active) => onChange({ susep_active })}
          options={(options?.susep_active ?? []).map((r) => ({ value: r.value, label: r.value, count: r.count }))}
        />
        <MultiSelect
          label="Programa"
          selected={filters.program}
          onChange={(program) => onChange({ program })}
          options={(options?.programs ?? []).map((r) => ({ value: r.value, label: r.value, count: r.count }))}
        />
        <div className="flex items-center gap-1.5 text-[13px] text-muted">
          <label htmlFor="date-from">Cadastro de</label>
          <Input
            id="date-from"
            type="date"
            value={filters.date_from}
            min={options?.date_min ?? undefined}
            max={filters.date_to || (options?.date_max ?? undefined)}
            onChange={(e) => onChange({ date_from: e.target.value })}
            className="h-9 w-[9.5rem] px-2 text-[13px]"
          />
          <label htmlFor="date-to">até</label>
          <Input
            id="date-to"
            type="date"
            value={filters.date_to}
            min={filters.date_from || (options?.date_min ?? undefined)}
            max={options?.date_max ?? undefined}
            onChange={(e) => onChange({ date_to: e.target.value })}
            className="h-9 w-[9.5rem] px-2 text-[13px]"
          />
        </div>
        {count > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-3.5" aria-hidden />
            Limpar filtros ({count})
          </Button>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
