import type { DefaultSession } from "next-auth";

export type UserRole = "super_admin" | "admin" | "client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      companyId: string | null;
      /** Super admin que iniciou a impersonação (auto-login), quando houver. */
      impersonatedBy?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: UserRole;
    companyId: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    companyId: string | null;
    impersonatedBy?: string | null;
  }
}
