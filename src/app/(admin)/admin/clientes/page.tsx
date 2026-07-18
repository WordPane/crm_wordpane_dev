import type { Metadata } from "next";
import { Building2, Plus } from "lucide-react";
import Link from "next/link";

import { CompanyStatusChip } from "@/components/chips";
import { CompanyRowActions } from "@/components/companies/company-row-actions";
import { CompanySearch } from "@/components/companies/company-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { listCompanies } from "@/lib/queries/companies";

export const metadata: Metadata = { title: "Clientes" };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  requireTeam(user);

  const { q } = await searchParams;
  const search = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const items = await listCompanies(user, search);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {items.length}{" "}
            {items.length === 1
              ? "empresa encontrada"
              : "empresas encontradas"}
            {search && <> para &ldquo;{search}&rdquo;</>}
          </p>
        </div>
        <Button render={<Link href="/admin/clientes/novo" />}>
          <Plus />
          Novo cliente
        </Button>
      </div>

      <CompanySearch defaultValue={search} />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="size-12 text-muted-foreground/40" />
            {search ? (
              <>
                <p className="font-medium">Nenhuma empresa encontrada</p>
                <p className="text-sm text-muted-foreground">
                  Tente outro termo de busca (nome ou CNPJ).
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Nenhum cliente cadastrado ainda</p>
                <p className="text-sm text-muted-foreground">
                  Cadastre o primeiro cliente para começar a operação.
                </p>
                <Button
                  render={<Link href="/admin/clientes/novo" />}
                  className="mt-2"
                >
                  <Plus />
                  Novo cliente
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/admin/clientes/${c.id}`}
                      className="block font-medium text-foreground transition-colors hover:text-[#00d164]"
                    >
                      {c.nomeFantasia || c.razaoSocial}
                      {c.nomeFantasia && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {c.razaoSocial}
                        </span>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.cnpj ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[c.cidade, c.estado].filter(Boolean).join("/") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.whatsapp ?? "—"}
                  </TableCell>
                  <TableCell>
                    <CompanyStatusChip status={c.status} />
                  </TableCell>
                  <TableCell>
                    <CompanyRowActions
                      companyId={c.id}
                      companyName={c.nomeFantasia || c.razaoSocial}
                      canDelete={user.role === "super_admin"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
