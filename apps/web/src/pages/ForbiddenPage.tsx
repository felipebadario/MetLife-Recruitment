import { Compass, Lock } from "lucide-react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";

export function ForbiddenPage() {
  const navigate = useNavigate();
  return (
    <Panel>
      <EmptyState
        icon={Lock}
        title="Seu perfil não tem acesso a esta área"
        description="Se precisar deste acesso, peça a um administrador para ajustar o seu perfil."
        action={
          <Button variant="secondary" onClick={() => navigate("/candidatos")}>
            Ir para Candidatos
          </Button>
        }
      />
    </Panel>
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Panel>
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi alterado."
        action={
          <Button variant="secondary" onClick={() => navigate("/")}>
            Voltar ao início
          </Button>
        }
      />
    </Panel>
  );
}
