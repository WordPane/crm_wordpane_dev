import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PasswordForm } from "@/components/profile/password-form";
import { ProfileNameForm } from "@/components/profile/profile-name-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireTeam, requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function AdminProfilePage() {
  const sessionUser = await requireUser();
  requireTeam(sessionUser);

  // Dados frescos do banco (o JWT só atualiza no próximo login)
  const [profile] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);
  if (!profile) notFound();

  const brand = await getBranding();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">
          Seus dados de acesso à área administrativa.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Dados pessoais</CardTitle>
            <CardDescription>Como você aparece para a equipe.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileNameForm
              appName={brand.appName}
              defaultName={profile.name}
              email={profile.email}
            />
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Segurança</CardTitle>
            <CardDescription>
              Troque a senha da sua conta periodicamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
