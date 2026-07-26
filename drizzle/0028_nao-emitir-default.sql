-- O SET DEFAULT precisa ficar em migração separada da 0027: o Postgres não
-- permite usar um valor de enum recém-adicionado na mesma transação.
ALTER TABLE "companies" ALTER COLUMN "invoice_emission" SET DEFAULT 'nao_emitir';