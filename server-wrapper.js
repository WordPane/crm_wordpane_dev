const http = require("http");

const originalCreateServer = http.createServer;

function resolveAppHost() {
  if (process.env.APP_HOST) return process.env.APP_HOST;
  if (process.env.AUTH_URL) {
    try {
      return new URL(process.env.AUTH_URL).host;
    } catch {
      // ignore
    }
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_APP_URL).host;
    } catch {
      // ignore
    }
  }
  return null;
}

const appHost = resolveAppHost();

http.createServer = function createServerWithHostFix(...args) {
  const handler = args.find((arg) => typeof arg === "function");
  const wrapped = handler
    ? function (req, res) {
        const forwardedHost = req.headers["x-forwarded-host"];
        if (forwardedHost) {
          req.headers.host = forwardedHost;
        } else if (appHost) {
          req.headers.host = appHost;
        }
        return handler(req, res);
      }
    : undefined;

  const serverArgs = wrapped
    ? args.map((arg) => (typeof arg === "function" ? wrapped : arg))
    : args;
  return originalCreateServer.apply(this, serverArgs);
};

require("./server.js");
