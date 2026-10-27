import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, generateToken, query } from './setup.js';

describe('API Health', () => {
  it('GET /api/health retorna dados do serviço', async () => {
    const res = await GET('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.providers);
    assert.ok(res.body.providers.payment);
    assert.ok(res.body.providers.meet);
  });
});

describe('Pagamentos - Proteção de Acesso', () => {
  it('POST /api/payments/create-checkout deve rejeitar sem auth (401)', async () => {
    const res = await POST('/api/payments/create-checkout', {
      body: { plano: 'Básico', metodo: 'mock' }
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/payments/create-checkout com perfil paciente deve rejeitar (403)', async () => {
    const tokenPaciente = generateToken({ id: '11111111-1111-4111-8111-111111111111', email: 'paciente@teste.com', tipo: 'paciente' });
    const res = await POST('/api/payments/create-checkout', {
      token: tokenPaciente,
      body: { plano: 'Básico', metodo: 'mock' }
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/payments/create-checkout com psicólogo deve aprovar e servidor fixar valor', async () => {
    const tokenPsicologo = generateToken({ id: '22222222-2222-4222-8222-222222222222', email: 'psicologo@teste.com', tipo: 'psicologo' });
    const res = await POST('/api/payments/create-checkout', {
      token: tokenPsicologo,
      body: {
        plano: 'Básico',
        metodo: 'mock',
        nome: 'Dra. Ana'
      }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.gateway, 'Mock');
    assert.equal(res.body.valor, 29.90, 'Servidor deve fixar o valor do plano, ignorando valores adulterados');
    assert.ok(res.body.transacaoId);
  });
});

describe('Google Meet - Proteção de Acesso', () => {
  it('POST /api/meet/create-event deve rejeitar sem auth (401)', async () => {
    const res = await POST('/api/meet/create-event', {
      body: {
        consultaId: 'b82d3e91-7641-4cf1-8a9d-111111111111',
        summary: 'Consulta Teste'
      }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/meet/create-event deve rejeitar consultaId inválido/não-UUID (400)', async () => {
    const token = generateToken({ id: '11111111-1111-4111-8111-111111111111', email: 'user@teste.com', tipo: 'paciente' });
    const res = await POST('/api/meet/create-event', {
      token,
      body: {
        consultaId: 'consulta-123-invalida',
        summary: 'Consulta Teste'
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });
});

describe('Validação de entrada em agendamentos e mensagens', () => {
  it('POST /api/agendamentos deve rejeitar sem auth (401)', async () => {
    const res = await POST('/api/agendamentos', {
      body: { psicologo_id: '123', data_hora: '2026-10-01T10:00', modalidade: 'online' }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/mensagens deve rejeitar sem auth (401)', async () => {
    const res = await POST('/api/mensagens', {
      body: { agendamento_id: '123', texto: 'Olá' }
    });
    assert.equal(res.status, 401);
  });
});
