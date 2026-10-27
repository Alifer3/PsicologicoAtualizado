# Guia Técnico de Resolução de Vulnerabilidades em Grupo
## Projeto: PsicoConnect — Sistema Integrado de Atendimento Psicológico
**Documento de Engenharia & Segurança da Informação para a Equipe de Desenvolvimento**  
**Data:** 16 de Setembro de 2026  
**Status:** Aprovado para Implementação em Sprint de Remediação  

---

## 1. Introdução & Contexto para o Grupo

Durante a auditoria de segurança da plataforma **PsicoConnect**, foram identificadas vulnerabilidades que comprometem desde a confidencialidade de prontuários e conversas de pacientes (em desconformidade com a **LGPD** e com as normas do **Conselho Federal de Psicologia - CFP**) até a integridade de rotas administrativas e confiabilidade de autenticação.

Este documento tem como objetivo guiar todo o grupo de desenvolvimento na **correção definitiva, passo a passo, de todas as falhas encontradas**. Cada membro da equipe deve assumir seu módulo correspondente e seguir as especificações de código "Antes vs. Depois", os testes de regressão e os critérios de validação.

---

## 2. Divisão Sugerida de Tarefas no Grupo

Para maximizar a produtividade e organização da equipe, a remediação está dividida em 4 frentes:

| Integrante / Papel | Módulo de Atuação | Vulnerabilidades Atribuídas | Arquivos de Impacto |
| :--- | :--- | :--- | :--- |
| **Dev 1 (Backend Core & Auth)** | Autenticação, Middleware & Variáveis de Ambiente | • Segredo JWT com fallback hardcoded<br>• Validação estrita de inicialização (Fail-fast)<br>• Reativação de CSP no Helmet | `backend/src/middleware/authMiddleware.js`<br>`backend/src/server.js`<br>`backend/.env.example` |
| **Dev 2 (Backend Business Logic)** | Regras de Negócio, Agendamentos & Chat | • IDOR no cancelamento de consultas<br>• Isolamento de inquilino/dono no Chat (Leitura e Envio)<br>• Proteção da rota do Google Meet | `backend/src/routes/databaseRoutes.js`<br>`backend/src/server.js` |
| **Dev 3 (Frontend & Segurança DOM)** | Interface Web & Sanitização | • Mitigação de XSS (Chat e Triagem)<br>• Migração do Admin de `localStorage` para a API REST<br>• Limpeza de credenciais demo | `frontend/js/script.js`<br>`frontend/admin.html`<br>`frontend/login.html` |
| **Dev 4 (Database & QA / Testes)** | Banco de Dados, Migrations & Testes | • Revisão de RLS/Queries e sanitização do `seed.sql`<br>• Correção do `ssl: rejectUnauthorized`<br>• Implementação de testes automatizados de segurança | `database/schema.sql`<br>`database/seed.sql`<br>`backend/src/config/db.js`<br>`backend/src/__tests__/` |

---

## 3. Resolução Passo a Passo das Vulnerabilidades

### 3.1. Vulnerabilidade 1: Segredo JWT Hardcoded e Ausência de Fail-Fast
- **Categoria:** 4. Chaves Expostas
- **Severidade:** Crítica (P1)
- **Local:** `backend/src/middleware/authMiddleware.js:4`

#### Diagnóstico
A linha `const JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_dev_secret_troque_em_producao';` permite que o sistema funcione com um segredo estático público caso a variável de ambiente não seja injetada. Qualquer pessoa com esse valor pode assinar tokens JWT com `tipo: 'admin'` e invadir a API.

#### Como Resolver:
1. Remover o valor de fallback.
2. Criar uma rotina de checagem no startup do servidor (`server.js`) que interrompe o processo caso `JWT_SECRET` esteja ausente ou possua tamanho inadequado (mínimo 32 caracteres).
3. Atualizar o `authMiddleware.js` para exigir a variável.

#### Código Antes vs. Depois:
```diff
// backend/src/middleware/authMiddleware.js
- const JWT_SECRET = process.env.JWT_SECRET || 'psicoconnect_dev_secret_troque_em_producao';
+ const JWT_SECRET = process.env.JWT_SECRET;
+ if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
+   console.error('FATAL: A variável de ambiente JWT_SECRET não foi configurada!');
+   process.exit(1);
+ }
```

```javascript
// backend/src/server.js (No início do arquivo, logo após dotenv/config)
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('ERRO CRÍTICO: JWT_SECRET obrigatória em produção com no mínimo 32 caracteres.');
  process.exit(1);
}
```

---

### 3.2. Vulnerabilidade 2: IDOR no Cancelamento de Agendamentos
- **Categoria:** 3. IDOR (Insecure Direct Object References)
- **Severidade:** Crítica (P1)
- **Local:** `backend/src/routes/databaseRoutes.js:189-204`

