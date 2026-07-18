# CRM WordPane

CRM B2B completo da WordPane para gestão de clientes, projetos e demandas, com
duas áreas distintas na mesma aplicação:

- **Admin** (`/admin/*`) — backoffice da equipe interna: clientes, projetos,
  etapas, tarefas, demandas (triagem), equipe, configurações, dashboard com
  dados reais, pesquisa global (Cmd+K) e notificações.
- **Portal do cliente** (`/portal/*`) — acompanhamento de projetos e tarefas
  visíveis, abertura de demandas, upload/download de arquivos, comentários,
  notificações e perfil.

## Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript estrito
- **Tailwind CSS v4** + **shadcn/ui sobre Base UI** (tema dark WordPane)
- **Drizzle ORM** + **Neon Postgres**
- **Auth.js v5** (credentials, sessão JWT) — RBAC por escopo de empresas
- **Zod** (validações), **date-fns** (datas pt-BR), **sonner** (toasts),
  **lucide-react** (ícones), **cmdk** (paleta de pesquisa)
- Storage de arquivos: disco local em dev, **Vercel Blob** em produção

### RBAC por escopo

| Papel         | Acesso                                                          |
| ------------- | --------------------------------------------------------------- |
| `super_admin` | Tudo: todas as empresas, equipe e configurações                 |
| `admin`       | Apenas as empresas atribuídas a ele (tabela de assignments)     |
| `client`      | Somente o portal, e apenas os dados da própria empresa          |

O escopo é aplicado nas queries via `visibleCompanyIds` (ver
`src/lib/access/permissions.ts`): `null` = todas (super), lista de ids =
atribuídas.

## Setup

Pré-requisitos: Node 20+ e um banco Postgres no [Neon](https://neon.tech).

```bash
# 1. Dependências
npm install

# 2. Variáveis de ambiente
cp .env.example .env.local
#    - DATABASE_URL: connection string do Neon
#    - AUTH_SECRET: gere com `npx auth secret` (ou `openssl rand -base64 32`)
#    - BLOB_READ_WRITE_TOKEN: opcional em dev (ver seção Storage)

# 3. Banco de dados
npm run db:migrate   # aplica as migrações (drizzle/)
npm run db:seed      # dados de demonstração

# 4. Rodar
npm run dev          # http://localhost:3000
```

### Credenciais demo (seed)

| Perfil       | E-mail               | Senha        |
| ------------ | -------------------- | ------------ |
| Super admin  | `admin@wordpane.com` | `wordpane123` |
| Admin        | `joao@wordpane.com`  | `wordpane123` |
| Cliente      | `maria@xpto.com.br`  | `cliente123`  |

O admin `joao@` tem apenas a empresa XPTO atribuída — útil para validar o
escopo de visibilidade.

## Scripts

| Comando             | Descrição                                  |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Servidor de desenvolvimento                |
| `npm run build`     | Build de produção (typecheck + lint)       |
| `npm run start`     | Sobe o build de produção                   |
| `npm run lint`      | ESLint                                     |
| `npm run db:generate` | Gera migração a partir do schema Drizzle |
| `npm run db:migrate`  | Aplica migrações pendentes               |
| `npm run db:seed`     | Popula o banco com dados demo            |
| `npm run db:studio`   | Drizzle Studio (inspeção do banco)       |

## Estrutura

```
src/
├── app/
│   ├── (auth)/login/        # Login único (redireciona por papel)
│   ├── (admin)/admin/       # Backoffice: dashboard, clientes, projetos,
│   │                        #   demandas, tarefas, equipe, configurações,
│   │                        #   notificações
│   ├── (portal)/portal/     # Portal do cliente: projetos, demandas,
│   │                        #   arquivos, notificações, perfil
│   └── api/                 # auth, upload, files (download), avatar,
│                            #   search (Cmd+K), notifications/unread-count
├── components/
│   ├── ui/                  # shadcn/ui sobre Base UI
│   ├── layout/              # sidebar, navbar, sino, paleta de pesquisa
│   └── <domínio>/           # companies, projects, tasks, demands,
│                            #   comments, attachments, activities…
├── lib/
│   ├── access/permissions.ts  # requireUser/requireTeam/visibleCompanyIds
│   ├── auth/                  # Auth.js v5 (credentials + JWT)
│   ├── db/                    # schema Drizzle, conexão Neon, seed
│   ├── queries/               # leituras (sempre escopadas por papel)
│   ├── storage/               # driver local (.storage) + Vercel Blob
│   ├── validations/           # schemas Zod
│   ├── activities.ts          # timeline/histórico (logActivity)
│   └── notifications.ts       # notifyUsers + destinatários por empresa
├── server/actions/            # server actions (mutações, "use server")
└── proxy.ts                   # middleware do Next 16 (guarda de rotas)
```

## Decisões de arquitetura

- **Demanda vira tarefa via triagem manual.** O cliente abre a demanda no
  portal; a equipe muda o status e, quando fizer sentido, converte em tarefa de
  um projeto (origem `demanda_cliente`). Nada é automático.
- **Storage**: em dev os arquivos vão para `./.storage` (sem dependências
  externas); em produção, com `BLOB_READ_WRITE_TOKEN` definido, o driver troca
  para Vercel Blob automaticamente (`getStorage()` em `src/lib/storage/`).
  Metadados ficam na tabela `attachments`; download autenticado via
  `/api/files/[id]`.
- **Middleware = `src/proxy.ts`.** No Next 16 o arquivo de middleware passa a
  se chamar `proxy.ts` — é ele quem protege `/admin/*` e `/portal/*` e
  redireciona cada papel para a sua home.
- **Escopo em toda leitura.** Toda query do admin passa por
  `visibleCompanyIds`; toda query do portal filtra pela empresa do usuário e
  por `visibleToClient` nas tarefas.
- **Notificações internas** (tabela `notifications`): comentários, uploads,
  novas demandas e mudanças de status disparam registros para a equipe ou para
  os clientes da empresa (nunca para o próprio autor). O sino faz polling do
  contador a cada 60s.
- **Pesquisa global** (`Cmd+K` no admin): route `/api/search` com ILIKE
  escopado e limite de 5 por grupo; paleta com `cmdk` + debounce de 300ms.

## Roadmap

### Fase 2

- Relatórios e exportação (horas por projeto, SLA de demandas)
- Comentários com menções (@usuário) e anexos inline
- Templates de projeto (etapas/tarefas pré-definidas)
- Preferências de notificação por usuário (in-app + e-mail)
- Audit log administrativo (quem alterou o quê, quando)

### Fase 3

- App mobile (companion do portal do cliente)
- Integrações externas (webhooks, API pública com tokens)
- Faturamento/contratos vinculados aos projetos
- White-label por cliente (logo e cores no portal)
