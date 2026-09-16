import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { google } from 'googleapis';
import databaseRoutes from './routes/databaseRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || 'http://localhost:5500';

// ─── Segurança ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

// CORS configurável por variável de ambiente
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sem origin (mobile, Postman, etc)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origem não permitida pelo CORS.'));
  },
  credentials: true
}));

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas requisições. Tente novamente em alguns minutos.' }
});
app.use(limiter);

// Rate limiting mais restrito para auth (previne brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { ok: false, error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

app.use(express.json({ limit: '1mb' }));

// ─── Rotas ──────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
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
app.post('/api/payments/create-checkout', async (req, res) => {
  const { plano, metodo = 'mock', valor, nome, email, psicologoId } = req.body;
  const amount = Number(valor || valoresPlanos[plano]);
  if (!plano || !amount) return res.status(400).json({ ok: false, error: 'Plano ou valor inválido.' });

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
        metadata: { psicologoId: String(psicologoId || ''), plano },
        success_url: `${APP_URL}/planos.html?payment=success`,
        cancel_url: `${APP_URL}/planos.html?payment=cancel`
      });
      return res.json({ ok: true, status: 'Pendente', gateway: 'Stripe', transacaoId: session.id, checkoutUrl: session.url, mensagem: 'Checkout Stripe criado.' });
    }

    if ((provider.includes('mercado') || provider.includes('mercadopago')) && process.env.MERCADO_PAGO_ACCESS_TOKEN) {
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
      const preference = new Preference(client);
      const result = await preference.create({ body: {
        items: [{ title: `PsicoConnect - Plano ${plano}`, quantity: 1, currency_id: 'BRL', unit_price: amount }],
        payer: { name, email },
        external_reference: String(psicologoId || ''),
        back_urls: { success: `${APP_URL}/planos.html?payment=success`, failure: `${APP_URL}/planos.html?payment=failure`, pending: `${APP_URL}/planos.html?payment=pending` },
        auto_return: 'approved'
      }});
      return res.json({ ok: true, status: 'Pendente', gateway: 'Mercado Pago', transacaoId: result.id, checkoutUrl: result.init_point || result.sandbox_init_point, mensagem: 'Preferência Mercado Pago criada.' });
    }

    return res.json({ ok: true, simulated: true, status: 'Pago', gateway: 'Mock', transacaoId: `mock_pay_${Date.now()}`, checkoutUrl: `${APP_URL}/planos.html?payment=mock`, mensagem: 'Pagamento aprovado em sandbox local.' });
  } catch (error) {
    console.error('Erro no pagamento:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro ao processar pagamento.' });
  }
});

// ─── Google Meet ────────────────────────────────────────────────────
app.post('/api/meet/create-event', async (req, res) => {
  const { consultaId, summary, description, startDateTime, endDateTime, pacienteEmail, psicologoEmail } = req.body;
  const provider = (process.env.GOOGLE_MEET_PROVIDER || 'mock').toLowerCase();

  try {
    if (provider === 'google' && process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
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
          summary,
          description,
          start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: endDateTime || addOneHour(startDateTime), timeZone: 'America/Sao_Paulo' },
          attendees: [pacienteEmail, psicologoEmail].filter(Boolean).map(email => ({ email })),
          conferenceData: { createRequest: { requestId: `psico-${consultaId}-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        }
      });
      return res.json({ ok: true, simulated: false, calendarEventId: event.data.id, meetLink: event.data.hangoutLink, mensagem: 'Evento Google Calendar criado com Meet.' });
    }

    return res.json({ ok: true, simulated: true, calendarEventId: `mock_event_${consultaId}`, meetLink: `https://meet.google.com/${slugMeet(consultaId)}`, mensagem: 'Meet criado em sandbox local.' });
  } catch (error) {
    console.error('Erro no Meet:', error.message);
    return res.status(500).json({ ok: false, error: 'Erro ao criar evento Meet.' });
  }
});

// ─── Tratamento de erros global ─────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Erro não tratado:', err.message);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Erro interno do servidor.'
    : err.message;
  res.status(status).json({ ok: false, error: message });
});

// ─── Exportar app para testes ───────────────────────────────────────
export { app };

// ─── Iniciar servidor ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`PsicoConnect API v2.0 rodando em http://localhost:${PORT}`));
}
