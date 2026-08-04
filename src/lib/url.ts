/**
 * Monta a URL pública da requisição considerando headers de proxy reverso.
 * Útil no Next.js standalone atrás do Traefik, onde `request.url` pode conter
 * o host interno (0.0.0.0:3000) em vez do domínio público.
 */
export function getPublicBaseUrl(request: Request): string {
  const headers = new Headers(request.headers);
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto");
  const host = forwardedHost || headers.get("host") || "";

  if (host) {
    const protocol = forwardedProto || "https";
    return `${protocol}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (authUrl) {
    try {
      return new URL(authUrl).origin;
    } catch {
      // fallthrough
    }
  }

  return new URL(request.url).origin;
}
