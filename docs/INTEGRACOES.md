# Integrações de Pagamento e Google Meet

Este projeto agora possui duas formas de teste:

1. **Modo local sem backend**: basta abrir `index.html`. O pagamento e o Meet são simulados no navegador.
2. **Modo com API Node.js**: rode a pasta `api/` para testar endpoints de pagamento e geração de Meet.

## Rodar a API

```bash
cd api
npm install
cp .env.example .env
npm run dev
```

Depois abra o front-end normalmente. Por padrão ele procura a API em:

```txt
http://localhost:3000
```

Se precisar alterar, no console do navegador execute:

```js
localStorage.setItem('PSICO_API_BASE', 'http://localhost:3000')
```

## Pagamentos

O endpoint criado é:

```http
POST /api/payments/create-checkout
```

Ele aceita `Stripe`, `Mercado Pago` ou `mock`, dependendo do `.env`:

```env
PAYMENT_PROVIDER=mock
# PAYMENT_PROVIDER=stripe
# PAYMENT_PROVIDER=mercadopago
```

Para Stripe, preencha `STRIPE_SECRET_KEY`. Para Mercado Pago, preencha `MERCADO_PAGO_ACCESS_TOKEN`.

## Google Meet

O endpoint criado é:

```http
POST /api/meet/create-event
```

Por padrão está em `mock`. Para usar Google Calendar/Meet real:

```env
GOOGLE_MEET_PROVIDER=google
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=primary
```

Observação: em produção, o ideal é usar OAuth do psicólogo para criar eventos na agenda do próprio profissional. O service account funciona melhor com Google Workspace ou agenda compartilhada com a conta de serviço.

## Onde testar no app

- `planos.html`: escolha um plano e clique em pagar. O sistema cria checkout ou aprova em sandbox.
- `agendamento.html`: escolha modalidade `Online`. Ao confirmar, é gerado um link do Google Meet.
- `dashboard-paciente.html` e `dashboard-psicologo.html`: aparece o botão **Entrar no Meet** nas consultas online.

## Segurança/LGPD

As chaves privadas ficam somente no backend `.env`, nunca no HTML ou JavaScript público. Para produção, também implemente autenticação, controle de acesso por usuário e logs mínimos para não expor dados sensíveis de saúde.
