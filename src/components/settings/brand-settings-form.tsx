"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_BRAND,
  brandAssetUrl,
  isHexColor,
  type BrandAsset,
  type BrandConfig,
} from "@/lib/brand/config";
import {
  brandSettingsSchema,
  type BrandSettingsValues,
} from "@/lib/validations/settings";
import { updateBrandSettings } from "@/server/actions/brand-settings";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Upload de um asset de marca para /api/upload; retorna o valor a gravar. */
async function sendAsset(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });
  const body = (await response.json().catch(() => null)) as {
    fileKey?: string;
    publicUrl?: string;
    error?: string;
  } | null;
  if (!response.ok || !body || (!body.publicUrl && !body.fileKey)) {
    toast.error(body?.error ?? "Não foi possível enviar o arquivo.");
    return null;
  }
  return body.publicUrl ?? body.fileKey ?? null;
}

/** Personalização white-label da instância (nome, logo, favicon e cores). */
export function BrandSettingsForm({ brand }: { brand: BrandConfig }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<BrandAsset | null>(null);
  // Preview imediato do arquivo recém-enviado (a gravação vem no salvar)
  const [previews, setPreviews] = useState<Record<BrandAsset, string>>({
    logo: brandAssetUrl(brand, "logo"),
    favicon: brandAssetUrl(brand, "favicon"),
  });

  const form = useForm<BrandSettingsValues>({
    resolver: zodResolver(brandSettingsSchema),
    defaultValues: brand,
  });
  const { errors } = form.formState;
  const watched = useWatch({ control: form.control });
  const previewPrimary = isHexColor(watched.primaryColor ?? "")
    ? (watched.primaryColor as string)
    : DEFAULT_BRAND.primaryColor;
  const previewBackground = isHexColor(watched.backgroundColor ?? "")
    ? (watched.backgroundColor as string)
    : DEFAULT_BRAND.backgroundColor;

  async function handleUpload(asset: BrandAsset, file: File | undefined) {
    if (!file) return;
    setUploading(asset);
    try {
      const value = await sendAsset(file);
      if (!value) return;
      const field = asset === "logo" ? "logoUrl" : "faviconUrl";
      form.setValue(field, value, { shouldValidate: true });
      setPreviews((current) => ({
        ...current,
        [asset]: value.startsWith("/") ? value : URL.createObjectURL(file),
      }));
    } finally {
      setUploading(null);
    }
  }

  function resetAsset(asset: BrandAsset) {
    const field = asset === "logo" ? "logoUrl" : "faviconUrl";
    form.setValue(field, DEFAULT_BRAND[field], { shouldValidate: true });
    setPreviews((current) => ({
      ...current,
      [asset]: DEFAULT_BRAND[field],
    }));
  }

  function renderAssetField(
    asset: BrandAsset,
    label: string,
    accept: string,
    hint: string,
  ) {
    const field = asset === "logo" ? "logoUrl" : "faviconUrl";
    const isDefault = watched[field] === DEFAULT_BRAND[field];
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 ring-1 ring-foreground/10">
          <div className="flex h-12 w-24 items-center justify-center overflow-hidden rounded-lg bg-[#071928]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previews[asset]}
              alt={label}
              className="max-h-10 max-w-20 object-contain"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading !== null}
              onClick={() => document.getElementById(`brand-${asset}`)?.click()}
            >
              {uploading === asset ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              Trocar
            </Button>
            {!isDefault && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => resetAsset(asset)}
              >
                <X />
                Remover
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{hint}</span>
          </div>
          <input
            id={`brand-${asset}`}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(event) => {
              void handleUpload(asset, event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {errors[field] && (
          <p className="text-xs text-destructive">{errors[field].message}</p>
        )}
      </div>
    );
  }

  function renderColorField(
    field: "primaryColor" | "backgroundColor",
    label: string,
  ) {
    const current = watched[field] ?? "";
    return (
      <Field label={label} error={errors[field]?.message}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} (seletor)`}
            className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
            value={isHexColor(current) ? current : "#000000"}
            onChange={(event) =>
              form.setValue(field, event.target.value, {
                shouldValidate: true,
              })
            }
          />
          <Input placeholder="#RRGGBB" {...form.register(field)} />
        </div>
      </Field>
    );
  }

  function onSubmit(values: BrandSettingsValues) {
    setError(null);
    startTransition(async () => {
      const result = await updateBrandSettings(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Marca atualizada em todo o sistema.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Marca (white-label)</CardTitle>
        <CardDescription>
          Nome, logo, favicon e cores exibidos em todo o sistema — login,
          painel, portal do cliente, e-mails e PDF do orçamento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Field
            label="Nome do sistema *"
            htmlFor="brand-name"
            error={errors.appName?.message}
          >
            <Input
              id="brand-name"
              placeholder="Ex.: Acme CRM"
              {...form.register("appName")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {renderColorField("primaryColor", "Cor primária *")}
            {renderColorField("backgroundColor", "Cor de fundo *")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {renderAssetField(
              "logo",
              "Logo (fundo escuro)",
              "image/png,image/jpeg,image/svg+xml,image/webp",
              "PNG/SVG com fundo transparente, ~4:1.",
            )}
            {renderAssetField(
              "favicon",
              "Favicon",
              "image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml",
              "PNG ou ICO quadrado (32px+).",
            )}
          </div>

          <div
            className="space-y-2 rounded-xl p-4 ring-1 ring-foreground/10"
            style={{ backgroundColor: previewBackground }}
          >
            <span className="text-xs text-white/50">Pré-visualização</span>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews.logo}
                alt="Prévia da logo"
                className="h-8 max-w-36 object-contain"
              />
              <span
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: previewPrimary, color: "#071928" }}
              >
                Botão
              </span>
              <span
                className="text-sm font-medium"
                style={{ color: previewPrimary }}
              >
                Texto em destaque
              </span>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending || uploading !== null}>
              {pending && <Loader2 className="animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
