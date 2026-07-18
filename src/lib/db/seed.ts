/**
 * Seed do banco — popula statuses, usuários e dados de demonstração.
 *
 * Uso: npm run db:seed
 * Requer DATABASE_URL em .env.local
 */
import { hashSync } from "bcryptjs";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local opcional se DATABASE_URL já estiver no ambiente
}

import { db } from "./index";
import {
  activities,
  adminCompanyAssignments,
  comments,
  companies,
  demands,
  milestones,
  projectLinks,
  projectMembers,
  projects,
  projectStatuses,
  taskChecklistItems,
  tasks,
  taskStatuses,
  users,
} from "./schema";

async function seed() {
  console.log("🌱 Iniciando seed...");

  // ── Status de projeto (configuráveis) ──
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

  // ── Usuários ──
  const password = hashSync("wordpane123", 10);
  const clientPassword = hashSync("cliente123", 10);

  const [superAdmin] = await db
    .insert(users)
    .values({
      name: "Super Admin",
      email: "admin@wordpane.com",
      passwordHash: password,
      role: "super_admin",
      position: "Diretor",
    })
    .onConflictDoNothing()
    .returning();

  const [adminJoao] = await db
    .insert(users)
    .values({
      name: "João Silva",
      email: "joao@wordpane.com",
      passwordHash: password,
      role: "admin",
      position: "Gerente de Projetos",
    })
    .onConflictDoNothing()
    .returning();

  const [adminAna] = await db
    .insert(users)
    .values({
      name: "Ana Costa",
      email: "ana@wordpane.com",
      passwordHash: password,
      role: "admin",
      position: "Desenvolvedora",
    })
    .onConflictDoNothing()
    .returning();
  console.log("✔ usuários da equipe");

  // ── Empresas + usuários clientes ──
  const [xpto] = await db
    .insert(companies)
    .values({
      razaoSocial: "XPTO Comércio e Serviços LTDA",
      nomeFantasia: "Empresa XPTO",
      cnpj: "12.345.678/0001-90",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01310-100",
      pais: "Brasil",
      telefone: "(11) 3000-0000",
      whatsapp: "(11) 99000-0000",
      email: "contato@xpto.com.br",
      site: "https://xpto.com.br",
      status: "ativo",
    })
    .onConflictDoNothing()
    .returning();

  const [alpha] = await db
    .insert(companies)
    .values({
      razaoSocial: "Alpha Indústria LTDA",
      nomeFantasia: "Alpha",
      cnpj: "98.765.432/0001-10",
      cidade: "Curitiba",
      estado: "PR",
      pais: "Brasil",
      email: "contato@alpha.ind.br",
      status: "ativo",
    })
    .onConflictDoNothing()
    .returning();
  console.log("✔ empresas");

  if (xpto && adminJoao) {
    const [maria] = await db
      .insert(users)
      .values({
        name: "Maria Souza",
        email: "maria@xpto.com.br",
        passwordHash: clientPassword,
        role: "client",
        position: "Marketing",
        companyId: xpto.id,
      })
      .onConflictDoNothing()
      .returning();

    await db
      .insert(users)
      .values({
        name: "Pedro Lima",
        email: "pedro@xpto.com.br",
        passwordHash: clientPassword,
        role: "client",
        position: "Diretor",
        companyId: xpto.id,
      })
      .onConflictDoNothing();

    // João cuida da XPTO; Ana não tem empresas atribuídas
    await db
      .insert(adminCompanyAssignments)
      .values({ adminId: adminJoao.id, companyId: xpto.id })
      .onConflictDoNothing();

    // ── Projeto demo: Novo Site ──
    const emDesenvolvimento = pStatuses.find(
      (s) => s.name === "Em desenvolvimento",
    );
    const aFazer = tStatuses.find((s) => s.name === "A fazer");
    const emAndamento = tStatuses.find((s) => s.name === "Em andamento");
    const concluida = tStatuses.find((s) => s.name === "Concluída");

    const [site] = await db
      .insert(projects)
      .values({
        companyId: xpto.id,
        name: "Novo Site Institucional",
        description: "Redesign completo do site institucional da XPTO.",
        type: "site_institucional",
        statusId: emDesenvolvimento?.id,
        ownerId: adminJoao.id,
        startDate: "2026-07-01",
        dueDate: "2026-08-30",
        priority: "alta",
        createdBy: superAdmin?.id ?? adminJoao.id,
      })
      .returning();

    if (site) {
      await db
        .insert(projectMembers)
        .values([
          { projectId: site.id, userId: adminJoao.id },
          ...(adminAna ? [{ projectId: site.id, userId: adminAna.id }] : []),
        ])
        .onConflictDoNothing();

      const [briefing, , desenv] = await db
        .insert(milestones)
        .values([
          {
            projectId: site.id,
            name: "Briefing",
            position: 1,
            status: "concluida",
            completedAt: new Date(),
            ownerId: adminJoao.id,
          },
          {
            projectId: site.id,
            name: "Layout",
            position: 2,
            status: "concluida",
            completedAt: new Date(),
            ownerId: adminAna?.id,
          },
          {
            projectId: site.id,
            name: "Desenvolvimento",
            position: 3,
            status: "em_andamento",
            dueDate: "2026-08-20",
            ownerId: adminAna?.id,
          },
          { projectId: site.id, name: "Revisão", position: 4 },
          { projectId: site.id, name: "Publicação", position: 5 },
        ])
        .returning();

      const [taskHome, taskMobile] = await db
        .insert(tasks)
        .values([
          {
            projectId: site.id,
            milestoneId: desenv?.id,
            title: "Home — versão desktop",
            ownerId: adminAna?.id,
            statusId: concluida?.id,
            priority: "alta",
            completedAt: new Date(),
            createdBy: adminJoao.id,
          },
          {
            projectId: site.id,
            milestoneId: desenv?.id,
            title: "Home — versão mobile",
            ownerId: adminAna?.id,
            statusId: emAndamento?.id,
            priority: "alta",
            dueDate: "2026-08-05",
            createdBy: adminJoao.id,
          },
          {
            projectId: site.id,
            milestoneId: desenv?.id,
            title: "Integração dos formulários",
            ownerId: adminJoao.id,
            statusId: aFazer?.id,
            priority: "media",
            dueDate: "2026-08-15",
            createdBy: adminJoao.id,
          },
        ])
        .returning();

      if (taskMobile) {
        await db.insert(taskChecklistItems).values([
          { taskId: taskMobile.id, label: "Menu hambúrguer", done: true, position: 1 },
          { taskId: taskMobile.id, label: "Hero responsivo", done: true, position: 2 },
          { taskId: taskMobile.id, label: "Seção de serviços", done: false, position: 3 },
          { taskId: taskMobile.id, label: "Footer", done: false, position: 4 },
        ]);

        await db.insert(comments).values([
          {
            taskId: taskMobile.id,
            authorId: adminAna!.id,
            body: "Menu e hero finalizados. Subindo prévia para validação.",
          },
          ...(maria
            ? [
                {
                  taskId: taskMobile.id,
                  authorId: maria.id,
                  body: "Ficou ótimo! Só ajustem o espaçamento dos cards de serviços.",
                },
              ]
            : []),
        ]);
      }

      await db.insert(projectLinks).values({
        projectId: site.id,
        url: "https://preview.xpto.wordpane.com",
        description: "Prévia do novo site",
        version: "v0.3",
        notes: "Home desktop aprovada; mobile em ajustes.",
        createdBy: adminJoao.id,
      });

      await db.insert(activities).values([
        {
          actorId: superAdmin?.id ?? adminJoao.id,
          companyId: xpto.id,
          projectId: site.id,
          entityType: "project",
          entityId: site.id,
          action: "project.created",
          metadata: { name: site.name },
        },
        ...(briefing
          ? [
              {
                actorId: adminJoao.id,
                companyId: xpto.id,
                projectId: site.id,
                entityType: "milestone" as const,
                entityId: briefing.id,
                action: "milestone.completed",
                metadata: { name: briefing.name },
              },
            ]
          : []),
        ...(taskHome
          ? [
              {
                actorId: adminAna?.id ?? adminJoao.id,
                companyId: xpto.id,
                projectId: site.id,
                entityType: "task" as const,
                entityId: taskHome.id,
                action: "task.completed",
                metadata: { title: taskHome.title },
              },
            ]
          : []),
      ]);
      console.log("✔ projeto demo com etapas, tarefas, comentários e link");

      // ── Demanda demo (gera tarefa para a equipe) ──
      if (maria) {
        const [taskDemanda] = await db
          .insert(tasks)
          .values({
            projectId: site.id,
            title: "Trocar foto da equipe na página Sobre",
            description:
              "Segue em anexo a nova foto oficial da equipe para substituir a atual.",
            statusId: aFazer?.id,
            priority: "baixa",
            origin: "demanda_cliente",
            createdBy: maria.id,
          })
          .returning();

        await db.insert(demands).values({
          companyId: xpto.id,
          title: "Trocar foto da equipe na página Sobre",
          description:
            "Segue em anexo a nova foto oficial da equipe para substituir a atual.",
          category: "alteracao",
          priority: "baixa",
          taskId: taskDemanda?.id,
          createdBy: maria.id,
        });
        console.log("✔ demanda demo (com tarefa gerada)");
      }
    }
  }

  if (alpha && adminAna) {
    await db
      .insert(adminCompanyAssignments)
      .values({ adminId: adminAna.id, companyId: alpha.id })
      .onConflictDoNothing();
  }

  console.log("\n✅ Seed concluído!");
  console.log("   Super admin: admin@wordpane.com / wordpane123");
  console.log("   Admin:       joao@wordpane.com / wordpane123 (XPTO atribuída)");
  console.log("   Cliente:     maria@xpto.com.br / cliente123");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Erro no seed:", err);
  process.exit(1);
});
