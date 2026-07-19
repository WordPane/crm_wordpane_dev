import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export default auth((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;
  const isLogin = path === "/login";
  const isCadastro = path === "/cadastro";
  const isPublic = isLogin || isCadastro;
  // Link público de orçamento: acessível com ou sem sessão
  const isPublicQuote = path.startsWith("/orcamento");

  if (isPublicQuote) return NextResponse.next();

  if (!session?.user) {
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  const home =
    session.user.role === "client" ? "/portal/dashboard" : "/admin/dashboard";

  if (isPublic || path === "/") {
    return NextResponse.redirect(new URL(home, nextUrl));
  }

  // Cliente nunca acessa /admin; equipe nunca acessa /portal
  if (path.startsWith("/admin") && session.user.role === "client") {
    return NextResponse.redirect(new URL("/portal/dashboard", nextUrl));
  }
  if (path.startsWith("/portal") && session.user.role !== "client") {
    return NextResponse.redirect(new URL("/admin/dashboard", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|brand|favicon.ico).*)"],
};
