# Guia Prático para Apresentação Presencial e CTF
## PsicoConnect — Bateria de Testes Automatizados de Segurança e CI/CD

Este guia documenta como executar e demonstrar presencialmente os testes de segurança desenvolvidos para validar a correção das vulnerabilidades no código-fonte, bem como a automação de CI/CD via GitHub Actions e Vercel.

---

## 1. Como Executar os Testes no Ambiente de Desenvolvimento Local

Na raiz do projeto ou dentro da pasta `backend/`, abra o terminal e execute:

### Bateria Completa (47 Testes em 13 Suítes):
```bash
npm test
```
*Executa todos os testes de segurança e unitários, confirmando 100% de aprovação (0 falhas).*

---

### Execução Individual por Categoria de Vulnerabilidade:

Para demonstrar ao professor/avaliador cada falha específica sendo testada contra o código-fonte:

#### 1. IDOR (Insecure Direct Object References)
```bash
node --test "backend/src/__tests__/security.idor.test.js"
```
**O que este teste valida no código:**
- **Cancelamento não autorizado:** Paciente atacante tenta cancelar consulta de outro paciente via `PATCH /api/agendamentos/:id/cancelar` $\rightarrow$ Servidor barra com `403 Forbidden` e mantém o status íntegro no PostgreSQL.
- **Espionagem de Chat:** Paciente atacante tenta ler mensagens de agendamento alheio via `GET /api/mensagens/:id` $\rightarrow$ Bloqueado com `403 Forbidden`.
- **Injeção de Mensagens no Chat:** Usuário tenta enviar mensagens em consulta que não lhe pertence via `POST /api/mensagens` $\rightarrow$ Bloqueado com `403 Forbidden`.
- **Geração Indevida de Google Meet:** Usuário tenta disparar eventos de Meet para consulta alheia $\rightarrow$ Bloqueado com `403 Forbidden`.
- **Acesso Legítimo:** Paciente e psicólogo que realmente participam da consulta conseguem conversar e gerenciar seus horários normalmente.

---

#### 2. Criptografia, Senhas e Tokens JWT
```bash
node --test "backend/src/__tests__/security.crypto.test.js"
```
**O que este teste valida no código:**
- **Fail-Fast de Inicialização:** Remoção definitiva do fallback de segredo JWT estático (`authMiddleware.js`). Se `JWT_SECRET` estiver ausente ou tiver menos de 32 caracteres, a aplicação aborta a inicialização para evitar chaves fracas.
- **Ataque `alg: none` e Adulteração:** Rejeita tokens forjados com algoritmo `none` ou com assinaturas alteradas por atacantes com `401 Unauthorized`.
- **Expiração de Tokens:** Rejeita tokens com tempo de vida expirado.
- **Armazenamento com Bcrypt (Custo 12):** Inspeciona a coluna `senha_hash` diretamente no PostgreSQL e comprova o prefixo `$2a$12$` ou `$2b$12$` com salt dinâmico, sem texto plano ou MD5/SHA1.
- **Política de Senhas Fortes:** Rejeita no cadastro senhas com menos de 8 caracteres, puramente numéricas ou sem variação alfanumérica.
- **Anti-Enumeração de Usuários:** Tempo de resposta constante e mesma mensagem genérica (`Usuário ou senha inválidos.`) para e-mails inexistentes e senhas incorretas.
- **Vazamento Zero:** As rotas de login, cadastro e `/me` nunca devolvem campos com hash ou senha.

---

#### 3. Prevenção de Injeção de Código (SQLi, XSS, Mass Assignment)
```bash
node --test "backend/src/__tests__/security.injection.test.js"
```
**O que este teste valida no código:**
- **SQL Injection em Rotas (`:id`):** Payloads como `' OR '1'='1`, `1; DROP TABLE usuarios;` são barrados imediatamente com `400 Bad Request` antes de chegarem ao banco pela camada de validação UUID (`isUUID()`).
- **SQL Injection no Login:** As consultas utilizam exclusivamente queries parametrizadas com `$1` e `$2`, neutralizando bypass de autenticação por aspas ou comentários SQL.
- **Mass Assignment Injection:** Impede que um usuário se auto-aprove no cadastro enviando `status_validacao: 'aprovado'` no body. O backend ignora o atributo do cliente e força o status `'pendente'`.
- **Protocol Injection (XSS no Meet):** Rejeita URLs contendo `javascript:`, esquemas `data:` ou links fora do padrão seguro do Google Meet.
- **Integridade do Banco:** Auditoria que atesta a não modificação de tabelas após ataques de injeção.

---

#### 4. Proteção Contra Bots e Scanners Automatizados
```bash
node --test "backend/src/__tests__/security.bots.test.js"
```
**O que este teste valida no código:**
- **Detecção de Scanners de Vulnerabilidade:** Identificação de User-Agents de ferramentas de ataque (`sqlmap`, `nikto`, `nuclei`, `dirbuster`, `gobuster`, `hydra`, `ffuf`).
- **Bloqueio em Tempo Real:** Requisições automatizadas enviadas com User-Agent de scanners recebem `403 Forbidden` (`Tráfego automatizado detectado`).
- **Bloqueio de Clientes Anônimos:** Rotas críticas de autenticação rejeitam requisições sem `User-Agent`.
- **Mecanismo de Honeypot:** Campo invisível no DOM (`website`). Usuários legítimos não veem e não preenchem; bots que preenchem todos os campos de formulário disparam a armadilha e têm a requisição rejeitada com `400 Bad Request`, sem salvar nenhum dado no banco.

---

## 2. Automação no GitHub Actions (CI/CD no Pull Request e Deploy)

O arquivo [ci.yml](file:///.github/workflows/ci.yml) implementa o ciclo completo exigido:

1. **Gatilho Automático no Pull Request e Push:**
   - Disparado automaticamente em qualquer PR aberto para `main` ou `develop`.
   - Inicializa um container de serviço **PostgreSQL 16**.
   - Aplica `database/schema.sql` e `database/seed.sql`.
   - Executa as 4 suítes de testes de segurança (IDOR, Crypto, Injection, Bots) e a bateria completa.
   - Realiza validação estática de ausência de chaves hardcoded e conformidade do `.gitignore`.

2. **Deploy Automático na Vercel (CD):**
   - Disparado automaticamente após a aprovação de todos os testes na branch `main`.
   - Utiliza a configuração serverless do [vercel.json](file:///vercel.json) e o entrypoint [api/index.js](file:///api/index.js).
   - Suporta tanto a publicação estática das páginas do frontend quanto a API Express rodando como Serverless Functions sob `/api`.

---

## 3. Resumo dos Resultados dos Testes

| Categoria Auditada | Arquivo de Teste | Qtd. Testes | Status |
| :--- | :--- | :---: | :---: |
| **IDOR** | `security.idor.test.js` | 7 | ✅ 100% Aprovado |
| **Criptografia / Senhas** | `security.crypto.test.js` | 8 | ✅ 100% Aprovado |
| **Injeção de Código** | `security.injection.test.js` | 5 | ✅ 100% Aprovado |
| **Bots e Automação** | `security.bots.test.js` | 6 | ✅ 100% Aprovado |
| **Rotas e Negócio** | `auth.test.js` / `database.test.js` | 21 | ✅ 100% Aprovado |
| **Total Geral** | **13 Suítes** | **47** | **✅ 47/47 PASS** |