#### Diagnóstico
O endpoint `PATCH /api/agendamentos/:id/cancelar` executa um `UPDATE` recebendo apenas o `:id` da URL. O backend não checa se o usuário autenticado (`req.user.id`) é o paciente que agendou, o psicólogo responsável ou um administrador. Qualquer usuário autenticado pode cancelar consultas de terceiros.

#### Como Resolver:
Exigir que a consulta pertença ao usuário logado ou que ele tenha perfil `admin`.

#### Código Antes vs. Depois:
```diff
// backend/src/routes/databaseRoutes.js:189
router.patch('/agendamentos/:id/cancelar', requireAuth, async (req, res) => {
  const { id } = req.params;
+ const userId = req.user.id;
+ const userRole = req.user.tipo;

  try {
-   const result = await query(
-     `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 RETURNING *`,
-     [id]
-   );
+   let result;
+   if (userRole === 'admin') {
+     result = await query(
+       `UPDATE agendamentos SET status = 'cancelado' WHERE id = $1 RETURNING *`,
+       [id]
+     );
+   } else {
+     // Só atualiza se o usuário for o paciente ou o psicólogo da consulta
+     result = await query(
+       `UPDATE agendamentos 
+        SET status = 'cancelado' 
+        WHERE id = $1 
+          AND (
+            paciente_id IN (SELECT id FROM pacientes WHERE usuario_id = $2)
+            OR psicologo_id IN (SELECT id FROM psicologos WHERE usuario_id = $2)
+          )
+        RETURNING *`,
+       [id, userId]
+     );
+   }

    if (result.rows.length === 0) {
-     return res.status(404).json({ ok: false, error: 'Agendamento não encontrado.' });
+     return res.status(403).json({ ok: false, error: 'Agendamento não encontrado ou você não tem permissão para cancelá-lo.' });
    }
    res.json({ ok: true, agendamento: result.rows[0], mensagem: 'Consulta cancelada.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
```

---

### 3.3. Vulnerabilidade 3: Isolamento no Chat (Vazamento de Mensagens & Injeção)
- **Categoria:** 1. Banco sem Tranca
- **Severidade:** Alta (P2)
- **Local:** `backend/src/routes/databaseRoutes.js:207-241`

#### Diagnóstico
Ao listar (`GET /api/mensagens/:agendamentoId`) ou enviar (`POST /api/mensagens`), o backend não valida se o `req.user.id` participa do `agendamento_id`. Qualquer usuário autenticado lê mensagens clínicas de qualquer agendamento.

#### Como Resolver:
Criar uma função auxiliar ou subconsulta verificando a participação no agendamento antes de consultar ou gravar mensagens.

#### Código Antes vs. Depois:
```javascript
// Função auxiliar de checagem em databaseRoutes.js
async function usuarioParticipaDoAgendamento(agendamentoId, user) {
  if (user.tipo === 'admin') return true;
  const check = await query(
    `SELECT a.id FROM agendamentos a
     LEFT JOIN pacientes pa ON pa.id = a.paciente_id
     LEFT JOIN psicologos ps ON ps.id = a.psicologo_id
     WHERE a.id = $1 AND (pa.usuario_id = $2 OR ps.usuario_id = $2)`,
    [agendamentoId, user.id]
  );
  return check.rows.length > 0;
}
```

```diff
// GET /api/mensagens/:agendamentoId
router.get('/mensagens/:agendamentoId', requireAuth, async (req, res) => {
+ const temAcesso = await usuarioParticipaDoAgendamento(req.params.agendamentoId, req.user);
+ if (!temAcesso) {
+   return res.status(403).json({ ok: false, error: 'Acesso negado às mensagens desta consulta.' });
+ }
  try {
    const result = await query(...)
```

```diff
// POST /api/mensagens
router.post('/mensagens', requireAuth, async (req, res) => {
  const { agendamento_id, texto } = req.body;
  if (!agendamento_id || !texto?.trim()) {
    return res.status(400).json({ ok: false, error: 'agendamento_id e texto são obrigatórios.' });
  }
+ const temAcesso = await usuarioParticipaDoAgendamento(agendamento_id, req.user);
+ if (!temAcesso) {
+   return res.status(403).json({ ok: false, error: 'Você não pode enviar mensagens nesta consulta.' });
+ }
```

---

### 3.4. Vulnerabilidade 4: Rota de Google Meet Aberta e sem Verificação
- **Categoria:** 3. IDOR / Permissão
- **Severidade:** Alta (P2)
- **Local:** `backend/src/server.js:136-168`

