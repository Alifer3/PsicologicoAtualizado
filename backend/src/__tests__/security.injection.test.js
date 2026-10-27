import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, PATCH, generateToken, query } from './setup.js';
import { isSafeMeetLink, isUUID } from '../utils/security.js';

describe('Segurança - Prevenção de Injeção de Código (SQLi, XSS, Mass Assignment)', () => {
  const emailSuffix = Date.now();
  const tokenPaciente = generateToken({ id: '33333333-3333-4333-8333-333333333333', email: 'paciente@teste.com', tipo: 'paciente' });

  it('1. SQL Injection em Parâmetro de Rota: Rejeita payloads SQLi em :id via validação UUID', async () => {
    const payloadsSQLi = [
      "' OR '1'='1",
      "1; DROP TABLE usuarios; --",
      "UNION SELECT * FROM usuarios",
      "../../etc/passwd",
      "%27%20OR%201=1--"
    ];

    for (const sqli of payloadsSQLi) {
      const res = await GET(`/api/mensagens/${encodeURIComponent(sqli)}`, {
        token: tokenPaciente
      });
      assert.equal(res.status, 400, `Payload '${sqli}' deve ser barrado com 400 antes de chegar ao banco`);
      assert.equal(res.body.ok, false);
      assert.match(res.body.error, /inválido/i);
    }
  });

  it('2. SQL Injection no Login: Parâmetros $1 e $2 impedem bypass de autenticação por SQLi', async () => {
    const res = await POST('/api/auth/login', {
      body: {
        email: "' OR '1'='1' --",
        senha: "' OR '1'='1"
      }
    });

    assert.equal(res.status, 400, 'Validador de formato de e-mail rejeita o payload');
    assert.equal(res.body.ok, false);

    // Tentativa com formato de e-mail válido contendo injeção
    const res2 = await POST('/api/auth/login', {
      body: {
        email: "sqli'--@teste.com",
        senha: "' OR '1'='1"
      }
    });
    assert.equal(res2.status, 401, 'Query parametrizada trata como string literal; login falha');
    assert.equal(res2.body.ok, false);
  });

  it('3. Mass Assignment Injection: Atacante NÃO CONSEGUE se auto-aprovar no cadastro', async () => {
    const email = `psico_sqli_${emailSuffix}@teste.com`;

    // Atacante tenta injetar status_validacao: 'aprovado' no corpo da requisição
    const res = await POST('/api/auth/register', {
      body: {
        nome: 'Dr. Atacante',
        email,
        senha: 'SenhaForte123!',
        tipo: 'psicologo',
        crp: `08/${String(emailSuffix).slice(-5)}`,
        status_validacao: 'aprovado' // TENTATIVA DE MASS ASSIGNMENT!
      }
    });

    assert.equal(res.status, 201);

    // Consulta no banco de dados para verificar o status real
    const psic = await query(
      `SELECT p.status_validacao FROM psicologos p
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE u.email = $1`,
      [email]
    );

    assert.equal(psic.rows[0].status_validacao, 'pendente', 'O status DEVE ser "pendente", ignorando campo forjado no body');
  });

  it('4. Protocol/XSS Injection no Meet: Rejeita links javascript: ou esquemas inseguros', async () => {
    const payloadsInseguros = [
      'javascript:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'http://site-de-phishing.com/login',
      'https://malicious-domain.com/meet',
      'javascript://meet.google.com/%0aalert(1)'
    ];

    for (const link of payloadsInseguros) {
      assert.equal(isSafeMeetLink(link), false, `Link inseguro deve ser rejeitado: ${link}`);
    }

    // Links legítimos do Google Meet
    assert.equal(isSafeMeetLink('https://meet.google.com/abc-defg-hij'), true);
  });

  it('5. Integridade do Banco: Valida que a tabela de usuários permanece intacta após testes de injeção', async () => {
    const count = await query('SELECT COUNT(*) FROM usuarios');
    assert.ok(Number(count.rows[0].count) >= 1, 'Banco de dados deve permanecer com dados íntegros');
  });
});
