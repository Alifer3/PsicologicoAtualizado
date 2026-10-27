import rateLimit from 'express-rate-limit';

/**
 * Proteções contra bots e automação maliciosa.
 *
 *  1. blockScannerBots   -> bloqueia User-Agents de ferramentas de ataque conhecidas
 *                           (sqlmap, nikto, nmap, nuclei...) e requisições sem User-Agent
 *                           nas rotas sensíveis.
 *  2. honeypot           -> campo invisível no formulário ("website"). Humanos não veem
 *                           e não preenchem; bots que preenchem todos os campos são barrados.
 *  3. Rate limiting      -> global por IP, auth por IP e login por CONTA (impede brute-force
 *                           distribuído em vários IPs contra o mesmo e-mail).
 */

const num = (v, def) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : def);
const WINDOW_MS = num(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);

export const SCANNER_UA_PATTERN =
  /(sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|netsparker|wpscan|dirbuster|gobuster|ffuf|hydra|havij|w3af|openvas|burpcollaborator|python-requests|go-http-client|libwww-perl|scrapy)/i;

export function blockScannerBots({ requireUserAgent = false } = {}) {
  return (req, res, next) => {
    const ua = (req.get('user-agent') || '').trim();
    if (requireUserAgent && !ua) {
      return res.status(403).json({ ok: false, error: 'Requisição bloqueada: cliente não identificado.' });
    }
    if (ua && SCANNER_UA_PATTERN.test(ua)) {
      return res.status(403).json({ ok: false, error: 'Requisição bloqueada: tráfego automatizado detectado.' });
    }
    next();
  };
}

export const HONEYPOT_FIELD = 'website';

export function honeypot(req, res, next) {
  const trap = req.body?.[HONEYPOT_FIELD];
  if (trap !== undefined && String(trap).trim() !== '') {
    return res.status(400).json({ ok: false, error: 'Requisição inválida.' });
  }
  next();
}

const limitMessage = (msg) => ({ ok: false, error: msg });

export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: num(process.env.RATE_LIMIT_MAX, 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Muitas requisições. Tente novamente em alguns minutos.')
});

export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: num(process.env.AUTH_RATE_LIMIT_MAX, 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: limitMessage('Muitas tentativas. Tente novamente em 15 minutos.')
});

// Limita tentativas de login com FALHA por conta (e-mail), independente do IP.
export const loginAccountLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: num(process.env.LOGIN_ACCOUNT_MAX_FAILS, 5),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String(req.body?.email || '').trim().toLowerCase()}`,
  skip: (req) => typeof req.body?.email !== 'string' || !req.body.email.trim(),
  message: limitMessage('Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde.')
});