#### Diagnóstico
`POST /api/meet/create-event` é pública, permitindo que atacantes invoquem a API do Google Calendar da organização para enviar links e e-mails de spam sem autenticação.

#### Como Resolver:
1. Proteger com `requireAuth`.
2. Validar que `consultaId` pertence ao usuário logado.
3. Buscar os e-mails do paciente e do psicólogo **direto do banco de dados**, ignorando e-mails arbitrários enviados no body da requisição.

#### Código Antes vs. Depois:
```diff
// backend/src/server.js:136
- app.post('/api/meet/create-event', async (req, res) => {
+ app.post('/api/meet/create-event', requireAuth, async (req, res) => {
-   const { consultaId, summary, description, startDateTime, endDateTime, pacienteEmail, psicologoEmail } = req.body;
+   const { consultaId, summary, description, startDateTime, endDateTime } = req.body;
+   
+   // Buscar participantes reais no banco de dados para evitar spoofing
+   const agendamento = await query(
+     `SELECT a.id, up.email AS paciente_email, ups.email AS psicologo_email
+      FROM agendamentos a
+      JOIN pacientes pa ON pa.id = a.paciente_id
+      JOIN usuarios up ON up.id = pa.usuario_id
+      JOIN psicologos ps ON ps.id = a.psicologo_id
+      JOIN usuarios ups ON ups.id = ps.usuario_id
+      WHERE a.id = $1 AND (up.id = $2 OR ups.id = $2 OR $3 = 'admin')`,
+     [consultaId, req.user.id, req.user.tipo]
+   );
+   if (agendamento.rows.length === 0) {
+     return res.status(403).json({ ok: false, error: 'Consulta não encontrada ou acesso não autorizado.' });
+   }
+   const pacienteEmail = agendamento.rows[0].paciente_email;
+   const psicologoEmail = agendamento.rows[0].psicologo_email;
```

---

### 3.5. Vulnerabilidade 5: Cross-Site Scripting (XSS) no Frontend
- **Categoria:** 5. Inputs sem Tratamento (XSS)
- **Severidade:** Alta (P2)
- **Local:** `frontend/js/script.js:238, 247`

#### Diagnóstico
No frontend, `innerHTML` é utilizado diretamente com textos inseridos pelo usuário no chat (`<p>${m.texto}</p>`) e na triagem (`${sugestao}`), possibilitando injeção de `<img src=x onerror=...>` e roubo de tokens em `localStorage`.

#### Como Resolver:
1. Criar uma função utilitária de escape HTML ou utilizar `textContent` para criar os nós no DOM.
2. No chat, construir os balões manipulando propriedades seguras (`div.textContent = m.texto`).
3. Reativar o cabeçalho `Content-Security-Policy` no `server.js` via `helmet`.

