import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PortalDemandForm } from "@/components/portal/portal-demand-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Nova demanda" };

export default function PortalNewDemandPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/portal/demandas"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para demandas
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold">Nova demanda</h1>
          <p className="text-sm text-muted-foreground">
            Conte o que você precisa — a equipe analisa e dá andamento por aqui.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da demanda</CardTitle>
          <CardDescription>
            Campos marcados com * são obrigatórios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalDemandForm />
        </CardContent>
      </Card>
    </div>
  );
}
