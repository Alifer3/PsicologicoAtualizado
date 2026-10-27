/**
 * Setup de testes do PsicoConnect
 *
 * Configura ambiente de testes seguro e helpers HTTP compatíveis com Node.js test runner.
 */

// Garante variáveis críticas ANTES de carregar o server.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_super_secret_test_key_minimum_32_chars!';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/psicoconnect_test';
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';
process.env.GOOGLE_MEET_PROVIDER = process.env.GOOGLE_MEET_PROVIDER || 'mock';
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || '60000';
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || '5000';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '1000';
process.env.LOGIN_ACCOUNT_MAX_FAILS = process.env.LOGIN_ACCOUNT_MAX_FAILS || '500';

const { app } = await import('../server.js');
const { generateToken } = await import('../middleware/authMiddleware.js');
const { default: pool, query } = await import('../config/db.js');

let testServer = null;
let testBaseUrl = '';

/** Inicia ou reutiliza servidor HTTP em porta dinâmica com unref */
export async function getTestServerUrl() {
  if (testServer && testServer.listening) return testBaseUrl;
  return new Promise((resolve) => {
    testServer = app.listen(0, '127.0.0.1', () => {
      const port = testServer.address().port;
      testBaseUrl = `http://127.0.0.1:${port}`;
      testServer.unref(); // Permite que o processo do Node finalize normalmente
      resolve(testBaseUrl);
    });
  });
}

/**
 * Fecha conexões abertas ao final dos testes (se necessário).
 */
export async function closeTestResources() {
  if (testServer && testServer.close) {
    await new Promise((r) => testServer.close(r));
  }
}

/**
 * Faz uma requisição HTTP ao app Express para testes.
 */
export async function request(method, path, { body, token, headers = {}, raw = false } = {}) {
  const baseUrl = await getTestServerUrl();
  const reqHeaders = { ...headers };

  if (!raw && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }
  if (reqHeaders['User-Agent'] === undefined) {
    reqHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestClient/1.0';
  }

  const options = { method, headers: reqHeaders };
  if (body !== undefined) {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: res.status,
    body: data,
    headers: res.headers,
    text
  };
}

export const GET = (path, opts) => request('GET', path, opts);
export const POST = (path, opts) => request('POST', path, opts);
export const PATCH = (path, opts) => request('PATCH', path, opts);
export const PUT = (path, opts) => request('PUT', path, opts);
export const DELETE = (path, opts) => request('DELETE', path, opts);

export { app, generateToken, pool, query };
