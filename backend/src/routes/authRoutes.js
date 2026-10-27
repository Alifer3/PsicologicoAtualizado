import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../config/db.js';
import { generateToken, requireAuth } from '../middleware/authMiddleware.js';
import { honeypot, loginAccountLimiter } from '../middleware/botProtection.js';

const router = express.Router();

// ─── Criptografia de senhas ─────────────────────────────────────────
// bcrypt com custo >= 12 (OWASP). Cada hash tem salt aleatório próprio.
export const BCRYPT_ROUNDS = Math.max(10, Number(process.env.BCRYPT_ROUNDS) || 12);

// Hash "fantasma": usado quando o e-mail não existe, para que o tempo de resposta
// seja o mesmo de uma senha errada (evita enumeração de usuários por timing).
const DUMMY_HASH = bcrypt.hashSync('psicoconnect-dummy-password', BCRYPT_ROUNDS);

// Senha: 8 a 72 caracteres (bcrypt ignora bytes após o 72º), com letra e número.
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;
const CRP_RULE = /^\d{2}\/\d{4,6}$/;

// ─── Validações reutilizáveis ───────────────────────────────────────
const validateRegister = [
  body('nome').isString().trim().isLength({ min: 2, max: 150 }).withMessage('Nome é obrigatório (2 a 150 caracteres).'),
  body('email').isString().trim().isEmail().isLength({ max: 150 }).normalizeEmail().withMessage('E-mail inválido.'),
  body('senha').isString().matches(PASSWORD_RULE)
    .withMessage('Senha deve ter de 8 a 72 caracteres, com pelo menos uma letra e um número.'),
  body('tipo').isIn(['paciente', 'psicologo']).withMessage('Tipo deve ser paciente ou psicologo.'),
  body('telefone').optional({ values: 'falsy' }).isString().isLength({ max: 30 }).withMessage('Telefone inválido.'),
  body('crp').if(body('tipo').equals('psicologo'))
    .isString().trim().matches(CRP_RULE).withMessage('CRP é obrigatório no formato 00/00000.'),
  body(['especialidade', 'cidade', 'genero']).optional({ values: 'falsy' }).isString().isLength({ max: 120 }),
  body('estado').optional({ values: 'falsy' }).isString().isLength({ min: 2, max: 2 }),
  body('valor_consulta').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100000 })
];

const validateLogin = [
  body('email').isString().trim().isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  body('senha').isString().isLength({ min: 1, max: 200 }).withMessage('Senha é obrigatória.'),
  body('tipo').optional().isIn(['paciente', 'psicologo', 'admin']).withMessage('Tipo inválido.')
];

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Não devolve o valor enviado (pode conter a senha)
    const safe = errors.array().map(({ path, msg }) => ({ campo: path, msg }));
    return res.status(400).json({ ok: false, errors: safe });
  }
  return null;
}

// Nunca devolver senha_hash ao cliente
function publicUser(user, extras = {}) {
  const { senha_hash, senha, ...rest } = { ...user, ...extras };
  return rest;
}

// ─── POST /api/auth/register ────────────────────────────────────────
router.post('/register', honeypot, validateRegister, async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return errRes;

  const { nome, email, senha, tipo, telefone } = req.body;

  try {
    const exists = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ ok: false, error: 'E-mail já cadastrado.' });
    }

    const senha_hash = await bcrypt.hash(senha, BCRYPT_ROUNDS);

    // Transação: ou cria tudo (usuário + perfil), ou nada.
    const user = await withTransaction(async (client) => {
      const usuario = await client.query(
        `INSERT INTO usuarios (nome, email, senha_hash, telefone, tipo)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, tipo, criado_em`,
        [nome, email, senha_hash, telefone || null, tipo]
      );
      const u = usuario.rows[0];

      if (tipo === 'paciente') {
        const { data_nascimento, genero, observacoes } = req.body;
        await client.query(
          `INSERT INTO pacientes (usuario_id, data_nascimento, genero, observacoes) VALUES ($1, $2, $3, $4)`,
          [u.id, data_nascimento || null, genero || null, observacoes || null]
        );
      }

      if (tipo === 'psicologo') {
        // status_validacao NÃO é aceito do cliente: sempre nasce 'pendente' (mass assignment)
        const { crp, especialidade, bio, valor_consulta, cidade, estado } = req.body;
        const psicologo = await client.query(
          `INSERT INTO psicologos (usuario_id, crp, especialidade, bio, valor_consulta)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [u.id, crp, especialidade || null, bio || null, valor_consulta || 0]
        );
        if (cidade || estado) {
          await client.query(
            `INSERT INTO enderecos (psicologo_id, cidade, estado) VALUES ($1, $2, $3)`,
            [psicologo.rows[0].id, cidade || null, estado ? String(estado).toUpperCase() : null]
          );
        }
      }
      return u;
    });

    const token = generateToken(user);

    return res.status(201).json({
      ok: true,
      token,
      usuario: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo },
      mensagem: 'Conta criada com sucesso.'
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ ok: false, error: 'E-mail ou CRP já cadastrado.' });
    }
    console.error('Erro no registro:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro interno ao criar conta.' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────────
router.post('/login', loginAccountLimiter, honeypot, validateLogin, async (req, res) => {
  const errRes = validationErrors(req, res);
  if (errRes) return errRes;

  const { email, senha, tipo } = req.body;
  const INVALID = { ok: false, error: 'Usuário ou senha inválidos.' };

  try {
    const result = await query(
      'SELECT id, nome, email, senha_hash, tipo FROM usuarios WHERE email = $1',
      [email]
    );
    const user = result.rows[0];

    // Sempre executa bcrypt.compare (mesmo sem usuário) => tempo constante
    const senhaValida = await bcrypt.compare(senha, user?.senha_hash || DUMMY_HASH);

    if (!user || !user.senha_hash || !senhaValida || (tipo && tipo !== user.tipo)) {
      return res.status(401).json(INVALID);
    }

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
      usuario: publicUser(user, extras),
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

    return res.json({ ok: true, usuario: publicUser(user, extras) });
  } catch (error) {
    console.error('Erro ao buscar perfil:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro interno.' });
  }
});

export default router;
