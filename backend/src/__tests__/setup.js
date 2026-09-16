/**
 * Setup de testes do PsicoConnect
 *
 * Cria uma instância do Express para testes sem precisar de PostgreSQL real.
 * Usa mock do módulo de banco para rodar os testes de forma isolada.
 */
import { app } from '../server.js';

const BASE_URL = 'http://localhost:0'; // Não importa, usamos supertest-like

/**
 * Faz uma requisição HTTP ao app Express para testes.
 * Substitui a necessidade de supertest (dependência externa).
 */
export async function request(method, path, { body, token } = {}) {
  // Inicia servidor temporário
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`http://localhost:${port}${path}`, options);
    const data = await res.json().catch(() => null);

    return { status: res.status, body: data, headers: res.headers };
  } finally {
    server.close();
  }
}

/**
 * Helpers de requisição
 */
export const GET = (path, opts) => request('GET', path, opts);
export const POST = (path, opts) => request('POST', path, opts);
export const PATCH = (path, opts) => request('PATCH', path, opts);
