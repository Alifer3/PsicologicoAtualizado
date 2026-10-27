import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, PATCH, generateToken, query } from './setup.js';

describe('Segurança - Verificação de IDOR (Insecure Direct Object References)', () => {
  let paciente1, paciente2, psicologo1, consulta1, consulta2;
  let tokenPaciente1, tokenPaciente2, tokenPsicologo1, tokenAdmin;

  before(async () => {
    // Cria dados de teste no banco para simular dois pacientes e um psicólogo distintos
    const emailSuffix = Date.now();

    // Usuário 1: Paciente Vítima
    const u1 = await query(
      `INSERT INTO usuarios (nome, email, tipo) VALUES ($1, $2, 'paciente') RETURNING id`,
      ['Paciente Vítima', `vitima_${emailSuffix}@teste.com`]
    );
    const p1 = await query(
      `INSERT INTO pacientes (usuario_id) VALUES ($1) RETURNING id`,
      [u1.rows[0].id]
    );
    paciente1 = { usuarioId: u1.rows[0].id, pacienteId: p1.rows[0].id };
    tokenPaciente1 = generateToken({ id: paciente1.usuarioId, email: `vitima_${emailSuffix}@teste.com`, tipo: 'paciente' });

    // Usuário 2: Atacante (outro paciente)
    const u2 = await query(
      `INSERT INTO usuarios (nome, email, tipo) VALUES ($1, $2, 'paciente') RETURNING id`,
      ['Paciente Atacante', `atacante_${emailSuffix}@teste.com`]
    );
    const p2 = await query(
      `INSERT INTO pacientes (usuario_id) VALUES ($1) RETURNING id`,
      [u2.rows[0].id]
    );
    paciente2 = { usuarioId: u2.rows[0].id, pacienteId: p2.rows[0].id };
    tokenPaciente2 = generateToken({ id: paciente2.usuarioId, email: `atacante_${emailSuffix}@teste.com`, tipo: 'paciente' });

    // Usuário 3: Psicólogo
    const u3 = await query(
      `INSERT INTO usuarios (nome, email, tipo) VALUES ($1, $2, 'psicologo') RETURNING id`,
      ['Dra. Psicóloga', `psico_${emailSuffix}@teste.com`]
    );
    const ps1 = await query(
      `INSERT INTO psicologos (usuario_id, crp, status_validacao) VALUES ($1, $2, 'aprovado') RETURNING id`,
      [u3.rows[0].id, `CRP-${String(emailSuffix).slice(-6)}`]
    );
    psicologo1 = { usuarioId: u3.rows[0].id, psicologoId: ps1.rows[0].id };
    tokenPsicologo1 = generateToken({ id: psicologo1.usuarioId, email: `psico_${emailSuffix}@teste.com`, tipo: 'psicologo' });

    // Admin
    tokenAdmin = generateToken({ id: '99999999-9999-4999-8999-999999999999', email: 'admin@teste.com', tipo: 'admin' });

    // Consulta 1: Paciente 1 (vítima) com Psicóloga 1
    const c1 = await query(
      `INSERT INTO agendamentos (paciente_id, psicologo_id, data_hora, modalidade, status)
       VALUES ($1, $2, NOW() + INTERVAL '1 day', 'online', 'agendado') RETURNING id`,
      [paciente1.pacienteId, psicologo1.psicologoId]
    );
    consulta1 = c1.rows[0].id;

    // Mensagem confidencial na Consulta 1
    await query(
      `INSERT INTO mensagens (agendamento_id, autor_id, texto) VALUES ($1, $2, $3)`,
      [consulta1, paciente1.usuarioId, 'Mensagem clínica sigilosa do paciente vítima']
    );

    // Consulta 2: Paciente 2 (atacante) com Psicóloga 1
    const c2 = await query(
      `INSERT INTO agendamentos (paciente_id, psicologo_id, data_hora, modalidade, status)
       VALUES ($1, $2, NOW() + INTERVAL '2 days', 'online', 'agendado') RETURNING id`,
      [paciente2.pacienteId, psicologo1.psicologoId]
    );
    consulta2 = c2.rows[0].id;
  });

  it('1. IDOR no Cancelamento: Paciente atacante NÃO DEVE cancelar consulta de outro paciente', async () => {
    const res = await PATCH(`/api/agendamentos/${consulta1}/cancelar`, {
      token: tokenPaciente2 // Atacante tentando cancelar consulta da vítima
    });

    assert.equal(res.status, 403, 'Deve retornar 403 Forbidden');
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /permissão|não encontrado/i);

    // Garante que o status no banco permanece inalterado
    const check = await query(`SELECT status FROM agendamentos WHERE id = $1`, [consulta1]);
    assert.equal(check.rows[0].status, 'agendado', 'O status da consulta da vítima não pode ter sido cancelado');
  });

  it('2. IDOR no Chat: Paciente atacante NÃO DEVE ler mensagens sigilosas de consulta alheia', async () => {
    const res = await GET(`/api/mensagens/${consulta1}`, {
      token: tokenPaciente2 // Atacante tentando ler chat da consulta 1
    });

    assert.equal(res.status, 403, 'Deve retornar 403 Forbidden impedindo vazamento de prontuário/chat');
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /Acesso negado/i);
  });

  it('3. IDOR no Chat: Paciente atacante NÃO DEVE injetar mensagens em consulta alheia', async () => {
    const res = await POST('/api/mensagens', {
      token: tokenPaciente2,
      body: {
        agendamento_id: consulta1, // Consulta da vítima
        texto: 'Mensagem forjada por invasor'
      }
    });

    assert.equal(res.status, 403, 'Deve retornar 403 Forbidden');
    assert.equal(res.body.ok, false);

    // Confirma que mensagem invasora não foi salva
    const check = await query(`SELECT id FROM mensagens WHERE agendamento_id = $1 AND texto LIKE '%forjada%'`, [consulta1]);
    assert.equal(check.rows.length, 0);
  });

  it('4. IDOR no Meet: Usuário NÃO DEVE criar reunião Google Meet para consulta de terceiro', async () => {
    const res = await POST('/api/meet/create-event', {
      token: tokenPaciente2,
      body: {
        consultaId: consulta1, // Consulta da vítima
        summary: 'Reunião Invasora'
      }
    });

    assert.equal(res.status, 403, 'Deve bloquear criação de Meet para consulta onde o usuário não é parte');
    assert.equal(res.body.ok, false);
  });

  it('5. Acesso Legítimo: Participante real (paciente dono) consegue ler suas próprias mensagens', async () => {
    const res = await GET(`/api/mensagens/${consulta1}`, {
      token: tokenPaciente1
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].texto, 'Mensagem clínica sigilosa do paciente vítima');
  });

  it('6. Acesso Legítimo: Participante real (psicóloga da consulta) consegue enviar mensagem', async () => {
    const res = await POST('/api/mensagens', {
      token: tokenPsicologo1,
      body: {
        agendamento_id: consulta1,
        texto: 'Olá, nos vemos no horário agendado!'
      }
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.ok, true);
  });

  it('7. Acesso Legítimo: Dono da consulta consegue cancelá-la com sucesso', async () => {
    const res = await PATCH(`/api/agendamentos/${consulta2}/cancelar`, {
      token: tokenPaciente2 // Atacante cancelando sua própria consulta (legítimo)
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.agendamento.status, 'cancelado');
  });
});
