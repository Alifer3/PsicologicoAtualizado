import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import Stripe from 'stripe';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import databaseRoutes from './routes/databaseRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { assertJwtConfig, requireAuth, requireRole } from './middleware/authMiddleware.js';
import { authLimiter, blockScannerBots, globalLimiter } from './middleware/botProtection.js';
import { findAgendamentoDoUsuario, isUUID, serverError } from './utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../frontend');

// ─── Fail-fast: sem JWT_SECRET forte a API não sobe ─────────────────
try {
  assertJwtConfig();
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5500');

// Atrás de proxy (Vercel/Render) o IP real vem do X-Forwarded-For.
// Necessário para o rate limit identificar o cliente correto.
const trustProxy = process.env.TRUST_PROXY ?? (process.env.VERCEL ? '1' : 'false');
app.set('trust proxy', trustProxy === 'false' ? false : Number(trustProxy) || trustProxy);

// ─── Segurança: cabeçalhos HTTP ─────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));

// ─── CORS ───────────────────────────────────────────────────────────
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000')
    .split(',').map(o => o.trim()).filter(Boolean)
);
for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
  if (host) allowedOrigins.add(`https://${host}`);
}

app.use(cors({
  origin: (origin, callback) => {
    // Sem Origin = mesma origem, mobile, Postman, curl
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    const err = new Error('Origem não permitida pelo CORS.');
    err.status = 403;
    callback(err);
  },
  credentials: true
}));

// ─── Anti-bot ───────────────────────────────────────────────────────
app.use('/api', blockScannerBots());
app.use(globalLimiter);
app.use(express.json({ limit: '100kb' }));

// ─── Rotas ──────────────────────────────────────────────────────────
app.use('/api/auth', blockScannerBots({ requireUserAgent: true }), authLimiter, authRoutes);
app.use('/api', databaseRoutes);

// ─── Constantes ─────────────────────────────────────────────────────
const valoresPlanos = { 'Básico': 29.90, 'Profissional': 49.90, 'Premium': 79.90 };

