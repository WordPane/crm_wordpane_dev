import { z } from "zod";

export const profileNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome completo.")
    .max(160, "Máximo de 160 caracteres."),
});

export type ProfileNameValues = z.infer<typeof profileNameSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z
      .string()
      .min(6, "A nova senha deve ter ao menos 6 caracteres.")
      .max(72, "Máximo de 72 caracteres."),
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

const notificationChannelSchema = z.enum(["in_app", "email", "digest"]);

export const notificationSettingsSchema = z.object({
  channels: z
    .object({
      task: z.array(notificationChannelSchema).optional(),
      comment: z.array(notificationChannelSchema).optional(),
      project: z.array(notificationChannelSchema).optional(),
      demand: z.array(notificationChannelSchema).optional(),
      quote: z.array(notificationChannelSchema).optional(),
      charge: z.array(notificationChannelSchema).optional(),
      system: z.array(notificationChannelSchema).optional(),
    })
    .optional(),
  digest: z.boolean().optional(),
});

export type NotificationSettingsValues = z.infer<typeof notificationSettingsSchema>;
