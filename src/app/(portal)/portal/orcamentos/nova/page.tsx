import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { PortalQuoteRequestForm } from "@/components/portal/portal-quote-request-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/access/permissions";
import { listQuoteRequestableServices } from "@/lib/queries/quotes";

export const metadata: Metadata = { title: "Solicitar orçamento" };

export default async function PortalNewQuoteRequestPage() {
  await requireUser();
  const services = await listQuoteRequestableServices();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href="/portal/orcamentos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para orçamentos
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold">Solicitar orçamento</h1>
          <p className="text-sm text-muted-foreground">
            Conte o que você precisa — a equipe analisa e envia a proposta por
            aqui.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do pedido</CardTitle>
          <CardDescription>
            Campos marcados com * são obrigatórios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum tipo de projeto disponível para solicitação no momento.
              </p>
              <Button
                variant="outline"
                render={<Link href="/portal/orcamentos" />}
              >
                Voltar para orçamentos
              </Button>
            </div>
          ) : (
            <PortalQuoteRequestForm services={services} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
