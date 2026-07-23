"use client";

import { Loader2, ShieldCheck, ShoppingCart, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MaintenancePackage } from "@/lib/db/schema";
import type { ProjectPlanBalance } from "@/lib/queries/maintenance";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { purchasePlanPackage } from "@/server/actions/maintenance";

function PortalQuotaRow({
  label,
  used,
  limit,
  credits,
}: {
  label: string;
  used: number;
  limit: number;
  credits: number;
}) {
  const pct =
    limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : used > 0 ? 100 : 0;
  const exhausted = used >= limit && credits <= 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={exhausted ? "font-semibold text-[#ff6b6b]" : "font-semibold"}>
          {used}/{limit}
          {credits > 0 && (
            <span className="ml-1 font-normal text-muted-foreground">
              (+{credits} extras)
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${exhausted ? "bg-[#ff6b6b]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Card "Seu plano de manutenção" do portal: saldo do ciclo + compra de pacote. */
export function PortalPlanCard({
  projectId,
  balance,
  packages,
}: {
  projectId: string;
  balance: ProjectPlanBalance;
  packages: MaintenancePackage[];
}) {
  const router = useRouter();
  const [buying, setBuying] = useState(false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);

  const lowBalance =
    balance.available.adjustment <= 1 || balance.available.page <= 0;
  const paymentPending = balance.status === "pending_payment";

  function buy(packageId: string) {
    setSelected(packageId);
    startTransition(async () => {
      const result = await purchasePlanPackage({ projectId, packageId });
      setSelected(null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        "Pedido gerado! Conclua o pagamento no Financeiro para liberar os créditos.",
      );
      setBuying(false);
      router.push("/portal/financeiro");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Seu plano de manutenção — {balance.plan.name}
        </CardTitle>
        <CardDescription>
          Demandas do ciclo atual ({formatDate(balance.periodStart)} →{" "}
          {formatDate(balance.periodEnd)}). A cota renova todo mês.
          {balance.shared &&
            " Compartilhada entre os projetos da sua empresa."}
        </CardDescription>
        <CardAction>
          {!paymentPending && (
            <Button size="sm" variant="outline" onClick={() => setBuying(true)}>
              <ShoppingCart />
              Adquirir pacote
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <PortalQuotaRow
            label="Ajustes, correções e atualizações"
            used={balance.monthly.adjustment.used}
            limit={balance.monthly.adjustment.limit}
            credits={balance.packageCredits.adjustment}
          />
          <PortalQuotaRow
            label="Páginas novas"
            used={balance.monthly.page.used}
            limit={balance.monthly.page.limit}
            credits={balance.packageCredits.page}
          />
        </div>

        {paymentPending && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">
              Plano aguardando pagamento do ciclo — as demandas ficam bloqueadas
              até a quitação.
            </span>
            <Button size="sm" render={<Link href="/portal/financeiro" />}>
              Pagar agora
            </Button>
          </div>
        )}

        {!paymentPending && lowBalance && (
          <p className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
            <TriangleAlert className="size-4 shrink-0" />
            Sua cota está acabando. Adquira um pacote extra para continuar
            enviando demandas sem interrupção.
          </p>
        )}
      </CardContent>

      <Dialog open={buying} onOpenChange={setBuying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adquirir pacote extra</DialogTitle>
            <DialogDescription>
              Os créditos entram na hora após a confirmação do pagamento e não
              expiram no fim do ciclo.
            </DialogDescription>
          </DialogHeader>

          {packages.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum pacote disponível no momento — fale com a equipe.
            </p>
          ) : (
            <ul className="space-y-2">
              {packages.map((pkg) => (
                <li
                  key={pkg.id}
                  className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{pkg.name}</p>
                    <p className="text-xs text-muted-foreground">
                      +{pkg.adjustments} ajustes · +{pkg.pages} páginas
                    </p>
                  </div>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {formatCurrency(pkg.valueCents)}
                  </span>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => buy(pkg.id)}
                  >
                    {pending && selected === pkg.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <ShoppingCart />
                    )}
                    Comprar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
