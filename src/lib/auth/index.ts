import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import "./types";

// Normaliza AUTH_URL/NEXTAUTH_URL para a origem, ignorando caminhos como
// /api/auth que possam ter sido salvos na Vercel/Dokploy.
function normalizeAuthUrlEnv(key: "AUTH_URL" | "NEXTAUTH_URL") {
  const raw = process.env[key];
  if (!raw) return;
  try {
    process.env[key] = new URL(raw).origin;
  } catch {
    // mantém valor original se não for uma URL válida
  }
}
normalizeAuthUrlEnv("AUTH_URL");
normalizeAuthUrlEnv("NEXTAUTH_URL");

const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 }, // 7 dias
  pages: { signIn: "/login" },
  basePath: "/api/auth",
  trustHost: true,
  cookies: {
    sessionToken: {
      name: "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
    csrfToken: {
      name: "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
    callbackUrl: {
      name: "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user || user.status === "suspended") return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatarUrl,
          role: user.role,
          companyId: user.companyId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.companyId = token.companyId;
        session.user.impersonatedBy = token.impersonatedBy ?? null;
      }
      return session;
    },
  },
});
