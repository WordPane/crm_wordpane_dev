/**
 * Instalador de nova instância (white-label).
 *
 * Gera o .env.local, roda as migrations e o seed mínimo. Execute da
 * máquina do implantador, apontando para o banco da nova instância:
 *
 *   npm run setup
 *
 * Depois do deploy, abra /setup no navegador para criar o super admin
 * e personalizar a marca.
 */
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback = ""): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
}

async function main() {
  console.log("\n⚙️  Instalador — nova instância do CRM (white-label)\n");

  if (existsSync(".env.local")) {
    const overwrite = await ask(".env.local já existe. Sobrescrever? (s/N)", "N");
    if (!/^s(im)?$/i.test(overwrite)) {
      console.log("Instalação cancelada.");
      process.exit(0);
    }
  }

  const databaseUrl = await ask("DATABASE_URL (postgres://...)");
  if (!databaseUrl.startsWith("postgres")) {
    console.error("DATABASE_URL inválida — esperado algo como postgres://...");
    process.exit(1);
  }
  const blobToken = await ask(
    "BLOB_READ_WRITE_TOKEN (Vercel Blob — opcional em dev, recomendado em produção)",
  );
  const timezone = await ask("APP_TIMEZONE", "America/Sao_Paulo");

  // AUTH_SECRET: gerado UMA vez por instância. A chave AES que protege a
  // senha SMTP e a API key do Asaas (app_settings) deriva dele — trocá-lo
  // depois torna esses segredos ilegíveis.
  const authSecret = randomBytes(32).toString("base64");
  const cronSecret = randomBytes(24).toString("hex");

  writeFileSync(
    ".env.local",
    [
      `DATABASE_URL="${databaseUrl}"`,
      "",
      "# Gerado pelo instalador — NÃO regenere: invalida segredos gravados no banco",
      `AUTH_SECRET="${authSecret}"`,
      "",
      "# Bearer da rota de cron (lembretes de cobrança)",
      `CRON_SECRET="${cronSecret}"`,
      `APP_TIMEZONE="${timezone}"`,
      blobToken ? `BLOB_READ_WRITE_TOKEN="${blobToken}"` : "",
      "",
    ].join("\n"),
  );
  console.log("\n✔ .env.local criado.");

  console.log("\n📦 Rodando migrations...");
  execSync("npx drizzle-kit migrate", { stdio: "inherit" });

  console.log("\n🌱 Rodando seed mínimo...");
  execSync("npm run db:seed:minimal", { stdio: "inherit" });

  console.log(`
✅ Instância pronta!

Próximos passos:
  1. Faça o deploy (na Vercel, cadastre as mesmas variáveis do .env.local).
  2. Abra https://SEU-DOMINIO/setup e crie o super admin.
  3. Ainda no /setup: personalize a marca (nome, logo, cores) e configure
     emissor, SMTP e Asaas.
  4. No painel do Asaas, aponte o webhook para:
     https://SEU-DOMINIO/api/webhooks/asaas (token em Configurações).
  5. Guarde o AUTH_SECRET/CRON_SECRET em local seguro.
`);
}

main()
  .catch((error) => {
    console.error("❌ Falha na instalação:", error);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