#### Código Antes vs. Depois:
```javascript
// frontend/js/script.js - Função utilitária de escape
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Na renderização do chat (linha 247):
function draw() {
  const banco = db();
  const container = byId('chatMensagens');
  container.innerHTML = '';
  
  const mensagens = banco.mensagens.filter(m => m.consultaId === id);
  if (mensagens.length === 0) {
    container.innerHTML = '<div class="chat-bubble system">Nenhuma mensagem ainda.</div>';
    return;
  }

  mensagens.forEach(m => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${m.autorTipo === s.tipo ? 'mine' : ''}`;
    
    const author = document.createElement('b');
    author.textContent = m.autorTipo;
    
    const p = document.createElement('p');
    p.textContent = m.texto; // SEGURO: textContent não interpreta HTML/scripts!
    
    bubble.appendChild(author);
    bubble.appendChild(p);
    container.appendChild(bubble);
  });
}
```

```diff
// backend/src/server.js:17
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
- contentSecurityPolicy: false
+ contentSecurityPolicy: {
+   directives: {
+     defaultSrc: ["'self'"],
+     scriptSrc: ["'self'", "'unsafe-inline'"],
+     styleSrc: ["'self'", "'unsafe-inline'"],
+     imgSrc: ["'self'", "data:", "https:"],
+     connectSrc: ["'self'", "http://localhost:3000", "https://api.stripe.com"],
+     frameSrc: ["https://www.google.com"]
+   }
+ }
}));
```

---

### 3.6. Vulnerabilidade 6: Permissão Restrita Apenas ao Navegador no Painel de Admin
- **Categoria:** 2. Permissão no Navegador
- **Severidade:** Média (P3)
- **Local:** `frontend/js/script.js:155, 209-215` e `frontend/admin.html`

#### Diagnóstico
O painel `admin.html` apenas checa `session()?.tipo === 'Administrador'` localmente e aprova psicólogos alterando uma chave no `localStorage` via `aprovarPsicologo()`, sem comunicar com os endpoints reais do backend (`GET /api/psicologos/todos` e `PATCH /api/psicologos/:id/validacao`).

#### Como Resolver:
1. O login de admin deve autenticar contra a API (`POST /api/auth/login`) e receber o JWT com `tipo: 'admin'`.
2. A tela `admin.html` deve enviar o header `Authorization: Bearer <token>` para carregar `GET /api/psicologos/todos`.
3. O botão de aprovação deve disparar um `fetch` para `PATCH /api/psicologos/:id/validacao`.

#### Código de Integração no Frontend:
```javascript
// frontend/js/script.js
async function carregarPsicologosAdmin() {
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_BASE}/api/psicologos/todos`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Não autorizado');
    const psicologos = await res.json();
    renderListaAprovacoes(psicologos);
  } catch (err) {
    alert('Sessão administrativa inválida. Faça login novamente.');
    location.href = 'login.html';
  }
}

async function aprovarPsicologoBackend(id) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/api/psicologos/${id}/validacao`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status_validacao: 'aprovado' })
  });
  if (res.ok) {
    location.reload();
  } else {
    alert('Erro ao aprovar psicólogo.');
  }
}
```

---

### 3.7. Ajustes de Banco & Conexão: SSL e Credenciais Demo
- **Categoria:** 4. Chaves Expostas / Segurança de Transporte
- **Arquivos:** `database/seed.sql` e `backend/src/config/db.js:7`

1. **Desativação de verificação SSL:**
   Em `backend/src/config/db.js:7`, a configuração `ssl: { rejectUnauthorized: false }` aceita qualquer certificado MITM. Em produção, configure o certificado raiz da nuvem (Render/AWS RDS):
   ```javascript
   ssl: process.env.NODE_ENV === 'production' 
     ? { rejectUnauthorized: true, ca: process.env.DB_CA_CERT }
     : false
   ```
2. **Saneamento de `seed.sql`:**
   Garantir no pipeline de CI/CD que `seed.sql` nunca seja executado no banco de produção, criando um ambiente isolado com senhas geradas dinamicamente.

---

## 4. Bateria de Testes Automatizados de Regressão

Para comprovar a correção de todas as falhas, adicione os seguintes testes ao arquivo `backend/src/__tests__/database.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, PATCH } from './setup.js';

describe('Segurança - Verificação de IDOR e Isolamento', () => {
  it('Não deve permitir cancelar agendamento de outro usuário (IDOR)', async () => {
    // Token de um paciente tentando cancelar consulta de outro
    const tokenInvasor = '...'; 
    const idConsultaAlheia = 'b82d3e91-7641-4cf1-8a9d-111111111111';

    const res = await PATCH(`/api/agendamentos/${idConsultaAlheia}/cancelar`, {
      token: tokenInvasor
    });

    assert.equal(res.status, 403, 'Deve retornar 403 Forbidden para IDOR');
    assert.equal(res.body.ok, false);
  });

  it('Não deve permitir leitura de chat de consulta alheia', async () => {
    const tokenNaoParticipante = '...';
    const idConsultaAlheia = 'b82d3e91-7641-4cf1-8a9d-111111111111';

    const res = await GET(`/api/mensagens/${idConsultaAlheia}`, {
      token: tokenNaoParticipante
    });

    assert.equal(res.status, 403, 'Deve barrar leitura de chat confidencial');
  });

  it('Deve rejeitar requisição ao Meet sem autenticação', async () => {
    const res = await POST('/api/meet/create-event', {
      body: { consultaId: '123' }
    });

    assert.equal(res.status, 401, 'Deve exigir autenticação JWT');
  });
});
```

---

## 5. Checklist de Validação para Code Review do Grupo

Antes de fazer merge para a branch `main`, cada integrante deve validar os itens abaixo:

- [ ] `JWT_SECRET` não possui valor padrão em código e aborta a aplicação caso não esteja configurada.
- [ ] O arquivo `.env` está no `.gitignore` e não foi commitado.
- [ ] Todas as rotas que recebem `:id` checam vínculo com `req.user.id` ou `req.user.tipo === 'admin'`.
- [ ] As mensagens de chat só são lidas e gravadas por participantes legítimos da sessão.
- [ ] A rota `POST /api/meet/create-event` exige `requireAuth` e busca dados dos participantes no banco.
- [ ] Nenhuma variável digitada pelo usuário é concatenada diretamente em `innerHTML`.
- [ ] O painel administrativo consome os endpoints do backend via Bearer Token.
- [ ] A suíte de testes (`npm test` dentro de `backend/`) roda com 100% de sucesso.
- [ ] A build do pipeline no GitHub Actions passa sem alertas de segurança.
