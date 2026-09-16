import express from 'express';
import { query } from '../config/db.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─── Health do banco ────────────────────────────────────────────────
router.get('/db/health', async (_, res) => {
  try {
    const result = await query('SELECT NOW() AS agora');
    res.json({ ok: true, database: 'PostgreSQL conectado', agora: result.rows[0].agora });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Psicólogos (público) ───────────────────────────────────────────
router.get('/psicologos', async (_, res) => {
  try {
    const result = await query(`
      SELECT p.id, u.nome, u.email, u.telefone, p.crp, p.especialidade, p.bio,
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
    res.status(500).json({ ok: false, error: error.message });
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Aprovar/Reprovar psicólogo (admin) ─────────────────────────────
router.patch('/psicologos/:id/validacao', requireAuth, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status_validacao } = req.body;

  if (!['aprovado', 'reprovado'].includes(status_validacao)) {
    return res.status(400).json({ ok: false, error: 'Status deve ser aprovado ou reprovado.' });
  }

  try {
    const result = await query(
      'UPDATE psicologos SET status_validacao = $1 WHERE id = $2 RETURNING *',
      [status_validacao, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Psicólogo não encontrado.' });
    }
    res.json({ ok: true, psicologo: result.rows[0], mensagem: `Psicólogo ${status_validacao}.` });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Cadastro de psicólogo (público - usado no registro) ────────────
router.post('/psicologos', async (req, res) => {
  const { nome, email, telefone, crp, especialidade, bio, valor_consulta, cidade, estado } = req.body;

  if (!nome || !email || !crp) {
    return res.status(400).json({ ok: false, error: 'nome, email e crp são obrigatórios.' });
  }

  try {
    const usuario = await query(
      `INSERT INTO usuarios (nome, email, telefone, tipo) VALUES ($1, $2, $3, 'psicologo') RETURNING id`,
      [nome, email, telefone || null]
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
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Planos (público) ───────────────────────────────────────────────
router.get('/planos', async (_, res) => {
  try {
    const result = await query('SELECT * FROM planos WHERE ativo = true ORDER BY valor');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Agendamentos do usuário logado ─────────────────────────────────
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
        LEFT JOIN psicologos ps ON ps.id = a.psicologo_id
        WHERE ps.usuario_id = $1
        ORDER BY a.data_hora DESC
      `, [req.user.id]);
    } else {
      result = await query(`
        SELECT a.*, ups.nome AS psicologo
        FROM agendamentos a
        LEFT JOIN psicologos ps ON ps.id = a.psicologo_id
        LEFT JOIN usuarios ups ON ups.id = ps.usuario_id
        LEFT JOIN pacientes pa ON pa.id = a.paciente_id
        WHERE pa.usuario_id = $1
        ORDER BY a.data_hora DESC
      `, [req.user.id]);
    }
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Criar agendamento ─────────────────────────────────────────────
router.post('/agendamentos', requireAuth, async (req, res) => {
  const { psicologo_id, data_hora, modalidade, observacoes, link_meet } = req.body;

  if (!psicologo_id || !data_hora || !modalidade) {
    return res.status(400).json({ ok: false, error: 'psicologo_id, data_hora e modalidade são obrigatórios.' });
  }

  try {
    // Buscar paciente_id do usuário logado
    const paciente = await query('SELECT id FROM pacientes WHERE usuario_id = $1', [req.user.id]);
    if (paciente.rows.length === 0) {
      return res.status(400).json({ ok: false, error: 'Usuário não é um paciente cadastrado.' });
    }

    const result = await query(
      `INSERT INTO agendamentos (paciente_id, psicologo_id, data_hora, modalidade, observacoes, link_meet)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [paciente.rows[0].id, psicologo_id, data_hora, modalidade, observacoes || null, link_meet || null]
    );

    res.status(201).json({ ok: true, agendamento: result.rows[0], mensagem: 'Consulta agendada com sucesso.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Cancelar agendamento ───────────────────────────────────────────
router.patch('/agendamentos/:id/cancelar', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Agendamento não encontrado.' });
    }
    res.json({ ok: true, agendamento: result.rows[0], mensagem: 'Consulta cancelada.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Mensagens do chat por agendamento ──────────────────────────────
router.get('/mensagens/:agendamentoId', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, u.nome AS autor_nome
       FROM mensagens m
       LEFT JOIN usuarios u ON u.id = m.autor_id
       WHERE m.agendamento_id = $1
       ORDER BY m.criado_em ASC`,
      [req.params.agendamentoId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ─── Enviar mensagem no chat ────────────────────────────────────────
router.post('/mensagens', requireAuth, async (req, res) => {
  const { agendamento_id, texto } = req.body;

  if (!agendamento_id || !texto?.trim()) {
    return res.status(400).json({ ok: false, error: 'agendamento_id e texto são obrigatórios.' });
  }

  try {
    const result = await query(
      `INSERT INTO mensagens (agendamento_id, autor_id, texto)
       VALUES ($1, $2, $3) RETURNING *`,
      [agendamento_id, req.user.id, texto.trim()]
    );
    res.status(201).json({ ok: true, mensagem: result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
