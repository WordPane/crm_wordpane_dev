import { createPortalDemand } from "@/server/actions/portal";

async function main() {
  const result = await createPortalDemand({
    projectId: process.argv[2] ?? "eb1869ae-6e92-4870-9116-c89465c8a0b5",
    title: "Demanda de teste",
    category: "ajuste",
    priority: "normal",
    description: "Descrição de teste para verificar erro ao criar demanda no portal.",
    attachments: [],
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Erro fatal:", error);
  process.exit(1);
});
