import jwt from 'jsonwebtoken';

// SEGURANÇA (Criptografia): sem valor padrão hardcoded. Se a variável não existir,
// a aplicação NÃO deve assinar tokens com um segredo público conhecido.
const MIN_SECRET_LENGTH = 32;
const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET ausente ou fraca (mínimo ${MIN_SECRET_LENGTH} caracteres).`);
  }
  return secret;
}

/**
 * Valida a configuração no startup (fail-fast).
 * Retorna true se OK; caso contrário lança erro.
 */
export function assertJwtConfig() {
  getSecret();
  return true;
}

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

  const token = authHeader.slice(7).trim();

  try {
    // algorithms fixo: impede ataques "alg: none" e confusão de algoritmo
    const decoded = jwt.verify(token, getSecret(), { algorithms: [JWT_ALGORITHM] });
    if (!decoded?.id || !decoded?.tipo) throw new Error('payload inválido');
    req.user = { id: decoded.id, email: decoded.email, tipo: decoded.tipo };
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
    getSecret(),
    { algorithm: JWT_ALGORITHM, expiresIn: JWT_EXPIRES_IN }
  );
}
