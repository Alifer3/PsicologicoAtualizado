import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from './setup.js';

describe('Health Check', () => {
  it('GET /api/health retorna ok', async () => {
    const res = await GET('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.service, 'PsicoConnect API');
    assert.equal(res.body.version, '2.0.0');
  });
});

describe('Autenticação - Registro', () => {
  it('POST /api/auth/register deve rejeitar sem dados obrigatórios', async () => {
    const res = await POST('/api/auth/register', { body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/auth/register deve rejeitar email inválido', async () => {
    const res = await POST('/api/auth/register', {
      body: { nome: 'Teste', email: 'invalido', senha: '123456', tipo: 'paciente' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/auth/register deve rejeitar senha curta', async () => {
    const res = await POST('/api/auth/register', {
      body: { nome: 'Teste', email: 'teste@teste.com', senha: '123', tipo: 'paciente' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/auth/register deve rejeitar tipo inválido', async () => {
    const res = await POST('/api/auth/register', {
      body: { nome: 'Teste', email: 'teste@teste.com', senha: '123456', tipo: 'admin' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });
});

describe('Autenticação - Login', () => {
  it('POST /api/auth/login deve rejeitar sem dados', async () => {
    const res = await POST('/api/auth/login', { body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/auth/login deve rejeitar email inválido', async () => {
    const res = await POST('/api/auth/login', {
      body: { email: 'invalido', senha: '123456', tipo: 'paciente' }
    });
    assert.equal(res.status, 400);
  });
});

describe('Rotas protegidas', () => {
  it('GET /api/auth/me deve rejeitar sem token', async () => {
    const res = await GET('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
    assert.ok(res.body.error.includes('Token'));
  });

  it('GET /api/auth/me deve rejeitar token inválido', async () => {
    const res = await GET('/api/auth/me', { token: 'token_invalido' });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
  });

  it('GET /api/agendamentos deve rejeitar sem auth', async () => {
    const res = await GET('/api/agendamentos');
    assert.equal(res.status, 401);
  });

  it('GET /api/psicologos/todos deve rejeitar sem auth', async () => {
    const res = await GET('/api/psicologos/todos');
    assert.equal(res.status, 401);
  });
});

describe('Rotas públicas', () => {
  it('GET /api/psicologos deve funcionar sem auth', async () => {
    const res = await GET('/api/psicologos');
    // Pode falhar se DB não está conectado, mas não deve ser 401
    assert.notEqual(res.status, 401);
  });

  it('GET /api/planos deve funcionar sem auth', async () => {
    const res = await GET('/api/planos');
    assert.notEqual(res.status, 401);
  });
});
