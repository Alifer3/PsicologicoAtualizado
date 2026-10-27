import express from 'express';
import { query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import {
  isUUID, isSafeMeetLink, requireUUIDParam, findAgendamentoDoUsuario, serverError
} from '../utils/security.js';

const router = express.Router();

// ─── Health do banco ────────────────────────────────────────────────
router.get('/db/health', async (_, res) => {
  try {
    const result = await query('SELECT NOW() AS agora');
    res.json({ ok: true, database: 'PostgreSQL conectado', agora: result.rows[0].agora });
  } catch (error) {
    console.error('DB health:', error.message);
    res.status(503).json({ ok: false, error: 'Banco de dados indisponível.' });
  }
});

// ─── Psicólogos (público) ───────────────────────────────────────────
router.get('/psicologos', async (_, res) => {
  try {
    const result = await query(`
      SELECT p.id, u.nome, p.crp, p.especialidade, p.bio,
             p.valor_consulta, p.atende_online, p.atende_presencial, p.status_validacao,
             e.cidade, e.estado, e.latitude, e.longitude
      FROM psicologos p
      JOIN usuarios u ON u.id = p.usuario_id
      LEFT JOIN enderecos e ON e.psicologo_id = p.id
      WHERE p.status_validacao = 'aprovado'
      ORDER BY u.nome
    `);
    res.json(result.rows);
  } catch (error) {
    serverError(res, error, 'Listar psicólogos');
  }
});

// ─── Psicólogos (admin: todos incluindo pendentes) ──────────────────
router.get('/psicologos/todos', requireAuth, requireRole('admin'), async (_, res) => {
  try {
    const result = await query(`
      SELECT p.id, u.nome, u.email, u.telefone, p.crp, p.especialidade, p.bio,
             p.valor_consulta, p.atende_online, p.atende_presencial, p.status_validacao,
             e.cidade, e.estado
      FROM psicologos p
      JOIN usuarios u ON u.id = p.usuario_id
      LEFT JOIN enderecos e ON e.psicologo_id = p.id
      ORDER BY p.status_validacao, u.nome
    `);
    res.json(result.rows);
  } catch (error) {
    serverError(res, error, 'Listar todos psicólogos');
  }
});

// ─── Aprovar/Reprovar psicólogo (admin) ─────────────────────────────
router.patch('/psicologos/:id/validacao', requireAuth, requireRole('admin'), requireUUIDParam('id'), async (req, res) => {
  const { id } = req.params;
  const { status_validacao } = req.body;

  if (!['aprovado', 'reprovado'].includes(status_validacao)) {
    return res.status(400).json({ ok: false, error: 'Status deve ser aprovado ou reprovado.' });
  }

  try {
    const result = await query(
      'UPDATE psicologos SET status_validacao = $1 WHERE id = $2 RETURNING id, crp, status_validacao',
      [status_validacao, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Psicólogo não encontrado.' });
    }
    res.json({ ok: true, psicologo: result.rows[0], mensagem: `Psicólogo ${status_validacao}.` });
  } catch (error) {
    serverError(res, error, 'Validar psicólogo');
  }
});

// ─── Cadastro de psicólogo pelo ADMIN ───────────────────────────────
// Antes era público e criava usuários SEM senha (porta aberta para bots/spam).
// Cadastro público deve usar POST /api/auth/register.
router.post('/psicologos', requireAuth, requireRole('admin'), async (req, res) => {
  const { nome, email, telefone, crp, especialidade, bio, valor_consulta, cidade, estado } = req.body;

  if (typeof nome !== 'string' || typeof email !== 'string' || typeof crp !== 'string' || !nome || !email || !crp) {
    return res.status(400).json({ ok: false, error: 'nome, email e crp são obrigatórios.' });
  }

  try {
    const usuario = await query(
      `INSERT INTO usuarios (nome, email, telefone, tipo) VALUES ($1, $2, $3, 'psicologo') RETURNING id`,
      [nome, email.toLowerCase(), telefone || null]
    );

    const psicologo = await query(
      `INSERT INTO psicologos (usuario_id, crp, especialidade, bio, valor_consulta)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuario.rows[0].id, crp, especialidade || null, bio || null, valor_consulta || 0]
    );

    if (cidade || estado) {
      await query(
        `INSERT INTO enderecos (psicologo_id, cidade, estado) VALUES ($1, $2, $3)`,
        [psicologo.rows[0].id, cidade || null, estado || null]
      );
    }

    res.status(201).json({ ok: true, psicologo: psicologo.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'E-mail ou CRP já cadastrado.' });
    serverError(res, error, 'Cadastrar psicólogo');
  }
});

// ─── Planos (público) ───────────────────────────────────────────────
router.get('/planos', async (_, res) => {
  try {
    const result = await query('SELECT * FROM planos WHERE ativo = true ORDER BY valor');
    res.json(result.rows);
  } catch (error) {
    serverError(res, error, 'Listar planos');
  }
});

// ─── Agendamentos do usuário logado ─────────────────────────────────
// Cada perfil enxerga apenas os SEUS agendamentos (filtro pelo usuário do token).
router.get('/agendamentos', requireAuth, async (req, res) => {
  try {
    let result;
    if (req.user.tipo === 'admin') {
      result = await query(`
        SELECT a.*, up.nome AS paciente, ups.nome AS psicologo
        FROM agendamentos a
        LEFT JOIN pacientes pa ON pa.id = a.paciente_id
        LEFT JOIN usuarios up ON up.id = pa.usuario_id
        LEFT JOIN psicologos ps ON ps.id = a.psicologo_id
        LEFT JOIN usuarios ups ON ups.id = ps.usuario_id
        ORDER BY a.data_hora DESC
      `);
    } else if (req.user.tipo === 'psicologo') {
      result = await query(`
        SELECT a.*, up.nome AS paciente
        FROM agendamentos a
        LEFT JOIN pacientes pa ON pa.id = a.paciente_id
        LEFT JOIN usuarios up ON up.id = pa.usuario_id
        JOIN psicologos ps ON ps.id = a.psicologo_id
        WHERE ps.usuario_id = $1
        ORDER BY a.data_hora DESC
      `, [req.user.id]);
    } else {
      result = await query(`
        SELECT a.*, ups.nome AS psicologo
        FROM agendamentos a
        LEFT JOIN psicologos ps ON ps.id = a.psicologo_id
        LEFT JOIN usuarios ups ON ups.id = ps.usuario_id
        JOIN pacientes pa ON pa.id = a.paciente_id
        WHERE pa.usuario_id = $1
        ORDER BY a.data_hora DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    serverError(res, error, 'Listar agendamentos');
  }
});

// ─── Criar agendamento ─────────────────────────────────────────────
router.post('/agendamentos', requireAuth, requireRole('paciente'), async (req, res) => {
  const { psicologo_id, data_hora, modalidade, observacoes, link_meet } = req.body;

  if (!psicologo_id || !data_hora || !modalidade) {
    return res.status(400).json({ ok: false, error: 'psicologo_id, data_hora e modalidade são obrigatórios.' });
  }
  if (!isUUID(psicologo_id)) {
    return res.status(400).json({ ok: false, error: 'psicologo_id inválido.' });
  }
  if (!['online', 'presencial'].includes(modalidade)) {
    return res.status(400).json({ ok: false, error: 'Modalidade deve ser online ou presencial.' });
  }
  if (typeof data_hora !== 'string' || Number.isNaN(Date.parse(data_hora))) {
    return res.status(400).json({ ok: false, error: 'data_hora inválida.' });
  }
  if (observacoes !== undefined && observacoes !== null && (typeof observacoes !== 'string' || observacoes.length > 2000)) {
    return res.status(400).json({ ok: false, error: 'Observações inválidas (máx. 2000 caracteres).' });
  }
  // Impede links maliciosos (javascript:, phishing) que seriam exibidos como botão no painel
  if (link_meet && !isSafeMeetLink(link_meet)) {
    return res.status(400).json({ ok: false, error: 'link_meet deve ser um link https://meet.google.com/...' });
  }

  try {
    // paciente_id SEMPRE vem do token, nunca do corpo da requisição
    const paciente = await query('SELECT id FROM pacientes WHERE usuario_id = $1', [req.user.id]);
    if (paciente.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Usuário não é um paciente cadastrado.' });
    }

    const psic = await query(`SELECT id FROM psicologos WHERE id = $1 AND status_validacao = 'aprovado'`, [psicologo_id]);
    if (psic.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Psicólogo não encontrado ou não aprovado.' });
    }

    const result = await query(
      `INSERT INTO agendamentos (paciente_id, psicologo_id, data_hora, modalidade, observacoes, link_meet)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [paciente.rows[0].id, psicologo_id, data_hora, modalidade, observacoes || null, link_meet || null]
    );

    res.status(201).json({ ok: true, agendamento: result.rows[0], mensagem: 'Consulta agendada com sucesso.' });
  } catch (error) {
    serverError(res, error, 'Criar agendamento');
  }
});

// ─── Cancelar agendamento (corrigido: IDOR) ─────────────────────────
router.patch('/agendamentos/:id/cancelar', requireAuth, requireUUIDParam('id'), async (req, res) => {
  const { id } = req.params;

  try {
    // UPDATE só afeta a linha se o usuário for dono (paciente/psicólogo) ou admin
    const result = await query(
      `UPDATE agendamentos SET status = 'cancelado'
        WHERE id = $1
          AND (
            $3 = 'admin'
            OR paciente_id IN (SELECT id FROM pacientes WHERE usuario_id = $2)
            OR psicologo_id IN (SELECT id FROM psicologos WHERE usuario_id = $2)
          )
        RETURNING *`,
      [id, req.user.id, req.user.tipo]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ ok: false, error: 'Agendamento não encontrado ou você não tem permissão para cancelá-lo.' });
    }
    res.json({ ok: true, agendamento: result.rows[0], mensagem: 'Consulta cancelada.' });
  } catch (error) {
    serverError(res, error, 'Cancelar agendamento');
  }
});

// ─── Mensagens do chat por agendamento (corrigido: IDOR) ────────────
router.get('/mensagens/:agendamentoId', requireAuth, requireUUIDParam('agendamentoId'), async (req, res) => {
  try {
    const agendamento = await findAgendamentoDoUsuario(req.params.agendamentoId, req.user);
    if (!agendamento) {
      return res.status(403).json({ ok: false, error: 'Acesso negado às mensagens desta consulta.' });
    }

    const result = await query(
      `SELECT m.id, m.agendamento_id, m.autor_id, m.texto, m.criado_em, u.nome AS autor_nome
       FROM mensagens m
       LEFT JOIN usuarios u ON u.id = m.autor_id
       WHERE m.agendamento_id = $1
       ORDER BY m.criado_em ASC`,
      [req.params.agendamentoId]
    );
    res.json(result.rows);
  } catch (error) {
    serverError(res, error, 'Listar mensagens');
  }
});

// ─── Enviar mensagem no chat (corrigido: IDOR) ──────────────────────
router.post('/mensagens', requireAuth, async (req, res) => {
  const { agendamento_id, texto } = req.body;

  if (!agendamento_id || typeof texto !== 'string' || !texto.trim()) {
    return res.status(400).json({ ok: false, error: 'agendamento_id e texto são obrigatórios.' });
  }
  if (!isUUID(agendamento_id)) {
    return res.status(400).json({ ok: false, error: 'agendamento_id inválido.' });
  }
  if (texto.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Mensagem muito longa (máx. 5000 caracteres).' });
  }

  try {
    const agendamento = await findAgendamentoDoUsuario(agendamento_id, req.user);
    if (!agendamento) {
      return res.status(403).json({ ok: false, error: 'Você não pode enviar mensagens nesta consulta.' });
    }

    const result = await query(
      `INSERT INTO mensagens (agendamento_id, autor_id, texto)
       VALUES ($1, $2, $3) RETURNING *`,
      [agendamento_id, req.user.id, texto.trim()]
    );
    res.status(201).json({ ok: true, mensagem: result.rows[0] });
  } catch (error) {
    serverError(res, error, 'Enviar mensagem');
  }
});

export default router;
