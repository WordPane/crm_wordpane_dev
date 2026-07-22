import { z } from "zod";

/** Pedido de recuperação de senha (página pública /recuperar-senha). */
export const passwordResetRequestSchema = z.object({
  email: z.email("Informe um e-mail válido.").max(255, "Máximo de 255 caracteres."),
});

export type PasswordResetRequestValues = z.infer<
  typeof passwordResetRequestSchema
>;

/** Redefinição com o token recebido por e-mail (página /redefinir-senha). */
export const passwordResetSchema = z
  .object({
    token: z.string().trim().min(1, "Link inválido."),
    password: z
      .string()
      .min(6, "A senha deve ter ao menos 6 caracteres.")
      .max(72, "Máximo de 72 caracteres."), // limite do bcrypt
    confirmPassword: z.string().min(1, "Confirme a nova senha."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export type PasswordResetValues = z.infer<typeof passwordResetSchema>;
