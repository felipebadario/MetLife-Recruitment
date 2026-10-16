/**
 * Modo de pré-visualização: o frontend roda sozinho, com a API simulada no navegador.
 * Usado apenas para publicar uma demonstração navegável sem servidor (build com VITE_PREVIEW=true).
 * Nunca usar com dados reais.
 */
export const PREVIEW = import.meta.env.VITE_PREVIEW === "true";

export const PREVIEW_ACCOUNTS = [
  { label: "Administrador", email: "admin@demo.local", password: "DemoAdmin2026" },
  { label: "Visualizador", email: "viewer@demo.local", password: "DemoViewer2026" },
] as const;
