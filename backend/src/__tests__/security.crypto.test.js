import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { GET, POST, generateToken, query } from './setup.js';
import { assertJwtConfig } from '../middleware/authMiddleware.js';

describe('Segurança - Criptografia, Senhas e Tokens JWT', () => {
  const emailSuffix = Date.now();

  it('1. Fail-fast JWT: rejeita segredo ausente ou menor que 32 caracteres', () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      assert.throws(() => assertJwtConfig(), /JWT_SECRET ausente ou fraca/);

      process.env.JWT_SECRET = 'curta_123';
      assert.throws(() => assertJwtConfig(), /JWT_SECRET ausente ou fraca/);
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });

  it('2. Ataque alg:none: Rejeita token JWT não assinado (alg: "none")', async () => {
    // Cria um token forjado com header alg: none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', tipo: 'admin' })).toString('base64url');
    const tokenInseguro = `${header}.${payload}.`;

    const res = await GET('/api/auth/me', { token: tokenInseguro });
    assert.equal(res.status, 401, 'Token alg:none deve ser estritamente rejeitado');
    assert.equal(res.body.ok, false);
  });

  it('3. Token adulterado: Rejeita token com assinatura modificada por atacante', async () => {
    const tokenLegitimo = generateToken({ id: '11111111-1111-4111-8111-111111111111', tipo: 'paciente' });
    // Adultera o último caractere da assinatura
    const tokenAdulterado = tokenLegitimo.slice(0, -2) + (tokenLegitimo.endsWith('a') ? 'b' : 'a');

    const res = await GET('/api/auth/me', { token: tokenAdulterado });
    assert.equal(res.status, 401, 'Token adulterado deve falhar na verificação de integridade');
    assert.equal(res.body.ok, false);
  });

  it('4. Token expirado: Rejeita tokens fora da validade', async () => {
    const tokenExpirado = jwt.sign(
      { id: '11111111-1111-4111-8111-111111111111', tipo: 'paciente' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -10 } // expirou há 10 segundos
    );

    const res = await GET('/api/auth/me', { token: tokenExpirado });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
  });

  it('5. Custo de Criptografia: Senhas armazenadas utilizam bcrypt com custo >= 12', async () => {
    const email = `crypto_test_${emailSuffix}@teste.com`;
    const senhaPlana = 'MinhaSenhaSegura123!';

    const reg = await POST('/api/auth/register', {
      body: {
        nome: 'Usuario Teste Cripto',
        email,
        senha: senhaPlana,
        tipo: 'paciente'
      }
    });

    assert.equal(reg.status, 201);

    // Consulta direta no banco de dados para auditar a coluna senha_hash
    const dbUser = await query('SELECT senha_hash FROM usuarios WHERE email = $1', [email]);
    assert.equal(dbUser.rows.length, 1);
    const hashSalvo = dbUser.rows[0].senha_hash;

    // Garante que a senha NÃO foi salva em texto plano
    assert.notEqual(hashSalvo, senhaPlana);
    // Verifica formato bcrypt $2a$12$ ou $2b$12$
    assert.match(hashSalvo, /^\$2[ab]\$12\$/, 'O hash DEVE utilizar bcrypt com custo 12');
    // Valida que o bcrypt consegue comparar a senha corretamente com o salt gerado
    const match = await bcrypt.compare(senhaPlana, hashSalvo);
    assert.equal(match, true);
  });

  it('6. Política de Senhas Fortes: Rejeita senhas fracas no cadastro', async () => {
    // Menos de 8 caracteres
    const r1 = await POST('/api/auth/register', {
      body: { nome: 'Teste', email: `fraca1_${emailSuffix}@t.com`, senha: 'Ab1', tipo: 'paciente' }
    });
    assert.equal(r1.status, 400);
    assert.match(JSON.stringify(r1.body), /Senha deve ter de 8 a 72 caracteres/i);

    // Apenas letras (sem dígitos)
    const r2 = await POST('/api/auth/register', {
      body: { nome: 'Teste', email: `fraca2_${emailSuffix}@t.com`, senha: 'SomenteLetrasSemNumero', tipo: 'paciente' }
    });
    assert.equal(r2.status, 400);

    // Apenas números
    const r3 = await POST('/api/auth/register', {
      body: { nome: 'Teste', email: `fraca3_${emailSuffix}@t.com`, senha: '1234567890', tipo: 'paciente' }
    });
    assert.equal(r3.status, 400);
  });

  it('7. Proteção contra Enumeração de Usuários: Mensagem idêntica para e-mail inexistente e senha incorreta', async () => {
    const rInexistente = await POST('/api/auth/login', {
      body: { email: `inexistente_${emailSuffix}@teste.com`, senha: 'SenhaQualquer123' }
    });

    const rSenhaErrada = await POST('/api/auth/login', {
      body: { email: `crypto_test_${emailSuffix}@teste.com`, senha: 'SenhaErrada123' }
    });

    assert.equal(rInexistente.status, 401);
    assert.equal(rSenhaErrada.status, 401);
    assert.deepEqual(rInexistente.body, rSenhaErrada.body, 'A resposta não deve permitir adivinhar se o e-mail existe');
  });

  it('8. Não Vazamento de Credenciais: Respostas de auth nunca incluem hash de senha', async () => {
    const login = await POST('/api/auth/login', {
      body: { email: `crypto_test_${emailSuffix}@teste.com`, senha: 'MinhaSenhaSegura123!' }
    });

    assert.equal(login.status, 200);
    assert.equal(login.body.usuario.senha, undefined);
    assert.equal(login.body.usuario.senha_hash, undefined);

    const me = await GET('/api/auth/me', { token: login.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.usuario.senha, undefined);
    assert.equal(me.body.usuario.senha_hash, undefined);
  });
});
