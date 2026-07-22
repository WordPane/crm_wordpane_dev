import { sql } from "drizzle-orm";

/**
 * Datas de referência no fuso do negócio (America/Sao_Paulo) para uso em
 * queries — o Postgres roda em UTC, então `current_date` vira o dia às 21h.
 */
/** "Hoje" em America/Sao_Paulo. */
export const SQL_TODAY = sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`;

/** "Este mês" em America/Sao_Paulo. */
export const SQL_THIS_MONTH = sql`date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')`;

/** Domingo da semana corrente em America/Sao_Paulo (a semana começa na 2ª). */
export const SQL_THIS_WEEK_END = sql`(date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date + 6)::date`;

/** Último dia do mês corrente em America/Sao_Paulo. */
export const SQL_THIS_MONTH_END = sql`(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month - 1 day')::date`;
