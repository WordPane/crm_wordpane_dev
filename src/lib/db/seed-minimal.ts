/**
 * Seed mínimo para novas instâncias (instalador): apenas os dados
 * obrigatórios — status de projeto e de tarefa, sem os quais projetos
 * e tarefas não funcionam. NÃO cria usuários nem dados de demonstração:
 * o primeiro super admin é criado no wizard /setup.
 *
 * Uso: npm run db:seed:minimal
 * Requer DATABASE_URL em .env.local
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local opcional se DATABASE_URL já estiver no ambiente
}

import { db } from "./index";
import { projectStatuses, taskStatuses } from "./schema";

async function seedMinimal() {
  console.log("🌱 Seed mínimo (nova instância)...");

  const pStatuses = await db
    .insert(projectStatuses)
    .values([
      { name: "Planejamento", color: "#8df5bb", position: 1 },
      { name: "Em desenvolvimento", color: "#00d164", position: 2 },
      { name: "Em revisão", color: "#f5c542", position: 3 },
      { name: "Homologação", color: "#42a7f5", position: 4 },
      { name: "Aguardando cliente", color: "#f58c42", position: 5 },
      { name: "Concluído", color: "#31b068", position: 6, isFinal: true },
      { name: "Cancelado", color: "#ff6b6b", position: 7, isFinal: true },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`✔ ${pStatuses.length} status de projeto`);

  const tStatuses = await db
    .insert(taskStatuses)
    .values([
      { name: "A fazer", color: "#8df5bb", position: 1 },
      { name: "Em andamento", color: "#00d164", position: 2 },
      { name: "Em revisão", color: "#f5c542", position: 3 },
      { name: "Concluída", color: "#31b068", position: 4, isFinal: true },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`✔ ${tStatuses.length} status de tarefa`);

  console.log("✅ Seed mínimo concluído.");
  process.exit(0);
}

seedMinimal().catch((error) => {
  console.error("❌ Erro no seed mínimo:", error);
  process.exit(1);
});
