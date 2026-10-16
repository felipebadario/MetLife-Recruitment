import { BarChart3, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { useAuth } from "@/auth/AuthProvider";
import { BrandMark } from "@/components/layout/BrandMark";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { ApiError } from "@/lib/api";
import { PREVIEW, PREVIEW_ACCOUNTS } from "@/lib/preview";

const HIGHLIGHTS = [
  {
    icon: FileSpreadsheet,
    text: "As planilhas mensais das agências consolidadas em uma única base.",
  },
  {
    icon: BarChart3,
    text: "Performance de cada agência medida por volume e por eficiência.",
  },
  {
    icon: ShieldCheck,
    text: "Dados pessoais protegidos, com acesso por perfil e trilha de auditoria.",
  },
];

export function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (session) return <Navigate to={from} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-brand-600 lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Linhas finas em diagonal: textura discreta, sem degradê */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="lines" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="22" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lines)" />
        </svg>
        <BrandMark inverted className="relative" />
        <div className="relative max-w-md">
          {/* Fio branco acima do título, como nas seções do site institucional */}
          <div className="mb-8 h-0.5 w-full bg-white/80" aria-hidden />
          <h2 className="text-[38px] leading-[1.12] font-semibold tracking-tight text-white">
            Recrutamento de corretores, das indicações à contratação.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-[15px] text-brand-50">
                <Icon className="mt-0.5 size-5 shrink-0 text-green-500" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">Acesso exclusivo da equipe interna.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <BrandMark className="mb-10 lg:hidden" />
          <h1 className="text-2xl font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-muted">Use o e-mail e a senha cadastrados pelo administrador.</p>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
            <Field label="E-mail">
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>
            <Field label="Senha">
              {(props) => (
                <Input
                  {...props}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={submitting} disabled={!email || !password} className="w-full">
              Entrar
            </Button>
          </form>
          {PREVIEW ? (
            <div className="mt-8 rounded-[var(--radius-panel)] border border-brand-100 bg-brand-50 p-4">
              <p className="text-[13px] font-semibold text-ink">Contas de demonstração</p>
              <p className="mt-0.5 text-[13px] text-muted">
                Esta pré-visualização roda sem servidor. Escolha um perfil para preencher o acesso.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {PREVIEW_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setError(null);
                    }}
                    className="flex items-center justify-between rounded-[var(--radius-control)] border border-line bg-white px-3 py-2 text-left text-[13px] hover:border-brand-300"
                  >
                    <span className="font-semibold text-ink">{account.label}</span>
                    <span className="text-muted">{account.email}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-8 text-[13px] text-muted">
              Esqueceu a senha? Peça a um administrador para redefini-la.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
