import { query } from '../config/db.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Valida UUID antes de chegar no banco (bloqueia payloads de injeção em parâmetros de rota). */
export function isUUID(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Middleware: valida que req.params[name] é um UUID. */
export function requireUUIDParam(name) {
  return (req, res, next) => {
    if (!isUUID(req.params[name])) {
      return res.status(400).json({ ok: false, error: `Parâmetro ${name} inválido.` });
    }
    next();
  };
}

/** Links de reunião aceitos (evita javascript:, data:, phishing). */
export function isSafeMeetLink(link) {
  return typeof link === 'string' && /^https:\/\/meet\.google\.com\/[a-z0-9-]{3,64}$/i.test(link);
}

/**
 * Controle de acesso a nível de objeto (anti-IDOR):
 * o usuário só acessa um agendamento se for o paciente, o psicólogo da consulta ou admin.
 * Retorna a linha do agendamento (com e-mails dos participantes) ou null.
 */
export async function findAgendamentoDoUsuario(agendamentoId, user) {
  if (!isUUID(String(agendamentoId))) return null;
  const result = await query(
    `SELECT a.id, a.status, a.data_hora, a.modalidade,
            up.id AS paciente_usuario_id, up.email AS paciente_email,
            ups.id AS psicologo_usuario_id, ups.email AS psicologo_email
       FROM agendamentos a
       LEFT JOIN pacientes pa ON pa.id = a.paciente_id
       LEFT JOIN usuarios up ON up.id = pa.usuario_id
       LEFT JOIN psicologos ps ON ps.id = a.psicologo_id
       LEFT JOIN usuarios ups ON ups.id = ps.usuario_id
      WHERE a.id = $1
        AND ($3 = 'admin' OR up.id = $2 OR ups.id = $2)`,
    [agendamentoId, user.id, user.tipo]
  );
  return result.rows[0] || null;
}

/** Resposta de erro sem vazar detalhes internos (stack, SQL, nomes de tabelas). */
export function serverError(res, error, contexto = 'Erro interno') {
  console.error(`${contexto}:`, error?.message);
  return res.status(500).json({ ok: false, error: 'Erro interno do servidor.' });
}
