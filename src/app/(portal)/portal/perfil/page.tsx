import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PortalPasswordForm } from "@/components/portal/portal-password-form";
import { PortalProfileForm } from "@/components/portal/portal-profile-form";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { PopupPreferenceForm } from "@/components/profile/popup-preference-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/access/permissions";
import { getBranding } from "@/lib/brand/settings";
import { getPortalProfile } from "@/lib/queries/portal";

export const metadata: Metadata = { title: "Perfil" };

export default async function PortalProfilePage() {
  const user = await requireUser();
  const profile = await getPortalProfile(user);
  if (!profile) notFound();

  const brand = await getBranding();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Perfil</h1>
        <p className="text-sm text-muted-foreground">
          Seus dados de acesso e contato no portal.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Foto do perfil</CardTitle>
          <CardDescription>
            Exibida nos seus comentários e no menu do portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUpload
            name={profile.name}
            avatarUrl={profile.avatarUrl ? `/api/avatar/${user.id}` : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
          <CardDescription>
            Como a equipe {brand.appName} identifica você.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalProfileForm
            appName={brand.appName}
            email={profile.email}
            defaultValues={{
              name: profile.name,
              phone: profile.phone ?? "",
              position: profile.position ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>
            Troque sua senha de acesso ao portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortalPasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>
            Como você quer ser avisado das novidades.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PopupPreferenceForm defaultEnabled={profile.notifyPopup} />
        </CardContent>
      </Card>
    </div>
  );
}
