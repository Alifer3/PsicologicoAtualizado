import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_dev_secret_troque_em_producao';

/**
 * Middleware que exige autenticação via JWT.
 * Espera header: Authorization: Bearer <token>
 * Injeta req.user com { id, email, tipo }
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token inválido ou expirado.' });
  }
}

/**
 * Middleware que exige um tipo específico de usuário.
 * Deve ser usado APÓS requireAuth.
 * @param  {...string} tipos - Tipos permitidos: 'paciente', 'psicologo', 'admin'
 */
export function requireRole(...tipos) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, error: 'Não autenticado.' });
    }
    if (!tipos.includes(req.user.tipo)) {
      return res.status(403).json({ ok: false, error: 'Acesso não autorizado para este perfil.' });
    }
    next();
  };
}

/**
 * Gera um token JWT para o usuário.
 * @param {object} user - Objeto com id, email e tipo
 * @returns {string} Token JWT
 */
export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, tipo: user.tipo },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}
