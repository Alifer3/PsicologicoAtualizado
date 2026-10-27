import pg from 'pg';

const { Pool } = pg;

// SEGURANÇA: em produção o certificado do servidor é VERIFICADO (rejectUnauthorized: true),
// evitando ataques man-in-the-middle. Provedores como Neon/Supabase usam CA pública.
// DB_CA_CERT permite informar a CA raiz quando o provedor usa certificado próprio.
function sslConfig() {
  if (process.env.DB_SSL === 'false') return false;
  if (process.env.NODE_ENV !== 'production' && process.env.DB_SSL !== 'true') return false;
  const ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  if (process.env.DB_CA_CERT) ssl.ca = process.env.DB_CA_CERT.replace(/\\n/g, '\n');
  return ssl;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(),
  // Serverless (Vercel): poucas conexões por instância
  max: Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 3 : 10),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', (err) => console.error('Erro inesperado no pool do PostgreSQL:', err.message));

/** Executa SEMPRE consultas parametrizadas ($1, $2...) => proteção contra SQL Injection. */
export async function query(text, params) {
  return pool.query(text, params);
}

/** Executa várias queries em uma transação (BEGIN/COMMIT/ROLLBACK). */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
