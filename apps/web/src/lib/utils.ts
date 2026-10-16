import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const numberFormat = new Intl.NumberFormat("pt-BR");

/** A API devolve datas em UTC; datas sem fuso (SQLite) também são tratadas como UTC. */
function parseApiDate(value: string): Date {
  // Data sem horário (ex.: data de cadastro): interpretar no fuso local, sem deslocar o dia.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value}Z`);
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormat.format(parseApiDate(value)) : "—";
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormat.format(parseApiDate(value)) : "—";
}

/** Data de cadastro: sem o horário quando a planilha trouxe só o dia ou o mês (meia-noite). */
export function formatRegistered(value: string | null | undefined): string {
  if (!value) return "—";
  const date = parseApiDate(value);
  return date.getHours() === 0 && date.getMinutes() === 0 ? dateFormat.format(date) : dateTimeFormat.format(date);
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : numberFormat.format(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
