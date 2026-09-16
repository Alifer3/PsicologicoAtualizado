import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from './setup.js';

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

describe('Pagamentos', () => {
  it('POST /api/payments/create-checkout deve rejeitar sem plano', async () => {
    const res = await POST('/api/payments/create-checkout', {
      body: { metodo: 'mock' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  it('POST /api/payments/create-checkout em modo mock deve retornar sucesso', async () => {
    const res = await POST('/api/payments/create-checkout', {
      body: {
        plano: 'Básico',
        metodo: 'mock',
        nome: 'Teste',
        email: 'teste@teste.com'
      }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.gateway, 'Mock');
    assert.ok(res.body.transacaoId);
  });
});

describe('Google Meet', () => {
  it('POST /api/meet/create-event em modo mock deve retornar link', async () => {
    const res = await POST('/api/meet/create-event', {
      body: {
        consultaId: 'test-123',
        summary: 'Consulta Teste',
        startDateTime: '2026-10-01T10:00:00-03:00'
      }
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.simulated, true);
    assert.ok(res.body.meetLink);
    assert.ok(res.body.meetLink.includes('meet.google.com'));
  });
});

describe('Validação de entrada', () => {
  it('POST /api/agendamentos deve rejeitar sem auth', async () => {
    const res = await POST('/api/agendamentos', {
      body: { psicologo_id: '123', data_hora: '2026-10-01T10:00', modalidade: 'online' }
    });
    assert.equal(res.status, 401);
  });

  it('POST /api/mensagens deve rejeitar sem auth', async () => {
    const res = await POST('/api/mensagens', {
      body: { agendamento_id: '123', texto: 'Olá' }
    });
    assert.equal(res.status, 401);
  });
});
