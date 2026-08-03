# Migração Vercel/Neon → Dokploy

Este documento descreve como migrar o CRM WordPane da stack Vercel (app) + Neon (banco) + Vercel Blob (arquivos) para uma stack unificada no Dokploy.

## Arquitetura alvo

- **Aplicação**: container Docker com Next.js em modo `standalone`.
- **Banco de dados**: PostgreSQL 16 como serviço no Dokploy.
- **Arquivos**: MinIO (S3-compatível) como serviço no Dokploy.
- **Domínio**: subdomínio do Dokploy para testes, depois domínio principal.

## 1. Preparação do código

Os arquivos a seguir já estão configurados no repositório:

- `Dockerfile` — build multistage com Next.js standalone.
- `.dockerignore` — evita copiar arquivos desnecessários.
- `next.config.ts` — `output: "standalone"`.
- `src/lib/storage/s3.ts` — driver S3/MinIO.
- `src/lib/storage/index.ts` — seleciona driver S3, Blob ou local.
- `src/app/api/upload/route.ts` — retorna driver `"s3"` e aceita multipart.
- `src/lib/upload.ts` — envia multipart para driver `"s3"`.

## 2. Infraestrutura no Dokploy

### 2.1. PostgreSQL

1. No painel do Dokploy, crie um serviço PostgreSQL 16.
2. Anote host, porta, usuário, senha e nome do banco.
3. Crie o banco se o template não criar automaticamente:
   ```sql
   CREATE DATABASE crm_wordpane;
   ```

### 2.2. MinIO

1. Crie um serviço MinIO no Dokploy.
2. Acesse o console do MinIO e crie um bucket (ex.: `crm-wordpane`).
3. Crie uma access key e secret key.
4. Anote o endpoint (ex.: `https://minio.seudominiodokploy.com.br`).

### 2.3. Aplicação

1. Crie um serviço do tipo **Application** apontando para o repositório Git.
2. Configure o build para usar o `Dockerfile` na raiz.
3. Defina a porta `3000`.
4. Vincule o serviço ao banco e ao MinIO se o Dokploy oferecer rede interna.

## 3. Variáveis de ambiente

Configure no painel do serviço da aplicação:

```env
DATABASE_URL=postgresql://user:pass@postgres:5432/crm_wordpane
AUTH_SECRET=<mesmo valor da Vercel — NÃO alterar>
NEXTAUTH_URL=https://<subdominio-dokploy>/api/auth
AUTH_URL=https://<subdominio-dokploy>/api/auth
AUTH_TRUST_HOST=true
CRON_SECRET=<mesmo valor ou novo>
APP_TIMEZONE=America/Sao_Paulo

S3_ENDPOINT=https://<endpoint-minio>
S3_BUCKET=crm-wordpane
S3_REGION=us-east-1
S3_ACCESS_KEY=<access-key>
S3_SECRET_KEY=<secret-key>

# Manter durante a transição
BLOB_READ_WRITE_TOKEN=<token da Vercel>

# Outras integrações
ENHANCE_PANEL_URL=
ENHANCE_ORG_ID=
ENHANCE_API_TOKEN=
```

> **Importante**: `AUTH_SECRET` não pode ser alterado. Senhas criptografadas no banco (SMTP, Asaas) e sessões existentes dependem dele.

## 4. Migração do banco de dados

### 4.1. Dump do Neon

```bash
pg_dump --clean --if-exists --no-owner --no-acl \
  --dbname="postgresql://usuario:senha@host.neon.tech/dbname?sslmode=require" \
  > crm_wordpane_dump.sql
```

### 4.2. Restore no Dokploy

```bash
psql postgresql://user:pass@<dokploy-host>:5432/crm_wordpane < crm_wordpane_dump.sql
```

### 4.3. Validar

```sql
SELECT count(*) FROM users;
SELECT count(*) FROM attachments;
```

## 5. Migração dos arquivos (Vercel Blob → MinIO)

Rode localmente ou em um container temporário com acesso ao banco e ao Blob:

```bash
BLOB_READ_WRITE_TOKEN=<token> \
S3_ENDPOINT=https://<endpoint-minio> \
S3_BUCKET=crm-wordpane \
S3_ACCESS_KEY=<key> \
S3_SECRET_KEY=<secret> \
DATABASE_URL=<url-do-banco-dokploy> \
npx tsx scripts/migrate-blob-to-s3.ts
```

O script:

- Lista todos os blobs do Vercel Blob.
- Para cada blob, procura o registro correspondente na tabela `attachments`.
- Baixa o arquivo e envia para o MinIO.
- Atualiza o `fileKey` do registro para `s3://crm-wordpane/<pathname>`.

> **Não exclua os arquivos do Vercel Blob imediatamente.** Mantenha-os até confirmar que tudo funciona no Dokploy.

## 6. Deploy e validação

1. Faça push das alterações para o Git.
2. Acione o deploy no Dokploy.
3. Acesse o subdomínio de teste.

### Checklist

- [ ] Login com usuário existente funciona.
- [ ] Dashboard carrega.
- [ ] Criação de demanda no portal funciona.
- [ ] Upload de anexo em demanda/tarefa funciona.
- [ ] Download de anexo antigo (migrado do Blob) funciona.
- [ ] Envio de e-mail funciona (se SMTP configurado).
- [ ] Rotas de cron respondem com `CRON_SECRET`.
- [ ] Planos de manutenção calculam saldo corretamente.

### Testar cron

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<subdominio-dokploy>/api/cron/planos-manutencao
```

## 7. Corte de tráfego

1. Escolha uma janela de baixo tráfego.
2. Faça dump/restore final do banco para sincronizar mudanças recentes.
3. Re-migre arquivos enviados no intervalo, se houver.
4. Aponte o DNS do domínio principal para o Dokploy.
5. Atualize `NEXTAUTH_URL` e `AUTH_URL` para o domínio principal.
6. Redeploy.
7. Após 24-48h de validação, remova `BLOB_READ_WRITE_TOKEN` das variáveis.

## Rollback

- Mantenha Vercel e Neon ativos durante os testes.
- Se necessário, aponte o DNS de volta para a Vercel e restaure o banco no Neon a partir do último dump.
- Arquivos no Vercel Blob não são excluídos pela migração, então o rollback de arquivos é seguro.