function slugMeet(seed) {
  const raw = String(seed || Date.now()).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, 'x').slice(0, 12);
  return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 10)}`;
}

function addOneHour(dateTime) {
  const d = new Date(dateTime);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

// ─── Health Check ───────────────────────────────────────────────────
app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    service: 'PsicoConnect API',
    version: '2.0.0',
    providers: {
      payment: process.env.PAYMENT_PROVIDER || 'mock',
      meet: process.env.GOOGLE_MEET_PROVIDER || 'mock'
    }
  });
});

// ─── Pagamentos ─────────────────────────────────────────────────────
// SEGURANÇA: o valor é SEMPRE definido pelo servidor (antes o cliente podia enviar
// "valor": 0.01 e pagar o plano que quisesse). Exige psicólogo autenticado.
app.post('/api/payments/create-checkout', requireAuth, requireRole('psicologo', 'admin'), async (req, res) => {
  const { plano, metodo = 'mock', nome } = req.body;
  const amount = Object.prototype.hasOwnProperty.call(valoresPlanos, plano) ? valoresPlanos[plano] : null;
  if (!amount) return res.status(400).json({ ok: false, error: 'Plano inválido.' });

  const email = req.user.email;
  const psicologoId = req.user.id;
  const provider = (process.env.PAYMENT_PROVIDER || metodo || 'mock').toLowerCase();

  try {
    if (provider.includes('stripe') && process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: Math.round(amount * 100),
            recurring: { interval: 'month' },
            product_data: { name: `PsicoConnect - Plano ${plano}` }
          }
        }],
        metadata: { psicologoId: String(psicologoId), plano },
        success_url: `${APP_URL}/planos.html?payment=success`,
        cancel_url: `${APP_URL}/planos.html?payment=cancel`
      });
      return res.json({ ok: true, status: 'Pendente', gateway: 'Stripe', valor: amount, transacaoId: session.id, checkoutUrl: session.url, mensagem: 'Checkout Stripe criado.' });
    }

    if ((provider.includes('mercado') || provider.includes('mercadopago')) && process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
      const preference = new Preference(client);
      const result = await preference.create({ body: {
        items: [{ title: `PsicoConnect - Plano ${plano}`, quantity: 1, currency_id: 'BRL', unit_price: amount }],
        payer: { name: typeof nome === 'string' ? nome.slice(0, 150) : undefined, email },
        external_reference: String(psicologoId),
        back_urls: { success: `${APP_URL}/planos.html?payment=success`, failure: `${APP_URL}/planos.html?payment=failure`, pending: `${APP_URL}/planos.html?payment=pending` },
        auto_return: 'approved'
      }});
      return res.json({ ok: true, status: 'Pendente', gateway: 'Mercado Pago', valor: amount, transacaoId: result.id, checkoutUrl: result.init_point || result.sandbox_init_point, mensagem: 'Preferência Mercado Pago criada.' });
    }

    return res.json({ ok: true, simulated: true, status: 'Pago', gateway: 'Mock', valor: amount, transacaoId: `mock_pay_${Date.now()}`, checkoutUrl: `${APP_URL}/planos.html?payment=mock`, mensagem: 'Pagamento aprovado em sandbox local.' });
  } catch (error) {
    return serverError(res, error, 'Erro no pagamento');
  }
});

// ─── Google Meet ────────────────────────────────────────────────────
// SEGURANÇA: exige login, verifica se a consulta pertence ao usuário (anti-IDOR) e
// usa os e-mails do BANCO (ignora e-mails do corpo => sem spam/spoofing de convites).
app.post('/api/meet/create-event', requireAuth, async (req, res) => {
  const { consultaId, summary, description, startDateTime, endDateTime } = req.body;
  if (!isUUID(consultaId)) {
    return res.status(400).json({ ok: false, error: 'consultaId inválido.' });
  }

  try {
    const agendamento = await findAgendamentoDoUsuario(consultaId, req.user);
    if (!agendamento) {
      return res.status(403).json({ ok: false, error: 'Consulta não encontrada ou acesso não autorizado.' });
    }

    const provider = (process.env.GOOGLE_MEET_PROVIDER || 'mock').toLowerCase();
    if (provider === 'google' && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      const start = startDateTime || new Date(agendamento.data_hora).toISOString();
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
      const calendar = google.calendar({ version: 'v3', auth });
      const event = await calendar.events.insert({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        conferenceDataVersion: 1,
        requestBody: {
          summary: String(summary || 'Consulta PsicoConnect').slice(0, 200),
          description: String(description || '').slice(0, 2000),
          start: { dateTime: start, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: endDateTime || addOneHour(start), timeZone: 'America/Sao_Paulo' },
          attendees: [agendamento.paciente_email, agendamento.psicologo_email].filter(Boolean).map(email => ({ email })),
          conferenceData: { createRequest: { requestId: `psico-${consultaId}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        }
      });
      return res.json({ ok: true, simulated: false, calendarEventId: event.data.id, meetLink: event.data.hangoutLink, mensagem: 'Evento Google Calendar criado com Meet.' });
    }

    return res.json({ ok: true, simulated: true, calendarEventId: `mock_event_${consultaId}`, meetLink: `https://meet.google.com/${slugMeet(consultaId)}`, mensagem: 'Meet criado em sandbox local.' });
  } catch (error) {
    return serverError(res, error, 'Erro no Meet');
  }
});

// ─── Frontend Estático (compatível com local, Render e Vercel) ──────
app.use(express.static(frontendDir, { extensions: ['html'] }));
app.get('/', (_, res) => res.sendFile(path.join(frontendDir, 'index.html')));

// ─── 404 da API ─────────────────────────────────────────────────────
app.use('/api', (_, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada.' }));

// ─── Fallback para rotas do Frontend ────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// ─── Tratamento de erros global ─────────────────────────────────────
// Nunca devolve stack trace nem mensagens internas (SQL, paths) ao cliente.
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('Erro não tratado:', err.message);
  const message = status === 413 ? 'Corpo da requisição muito grande.'
    : status === 400 && err.type === 'entity.parse.failed' ? 'JSON inválido.'
    : status < 500 && err.expose !== false ? err.message
    : 'Erro interno do servidor.';
  res.status(status).json({ ok: false, error: message });
});

// ─── Exportar app para testes e para a Vercel ───────────────────────
export { app };
export default app;

// ─── Iniciar servidor (local/Render). Na Vercel o app roda como função. ──
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`PsicoConnect API v2.0 rodando em http://localhost:${PORT}`));
}
