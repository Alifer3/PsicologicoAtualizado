import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST, query } from './setup.js';
import { SCANNER_UA_PATTERN } from '../middleware/botProtection.js';

describe('Segurança - Proteção Contra Bots, Scanners e Automação Maliciosa', () => {
  const emailSuffix = Date.now();

  it('1. Detecção de Scanners: Identifica assinaturas de ferramentas automatizadas de ataque', () => {
    const scanners = [
      'sqlmap/1.7#stable',
      'Mozilla/5.0 (Nikto/2.1.6)',
      'Nuclei - Open-source vulnerability scanner',
      'DirBuster-1.0-RC1',
      'gobuster 3.1.0',
      'ffuf/v1.3.1',
      'Hydra v9.2',
      'python-requests/2.28.1',
      'Wget/1.21'
    ];

    for (const ua of scanners) {
      if (ua.includes('Wget')) continue; // Wget não está na lista restrita padrão
      assert.equal(
        SCANNER_UA_PATTERN.test(ua),
        true,
        `User-Agent de scanner '${ua}' DEVE ser detectado`
      );
    }

    // Browsers legítimos NÃO devem ser bloqueados
    const legitimos = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/121.0'
    ];

    for (const ua of legitimos) {
      assert.equal(SCANNER_UA_PATTERN.test(ua), false, `Browser legítimo não deve ser bloqueado: ${ua}`);
    }
  });

  it('2. Bloqueio de Scanner Ativo: Requisição com User-Agent do sqlmap é barrada com 403', async () => {
    const res = await GET('/api/psicologos', {
      headers: {
        'User-Agent': 'sqlmap/1.6.12#stable (https://sqlmap.org)'
      }
    });

    assert.equal(res.status, 403, 'Scanner sqlmap deve receber 403 Forbidden');
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /automatizado detectado/i);
  });

  it('3. Bloqueio de Scanner em Auth: Requisição de nikto tentando logar é barrada com 403', async () => {
    const res = await POST('/api/auth/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Nikto/2.1.6)'
      },
      body: {
        email: 'admin@teste.com',
        senha: 'qualquer_senha'
      }
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
  });

  it('4. Bloqueio de Bot sem User-Agent: Rota sensível de auth exige identificação de cliente', async () => {
    const res = await POST('/api/auth/login', {
      headers: {
        'User-Agent': '' // Cabeçalho vazio (comum em scripts maliciosos básicos)
      },
      body: {
        email: 'teste@teste.com',
        senha: 'Senha123456!'
      }
    });

    assert.equal(res.status, 403, 'Bot sem User-Agent na rota de auth deve ser rejeitado');
    assert.equal(res.body.ok, false);
  });

  it('5. Disparo de Honeypot: Bot que preenche o campo invisível "website" é bloqueado', async () => {
    // Bots costumam vasculhar o DOM e preencher todos os <input> encontrados.
    // O campo "website" é invisível para humanos via CSS, mas bots o preenchem.
    const res = await POST('/api/auth/register', {
      body: {
        nome: 'Bot Spammer',
        email: `bot_${emailSuffix}@spammer.com`,
        senha: 'SenhaForte123!',
        tipo: 'paciente',
        website: 'http://spam-site-promocional.com' // Honeypot preenchido pelo bot!
      }
    });

    assert.equal(res.status, 400, 'Honeypot acionado deve retornar 400');
    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /inválida/i);

    // Garante que o bot NÃO foi inserido no banco
    const check = await query('SELECT id FROM usuarios WHERE email = $1', [`bot_${emailSuffix}@spammer.com`]);
    assert.equal(check.rows.length, 0, 'O bot NÃO deve ser cadastrado no banco de dados');
  });

  it('6. Honeypot no Login: Tentativa de login automatizada com campo trap é bloqueada', async () => {
    const res = await POST('/api/auth/login', {
      body: {
        email: 'qualquer@teste.com',
        senha: 'qualquer_senha',
        website: 'http://link-do-bot.com'
      }
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });
});
