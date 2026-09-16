import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../config/db.js';
import { generateToken, requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// ─── Validações reutilizáveis ───────────────────────────────────────
const validateRegister = [
  body('nome').trim().notEmpty().withMessage('Nome é obrigatório.'),
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.'),
  body('tipo').isIn(['paciente', 'psicologo']).withMessage('Tipo deve ser paciente ou psicologo.')
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('senha').notEmpty().withMessage('Senha é obrigatória.'),
  body('tipo').isIn(['paciente', 'psicologo', 'admin']).withMessage('Tipo inválido.')
];

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ ok: false, errors: errors.array() });
  }
  return null;
}

// ─── POST /api/auth/register ────────────────────────────────────────
router.post('/register', validateRegister, async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return errRes;

  const { nome, email, senha, tipo, telefone } = req.body;

  try {
    // Verificar email único
    const exists = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'E-mail já cadastrado.' });
    }

    // Hash da senha
    const senha_hash = await bcrypt.hash(senha, 10);

    // Inserir usuário
    const usuario = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone, tipo)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, tipo, criado_em`,
      [nome, email, senha_hash, telefone || null, tipo]
    );

    const user = usuario.rows[0];

    // Criar registro específico por tipo
    if (tipo === 'paciente') {
      const { data_nascimento, genero, observacoes } = req.body;
      await query(
        `INSERT INTO pacientes (usuario_id, data_nascimento, genero, observacoes) VALUES ($1, $2, $3, $4)`,
        [user.id, data_nascimento || null, genero || null, observacoes || null]
      );
    }

    if (tipo === 'psicologo') {
      const { crp, especialidade, bio, valor_consulta, cidade, estado } = req.body;
      if (!crp) {
        return res.status(400).json({ ok: false, error: 'CRP é obrigatório para psicólogos.' });
      }

      const psicologo = await query(
        `INSERT INTO psicologos (usuario_id, crp, especialidade, bio, valor_consulta)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user.id, crp, especialidade || null, bio || null, valor_consulta || 0]
      );

      if (cidade || estado) {
        await query(
          `INSERT INTO enderecos (psicologo_id, cidade, estado) VALUES ($1, $2, $3)`,
          [psicologo.rows[0].id, cidade || null, estado || null]
        );
      }
    }

    // Gerar token
    const token = generateToken(user);

    return res.status(201).json({
      ok: true,
      token,
      usuario: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo },
      mensagem: 'Conta criada com sucesso.'
    });
  } catch (error) {
    console.error('Erro no registro:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro interno ao criar conta.' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────────
router.post('/login', validateLogin, async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return errRes;

  const { email, senha, tipo } = req.body;

  try {
    const result = await query(
      'SELECT id, nome, email, senha_hash, tipo FROM usuarios WHERE email = $1 AND tipo = $2',
      [email, tipo === 'admin' ? 'admin' : tipo === 'Psicólogo' ? 'psicologo' : tipo === 'Paciente' ? 'paciente' : tipo]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
    }

    const user = result.rows[0];

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ ok: false, error: 'Usuário ou senha inválidos.' });
    }

    // Buscar dados extras conforme tipo
    let extras = {};
    if (user.tipo === 'psicologo') {
      const psic = await query('SELECT id AS psicologo_id, status_validacao, crp FROM psicologos WHERE usuario_id = $1', [user.id]);
      if (psic.rows.length) extras = psic.rows[0];
    } else if (user.tipo === 'paciente') {
      const pac = await query('SELECT id AS paciente_id FROM pacientes WHERE usuario_id = $1', [user.id]);
      if (pac.rows.length) extras = pac.rows[0];
    }

    const token = generateToken(user);

    return res.json({
      ok: true,
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo: user.tipo,
        ...extras
      },
      mensagem: 'Login realizado com sucesso.'
    });
  } catch (error) {
    console.error('Erro no login:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro interno ao fazer login.' });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, nome, email, telefone, tipo, criado_em FROM usuarios WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuário não encontrado.' });
    }

    const user = result.rows[0];
    let extras = {};

    if (user.tipo === 'psicologo') {
      const psic = await query(
        `SELECT p.id AS psicologo_id, p.crp, p.especialidade, p.bio, p.valor_consulta,
                p.atende_online, p.atende_presencial, p.status_validacao,
                e.cidade, e.estado
         FROM psicologos p LEFT JOIN enderecos e ON e.psicologo_id = p.id
         WHERE p.usuario_id = $1`,
        [user.id]
      );
      if (psic.rows.length) extras = psic.rows[0];
    } else if (user.tipo === 'paciente') {
      const pac = await query(
        'SELECT id AS paciente_id, data_nascimento, genero FROM pacientes WHERE usuario_id = $1',
        [user.id]
      );
      if (pac.rows.length) extras = pac.rows[0];
    }

    return res.json({ ok: true, usuario: { ...user, ...extras } });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro interno.' });
  }
});

export default router;
