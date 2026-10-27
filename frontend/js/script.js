const DB_KEY = 'psicoConnectDB_v2';
const SESSION_KEY = 'psicoConnectSession_v2';
const TOKEN_KEY = 'psicoConnectToken';

const especialidadesPorSintoma = {
  ansiedade: ['ansiedade', 'medo', 'panico', 'pânico', 'preocupacao', 'preocupação'],
  burnout: ['trabalho', 'cansaco', 'cansaço', 'esgotamento', 'burnout', 'estresse'],
  depressao: ['tristeza', 'depressao', 'depressão', 'desanimo', 'desânimo'],
  casal: ['casal', 'relacionamento', 'conflito', 'separacao', 'separação'],
  infantil: ['crianca', 'criança', 'infantil', 'adolescente', 'escola']
};

// ─── SEGURANÇA: escape de HTML (proteção contra XSS) ────────────────
// Todo dado vindo do usuário/armazenamento DEVE passar por esc() antes de ir para innerHTML.
function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Só permite links de reunião legítimos (bloqueia javascript:, data:, phishing)
function linkMeetSeguro(url) {
  return typeof url === 'string' && /^https:\/\/meet\.google\.com\/[a-z0-9-]{3,64}$/i.test(url) ? url : '';
}
// Só permite URLs http(s) (bloqueia javascript:)
function urlSegura(url) {
  try { const u = new URL(url, location.href); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}

function hojeISO(dias = 0) {
  const d = new Date(); d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// SEGURANÇA: o "banco" local NÃO guarda senhas. Autenticação é feita pela API (bcrypt + JWT).
function criarBancoInicial() {
  return {
    pacientes: [],
    psicologos: [
      { id: 1, nome: 'Ana Martins', email: 'ana@demo.com', telefone: '(45) 99910-1000', crpUf: 'PR', crp: '08/12345', cip: 'CIP-PR-12345', documento: 'Documento validado pelo admin', especialidade: 'Ansiedade e Burnout', cidade: 'Cascavel', endereco: 'Av. Brasil, 7210 - Centro, Cascavel - PR', lat: -24.9555, lng: -53.4552, modalidade: ['Online','Presencial'], descricao: 'Atendimento para ansiedade, estresse ocupacional e burnout.', tags: ['Ansiedade','Burnout','Adultos'], status: 'Aprovado', plano: 'Profissional', pagamento: 'Pago', horarios: [{data: hojeISO(1), hora:'09:00'}, {data: hojeISO(2), hora:'14:00'}] },
      { id: 2, nome: 'Bruno Costa', email: 'bruno@demo.com', telefone: '(45) 99920-2000', crpUf: 'PR', crp: '08/54321', cip: 'CIP-PR-54321', documento: 'Documento validado pelo admin', especialidade: 'Terapia de casal', cidade: 'Toledo', endereco: 'Rua Barão, 1200 - Centro, Toledo - PR', lat: -24.7246, lng: -53.7412, modalidade: ['Online'], descricao: 'Psicoterapia para casais, comunicação e conflitos familiares.', tags: ['Casal','Família','Relacionamentos'], status: 'Aprovado', plano: 'Básico', pagamento: 'Pago', horarios: [{data: hojeISO(3), hora:'10:30'}] }
    ],
    consultas: [],
    pagamentos: [{ id: 1, psicologoId: 1, plano: 'Profissional', valor: 49.90, metodo: 'PIX', status: 'Pago', data: hojeISO(0), gateway: 'Simulado', checkoutUrl: '#', transacaoId: 'demo_pago_1' }],
    prontuarios: [],
    contatos: [],
    mensagens: []
  };
}

function db() {
  let data = localStorage.getItem(DB_KEY);
  if (!data) { localStorage.setItem(DB_KEY, JSON.stringify(criarBancoInicial())); data = localStorage.getItem(DB_KEY); }
  const parsed = JSON.parse(data);
  // Migração: remove senhas em texto puro deixadas por versões antigas
  let mudou = false;
  ['pacientes', 'psicologos'].forEach(k => (parsed[k] || []).forEach(u => { if ('senha' in u) { delete u.senha; mudou = true; } }));
  if (mudou) localStorage.setItem(DB_KEY, JSON.stringify(parsed));
  return parsed;
}
function save(data) { localStorage.setItem(DB_KEY, JSON.stringify(data)); }
function session() { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function token() { return localStorage.getItem(TOKEN_KEY); }
function logout() { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(TOKEN_KEY); location.href = 'index.html'; }
function byId(id) { return document.getElementById(id); }
function qs(name) { return new URLSearchParams(location.search).get(name); }
function msg(el, texto, tipo='sucesso') { if (el) { el.textContent = texto; el.className = 'mensagem ' + tipo; } }
function initials(nome) { return String(nome || '?').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function dinheiro(v) { return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }


// API na mesma origem quando publicado (Vercel); localhost:3000 no desenvolvimento local.
const API_BASE = localStorage.getItem('PSICO_API_BASE')
  || (location.protocol.startsWith('http') && !['5500', '5501'].includes(location.port) ? location.origin : 'http://localhost:3000');
const valoresPlanos = {'Básico':29.90,'Profissional':49.90,'Premium':79.90};

function slugMeet(seed) {
  const raw = String(seed || Date.now()).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, 'x').slice(0, 12);
  return `${raw.slice(0,3)}-${raw.slice(3,7)}-${raw.slice(7,10)}`;
}

function gerarMeetLocal(consulta, psicologo) {
  return `https://meet.google.com/${slugMeet(`${consulta.id}${psicologo?.id || ''}${consulta.data}${consulta.hora}`)}`;
}

async function api(caminho, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(`${API_BASE}${caminho}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = new Error(data.error || data.errors?.map(e => e.msg).join(' ') || `API retornou ${res.status}`);
    erro.status = res.status;
    throw erro;
  }
  return data;
}

async function chamarApi(caminho, payload) {
  return api(caminho, { method: 'POST', body: payload });
}

async function criarPagamentoGateway({ plano, metodo, psicologo }) {
  const valor = valoresPlanos[plano];
  // O valor NÃO é enviado: o servidor define o preço de cada plano.
  const payload = { plano, metodo, nome: psicologo.nome };
  try {
    return await chamarApi('/api/payments/create-checkout', payload);
  } catch (erro) {
    console.warn('API de pagamento indisponível. Usando modo simulado.', erro);
    return {
      ok: true,
      simulated: true,
      status: 'Pago',
      gateway: metodo,
      transacaoId: `sim_${Date.now()}`,
      checkoutUrl: `planos.html?payment=mock&plano=${encodeURIComponent(plano)}&valor=${valor}`,
      mensagem: 'Pagamento aprovado em modo simulado local.'
    };
  }
}

async function criarMeetConsulta(consulta, psicologo) {
  // E-mails dos participantes são buscados no banco pelo servidor (não enviados pelo cliente)
  const payload = {
    consultaId: consulta.id,
    summary: `Consulta PsicoConnect - ${psicologo.nome} e ${consulta.paciente}`,
    description: consulta.observacoes || 'Consulta psicológica online agendada pelo PsicoConnect.',
    startDateTime: `${consulta.data}T${consulta.hora}:00-03:00`
  };
  try {
    return await chamarApi('/api/meet/create-event', payload);
  } catch (erro) {
    console.warn('API do Google Meet indisponível. Usando link simulado.', erro);
    return {
      ok: true,
      simulated: true,
      meetLink: gerarMeetLocal(consulta, psicologo),
      calendarEventId: `local_${consulta.id}`,
      mensagem: 'Link Meet simulado local para testes.'
    };
  }
}

function botaoMeet(c) {
  if (c.modalidade !== 'Online') return '';
  const link = linkMeetSeguro(c.meetLink);
  if (!link) return '<span class="badge warning">Meet pendente</span>';
  return `<a class="btn-primary" target="_blank" rel="noopener noreferrer" href="${esc(link)}">Entrar no Meet</a>`;
}

// ─── Ações por delegação de eventos (sem onclick inline => CSP sem 'unsafe-inline') ──
const acoes = {};
document.addEventListener('click', e => {
  const alvo = e.target.closest('[data-action]');
  if (!alvo || !acoes[alvo.dataset.action]) return;
  e.preventDefault();
  acoes[alvo.dataset.action](alvo.dataset.id, alvo);
});

function setupNav() {
  document.querySelectorAll('[data-logout]').forEach(a => { a.style.display = session() ? 'inline-flex' : 'none'; a.onclick = (e)=>{e.preventDefault(); logout();}; });
  document.querySelectorAll('[data-session-label]').forEach(a => {
    const s = session();
    if (!s) return;
    a.textContent = s.tipo === 'Paciente' ? 'Meu painel' : s.tipo === 'Psicólogo' ? 'Painel psicólogo' : 'Admin';
    a.href = s.tipo === 'Paciente' ? 'dashboard-paciente.html' : s.tipo === 'Psicólogo' ? 'dashboard-psicologo.html' : 'admin.html';
  });
}

// ─── Integração com a API de autenticação ───────────────────────────
const TIPO_API = { 'Paciente': 'paciente', 'Psicólogo': 'psicologo', 'Administrador': 'admin' };
const TIPO_UI = { paciente: 'Paciente', psicologo: 'Psicólogo', admin: 'Administrador' };
const STATUS_UI = { aprovado: 'Aprovado', pendente: 'Pendente', reprovado: 'Recusado' };

// Mantém um espelho local do perfil (SEM senha) para as telas que ainda usam LocalStorage
function espelharPerfil(usuario, extras = {}) {
  const data = db();
  const tipo = TIPO_UI[usuario.tipo];
  if (tipo === 'Paciente') {
    let p = data.pacientes.find(x => x.id === usuario.id || x.email === usuario.email);
    if (!p) { p = { id: usuario.id, nome: usuario.nome, email: usuario.email, telefone: extras.telefone || '', contatoEmergencia: '' }; data.pacientes.push(p); }
    p.id = usuario.id;
  } else if (tipo === 'Psicólogo') {
    let p = data.psicologos.find(x => x.id === usuario.id || x.email === usuario.email);
    if (!p) {
      p = { id: usuario.id, nome: usuario.nome, email: usuario.email, telefone: extras.telefone || '', crpUf: extras.crpUf || '', crp: usuario.crp || extras.crp || '', cip: extras.cip || 'CIP pendente', documento: extras.documento || 'Não anexado', especialidade: extras.especialidade || 'Psicologia clínica', cidade: extras.cidade || '', endereco: extras.endereco || 'Endereço não informado', modalidade: ['Online'], descricao: 'Perfil em análise. Após aprovação, aparecerá na busca.', tags: [extras.especialidade || 'Psicologia'], plano: 'Não escolhido', pagamento: 'Pendente', horarios: [] };
      data.psicologos.push(p);
    }
    p.id = usuario.id;
    p.status = STATUS_UI[usuario.status_validacao] || p.status || 'Pendente';
  }
  save(data);
  setSession({ tipo, id: usuario.id });
}

function pageCadastroPaciente() {
  const form = byId('formPaciente'); if (!form) return;
  form.onsubmit = async e => { e.preventDefault();
    const telefone = byId('telefonePacienteCadastro').value.trim();
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: { nome: byId('nomePacienteCadastro').value.trim(), email: byId('emailPacienteCadastro').value.trim().toLowerCase(), telefone, senha: byId('senhaPacienteCadastro').value, tipo: 'paciente', website: byId('website')?.value || '' } });
      localStorage.setItem(TOKEN_KEY, r.token);
      espelharPerfil(r.usuario, { telefone });
      location.href = 'dashboard-paciente.html';
    } catch (erro) {
      msg(byId('mensagemPaciente'), erro.status ? erro.message : 'Servidor indisponível. Tente novamente.', 'erro');
    }
  };
}

function pageCadastroPsicologo() {
  const form = byId('formPsicologo'); if (!form) return;
  form.onsubmit = async e => { e.preventDefault();
    const crp = byId('crp').value.trim(); const uf = byId('crpUf').value.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf) || !/^\d{2}\/\d{4,6}$/.test(crp)) return msg(byId('mensagemCRP'),'Informe UF e CRP no formato correto. Exemplo: PR e 08/12345.','erro');
    const extras = { telefone: byId('telefone').value.trim(), crpUf: uf, crp, cip: byId('cip')?.value.trim() || 'CIP pendente', documento: byId('documentoCip')?.value ? byId('documentoCip').value.split(/[\\/]/).pop() : 'Não anexado', especialidade: byId('especialidade').value.trim(), cidade: byId('cidadePsicologo')?.value || '', endereco: byId('enderecoPsicologo')?.value || 'Endereço não informado' };
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: { nome: byId('nome').value.trim(), email: byId('email').value.trim().toLowerCase(), telefone: extras.telefone, senha: byId('senha').value, tipo: 'psicologo', crp, especialidade: extras.especialidade, cidade: extras.cidade, estado: uf, website: byId('website')?.value || '' } });
      localStorage.setItem(TOKEN_KEY, r.token);
      espelharPerfil({ ...r.usuario, crp, status_validacao: 'pendente' }, extras);
      msg(byId('mensagemCRP'),'Cadastro salvo. Escolha o plano mensal para enviar à aprovação.','sucesso'); setTimeout(()=>location.href='planos.html',900);
    } catch (erro) {
      msg(byId('mensagemCRP'), erro.status ? erro.message : 'Servidor indisponível. Tente novamente.', 'erro');
    }
  };
}

function pageLogin() {
  const box = byId('credenciaisDemo'); if (box) box.textContent = 'Use sua conta cadastrada. As contas de demonstração estão no README do projeto.';
  const form = byId('formLogin'); if (!form) return;
  form.onsubmit = async e => { e.preventDefault();
    const tipoUi = byId('tipoUsuario').value; const email = byId('emailLogin').value.trim().toLowerCase(); const senha = byId('senhaLogin').value;
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: { email, senha, tipo: TIPO_API[tipoUi] } });
      localStorage.setItem(TOKEN_KEY, r.token);
      espelharPerfil(r.usuario);
      location.href = r.usuario.tipo === 'paciente' ? 'dashboard-paciente.html' : r.usuario.tipo === 'psicologo' ? 'dashboard-psicologo.html' : 'admin.html';
    } catch (erro) {
      msg(byId('mensagemLogin'), erro.status ? erro.message : 'Servidor indisponível. Tente novamente.', 'erro');
    }
  };
}

function renderPsicologos() {
  const lista = byId('listaPsicologos'); if (!lista) return; const data = db();
  const buscaUrl = (qs('busca') || '').toLowerCase(); const cidadeUrl = qs('cidade') || '';
  if (buscaUrl) byId('filtroNome').value = buscaUrl; if (cidadeUrl) byId('filtroCidade').value = cidadeUrl;
  function draw() {
    const nome = byId('filtroNome').value.toLowerCase(); const mod = byId('filtroModalidade').value; const cidade = byId('filtroCidade').value;
    const itens = data.psicologos.filter(p => p.status === 'Aprovado').filter(p => (!nome || `${p.nome} ${p.especialidade} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(nome)) && (!mod || (p.modalidade||[]).includes(mod)) && (!cidade || p.cidade === cidade));
    lista.innerHTML = itens.map(p => `<article class="listing-card"><div class="listing-main"><div class="avatar large">${esc(initials(p.nome))}</div><div><h2>${esc(p.nome)}</h2><p>${esc(p.especialidade)} • CRP ${esc(p.crp)}</p><p class="rating">★★★★★ 4.9</p><div class="tag-row">${(p.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}<span>${esc(p.cidade)}</span></div></div></div><div class="listing-actions"><a class="btn-secondary" href="perfil.html?id=${encodeURIComponent(p.id)}">Ver perfil</a><a class="btn-primary" href="agendamento.html?id=${encodeURIComponent(p.id)}">Agendar</a></div></article>`).join('') || '<p class="muted">Nenhum psicólogo encontrado.</p>';
  }
  ['filtroNome','filtroModalidade','filtroCidade'].forEach(id => byId(id)?.addEventListener('input', draw)); draw();
}

function pagePerfil() {
  if (!byId('perfilNome')) return; const p = db().psicologos.find(x=>String(x.id)===String(qs('id')||1)); if (!p) return;
  byId('perfilAvatar').textContent = initials(p.nome); byId('perfilNome').textContent = p.nome; byId('perfilEspecialidade').textContent = `${p.especialidade} • CRP ${p.crp} • CIP ${p.cip}`; byId('perfilCidade').textContent = p.cidade; byId('perfilDescricao').textContent = p.descricao; byId('perfilEndereco').textContent = p.endereco;
  byId('perfilTags').innerHTML = (p.tags||[]).map(t=>`<span>${esc(t)}</span>`).join(''); byId('perfilHorarios').innerHTML = (p.horarios||[]).map(h=>`<li>${esc(h.data)} às ${esc(h.hora)}</li>`).join('') || '<li>Nenhum horário disponível.</li>'; byId('linkAgendarPerfil').href = `agendamento.html?id=${encodeURIComponent(p.id)}`;
  const maps = document.querySelector('.map-placeholder'); if (maps) maps.innerHTML = `<iframe title="Mapa da clínica" width="100%" height="260" style="border:0;border-radius:18px" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(p.endereco)}&output=embed"></iframe><a class="btn-secondary full-width" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}">Abrir rota no Google Maps</a>`;
}

function pageAgendamento() {
  const form = byId('formAgendamento'); if (!form) return; const data = db(); const p = data.psicologos.find(x=>String(x.id)===String(qs('id')||1));
  if (!p) return; byId('profissional').value = p.nome; const s = session(); if (s?.tipo==='Paciente') { const pac = data.pacientes.find(x=>x.id===s.id); byId('paciente').value=pac?.nome||''; byId('emailPaciente').value=pac?.email||''; }
  const datas = [...new Set((p.horarios||[]).map(h=>h.data))]; byId('dataConsulta').innerHTML = '<option value="">Selecione</option>'+datas.map(d=>`<option>${esc(d)}</option>`).join('');
  function horas(){ const d=byId('dataConsulta').value; byId('horarioConsulta').innerHTML = '<option value="">Selecione</option>'+p.horarios.filter(h=>h.data===d).map(h=>`<option>${esc(h.hora)}</option>`).join(''); }
  byId('dataConsulta').onchange=horas;
  form.onsubmit = async e => { e.preventDefault(); const banco = db(); const psic = banco.psicologos.find(x=>x.id===p.id);
    let pacId = s?.tipo==='Paciente' ? s.id : null; if (!pacId) { const novo = {id:Date.now(), nome:byId('paciente').value, email:byId('emailPaciente').value, telefone:'', contatoEmergencia:''}; banco.pacientes.push(novo); pacId=novo.id; }
    const consulta = { id: Date.now(), psicologoId:p.id, pacienteId:pacId, paciente: byId('paciente').value, email: byId('emailPaciente').value, data: byId('dataConsulta').value, hora: byId('horarioConsulta').value, modalidade: byId('modalidadeConsulta').value, observacoes: byId('observacoes').value, status:'Agendada', triagem: JSON.parse(localStorage.getItem('ultimaTriagem') || 'null'), meetLink: '', calendarEventId: '', integracaoMeet: 'Não se aplica' };
    msg(byId('mensagemAgendamento'), 'Confirmando consulta...', 'sucesso');
    if (consulta.modalidade === 'Online') {
      msg(byId('mensagemAgendamento'), 'Gerando link do Google Meet...', 'sucesso');
      const meet = await criarMeetConsulta(consulta, psic);
      consulta.meetLink = linkMeetSeguro(meet.meetLink);
      consulta.calendarEventId = meet.calendarEventId;
      consulta.integracaoMeet = meet.simulated ? 'Simulado' : 'Google Calendar API';
    }
    banco.consultas.push(consulta); psic.horarios = psic.horarios.filter(h=>!(h.data===consulta.data && h.hora===consulta.hora)); save(banco); msg(byId('mensagemAgendamento'), consulta.meetLink ? `Consulta agendada! Link Meet: ${consulta.meetLink}` : 'Consulta presencial agendada com sucesso!', 'sucesso'); setTimeout(()=>location.href='dashboard-paciente.html',1400);
  };
}

function pagePlanos() {
  if (!byId('btnSimularPagamento')) return; let escolhido = ''; document.querySelectorAll('.btnPlano').forEach(btn => btn.onclick = () => { escolhido = btn.dataset.plano; document.querySelectorAll('.plano-card').forEach(c=>c.classList.remove('selected-plan')); btn.closest('.plano-card').classList.add('selected-plan'); byId('statusPlano').textContent = `Plano selecionado: ${escolhido} - ${dinheiro(valoresPlanos[escolhido])}/mês`; });
  byId('btnSimularPagamento').onclick = async () => { if (!escolhido) return alert('Escolha um plano primeiro.'); const s=session(); const data=db(); const p=data.psicologos.find(x=>x.id===s?.id); if (!p) return alert('Faça login como psicólogo.'); byId('statusPlano').textContent = 'Criando checkout de pagamento...'; const metodo = byId('metodoPagamento').value; const pg = await criarPagamentoGateway({ plano: escolhido, metodo, psicologo: p }); p.plano=escolhido; p.pagamento=pg.status || 'Pago'; data.pagamentos.push({id:Date.now(),psicologoId:p.id,plano:escolhido,valor:valoresPlanos[escolhido],metodo,status:pg.status||'Pago',gateway:pg.gateway||metodo,checkoutUrl:pg.checkoutUrl||'',transacaoId:pg.transacaoId||'',data:hojeISO(0)}); save(data);
    const checkout = urlSegura(pg.checkoutUrl);
    byId('statusPlano').innerHTML = `${esc(pg.mensagem || 'Pagamento aprovado.')}<br><b>Status:</b> ${esc(p.pagamento)}<br><b>Transação:</b> ${esc(pg.transacaoId || 'sem id')} ${checkout ? `<br><a class="btn-secondary" target="_blank" rel="noopener noreferrer" href="${esc(checkout)}">Abrir checkout</a>` : ''}<br>Cadastro enviado para validação do admin.`; };
}

// ─── Admin: dados e permissões vêm da API (antes era só checagem no navegador) ──
async function pageAdmin() {
  if (!byId('listaAprovacoes')) return;
  if (session()?.tipo !== 'Administrador' || !token()) return location.href='login.html';
  const data = db();
  byId('listaPagamentos').innerHTML = data.pagamentos.map(pg=>{const p=data.psicologos.find(x=>x.id===pg.psicologoId);return `<li>${esc(p?.nome||'Profissional')} - ${esc(pg.plano)} - ${esc(dinheiro(pg.valor))} - ${esc(pg.status)}</li>`}).join('');
  try {
    const psicologos = await api('/api/psicologos/todos');
    const pendentes = psicologos.filter(p => p.status_validacao !== 'aprovado');
    byId('listaAprovacoes').innerHTML = pendentes.map(p=>`<article class="listing-card"><div><h3>${esc(p.nome)}</h3><p>${esc(p.especialidade || '')} • CRP ${esc(p.crp)}</p><p>${esc(p.email)} • ${esc(p.cidade || '')} ${esc(p.estado || '')}</p><p>Status: ${esc(STATUS_UI[p.status_validacao] || p.status_validacao)}</p></div><div class="listing-actions"><button class="btn-primary" data-action="aprovar" data-id="${esc(p.id)}">Aprovar</button><button class="btn-danger" data-action="reprovar" data-id="${esc(p.id)}">Reprovar</button></div></article>`).join('') || '<p class="muted">Nenhum cadastro pendente.</p>';
  } catch (erro) {
    if (erro.status === 401 || erro.status === 403) { alert('Sessão administrativa inválida. Faça login novamente.'); return logout(); }
    byId('listaAprovacoes').innerHTML = '<p class="muted">Não foi possível carregar os cadastros (API indisponível).</p>';
  }
}
async function validarPsicologo(id, status_validacao) {
  try { await api(`/api/psicologos/${encodeURIComponent(id)}/validacao`, { method: 'PATCH', body: { status_validacao } }); location.reload(); }
  catch (erro) { alert(`Erro ao atualizar psicólogo: ${erro.message}`); }
}
acoes.aprovar = id => validarPsicologo(id, 'aprovado');
acoes.reprovar = id => validarPsicologo(id, 'reprovado');

function dashboardPaciente() {
  if (!byId('consultasPaciente')) return; const s=session(); if (s?.tipo!=='Paciente') return location.href='login.html'; const data=db(); const pac=data.pacientes.find(p=>p.id===s.id); byId('tituloPaciente').textContent=`Olá, ${pac?.nome||'Paciente'}`;
  const consultas=data.consultas.filter(c=>c.pacienteId===s.id); byId('consultasPaciente').innerHTML=consultas.map(c=>{const p=data.psicologos.find(x=>x.id===c.psicologoId); return `<article class="dashboard-card"><h3>${esc(p?.nome)}</h3><p>${esc(c.data)} às ${esc(c.hora)} • ${esc(c.modalidade)}</p><p>Status: <b>${esc(c.status)}</b></p><p>${c.integracaoMeet ? `Integração: ${esc(c.integracaoMeet)}` : ''}</p><div class="card-actions">${botaoMeet(c)}<a class="btn-secondary" href="chat.html?id=${encodeURIComponent(c.id)}">Chat</a><button class="btn-danger" data-action="cancelar" data-id="${esc(c.id)}">Cancelar</button></div></article>`}).join('') || '<p class="muted">Você ainda não possui consultas.</p>';
}
acoes.cancelar = id => { const data=db(); const s=session(); const c=data.consultas.find(x=>String(x.id)===String(id) && x.pacienteId===s?.id); if(c){c.status='Cancelada'; save(data); location.reload();} };

function dashboardPsicologo() {
  if (!byId('painelPsicologo')) return; const s=session(); if (s?.tipo!=='Psicólogo') return location.href='login.html'; const data=db(); const p=data.psicologos.find(x=>x.id===s.id); if (!p) return logout(); byId('tituloPsicologo').textContent=`Olá, ${p.nome}`; byId('resumoPsicologo').textContent=`Status: ${p.status} • Plano: ${p.plano} • Pagamento: ${p.pagamento}`;
  byId('listaHorariosPsicologo').innerHTML=(p.horarios||[]).map((h,i)=>`<li>${esc(h.data)} às ${esc(h.hora)} <button class="link-button" data-action="remover-horario" data-id="${i}">remover</button></li>`).join('') || '<li>Nenhum horário cadastrado.</li>';
  byId('consultasPsicologo').innerHTML=data.consultas.filter(c=>c.psicologoId===p.id).map(c=>`<article class="dashboard-card"><h3>${esc(c.paciente)}</h3><p>${esc(c.data)} às ${esc(c.hora)} • ${esc(c.status)} • ${esc(c.modalidade)}</p><p>${esc(c.observacoes||'')}</p><div class="card-actions">${botaoMeet(c)}<a class="btn-secondary" href="chat.html?id=${encodeURIComponent(c.id)}">Chat</a><a class="btn-primary" href="prontuario.html?id=${encodeURIComponent(c.id)}">Prontuário</a></div></article>`).join('') || '<p class="muted">Nenhuma consulta agendada.</p>';
  byId('formHorario').onsubmit=e=>{e.preventDefault(); if(!byId('novaData').value || !byId('novaHora').value) return msg(byId('mensagemHorario'),'Informe data e hora.','erro'); p.horarios = p.horarios || []; p.horarios.push({data:byId('novaData').value,hora:byId('novaHora').value}); save(data); location.reload();};
}
acoes['remover-horario'] = i => { const data=db(); const p=data.psicologos.find(x=>x.id===session()?.id); if (!p) return; p.horarios.splice(Number(i),1); save(data); location.reload(); };

function pageProntuario() {
  const form=byId('formProntuario'); if(!form) return; const data=db(); const c=data.consultas.find(x=>String(x.id)===String(qs('id'))); if(!c) return;
  const s=session(); if (s?.tipo!=='Psicólogo' || c.psicologoId!==s.id) return location.href='login.html';
  const p=data.pacientes.find(x=>x.id===c.pacienteId); byId('infoProntuario').textContent = `Paciente: ${p?.nome || c.paciente} • Consulta: ${c.data} às ${c.hora}`;
  const atual=data.prontuarios.find(x=>x.consultaId===c.id); ['queixa','evolucao','conduta','observacao'].forEach(id=>{ if(atual && byId(id)) byId(id).value=atual[id]||''; }); if(atual) byId('statusProntuario').textContent=`Status: ${atual.entregue ? 'Prontuário entregue/finalizado' : 'Rascunho'}`;
  byId('btnGerarIa').onclick=()=>{ const tri=c.triagem; byId('queixa').value = c.observacoes || 'Paciente buscou atendimento psicológico.'; byId('evolucao').value = tri ? `Triagem indicou foco em ${tri.sugestao}. Intensidade informada: ${tri.intensidade}/10.` : 'Sessão inicial para acolhimento e levantamento de demanda.'; byId('conduta').value = 'Manter acompanhamento, definir objetivos terapêuticos e orientar estratégias de autocuidado.'; };
  form.onsubmit=e=>{e.preventDefault(); const banco=db(); const existente=banco.prontuarios.find(x=>x.consultaId===c.id); const payload={id:existente?.id||Date.now(), consultaId:c.id, psicologoId:c.psicologoId, pacienteId:c.pacienteId, queixa:byId('queixa').value, evolucao:byId('evolucao').value, conduta:byId('conduta').value, observacao:byId('observacao').value, entregue:byId('entregue').checked, data:hojeISO(0)}; if(existente) Object.assign(existente,payload); else banco.prontuarios.push(payload); save(banco); msg(byId('mensagemProntuario'),'Prontuário salvo com sucesso.','sucesso'); byId('statusProntuario').textContent = payload.entregue ? 'Status: Prontuário entregue/finalizado' : 'Status: Rascunho'; };
}

function pageTriagem() {
  const form=byId('formTriagem'); if(!form) return; form.onsubmit=e=>{e.preventDefault(); const texto=(byId('relatoTriagem').value||'').toLowerCase(); const intensidade=Number(byId('intensidadeTriagem').value); let sugestao='Psicologia clínica'; let pontos=0; Object.entries(especialidadesPorSintoma).forEach(([esp,pals])=>{const score=pals.filter(p=>texto.includes(p)).length; if(score>pontos){pontos=score; sugestao=esp.charAt(0).toUpperCase()+esp.slice(1);}}); if(intensidade>=8) sugestao += ' com prioridade alta'; const resultado={sugestao,intensidade,relato:byId('relatoTriagem').value,data:hojeISO(0)}; localStorage.setItem('ultimaTriagem',JSON.stringify(resultado)); byId('resultadoTriagem').innerHTML=`<div class="notice-box"><b>Sugestão:</b> ${esc(sugestao)}<br>Essa triagem não substitui avaliação profissional, mas ajuda a filtrar psicólogos.</div><a class="btn-primary" href="psicologos.html?busca=${encodeURIComponent(sugestao)}">Buscar profissionais indicados</a>`; };
}

function pageEmergencia() {
  const form=byId('formEmergencia'); if(!form) return; form.onsubmit=e=>{e.preventDefault(); const nome=byId('nomeEmergencia').value||'contato de confiança'; const local=byId('localEmergencia').value||'minha localização atual'; byId('mensagemEmergenciaGerada').value=`Olá, ${nome}. Estou passando por um momento difícil e preciso de apoio agora. Você pode falar comigo ou vir até ${local}? Se eu não responder, por favor acione ajuda de emergência.`; };
}

function pageChat() {
  const form=byId('formChat'); if(!form) return; const id=qs('id'); const data=db(); const c=data.consultas.find(x=>String(x.id)===String(id)); const s=session(); if(!c || !s) return location.href='login.html';
  // Somente participantes da consulta acessam o chat
  if (!(c.pacienteId===s.id || c.psicologoId===s.id)) return location.href='login.html';
  byId('chatInfo').textContent=`Consulta ${c.data} às ${c.hora}`;
  function draw(){
    const banco=db(); const container=byId('chatMensagens'); container.replaceChildren();
    const mensagens=banco.mensagens.filter(m=>String(m.consultaId)===String(c.id));
    if (!mensagens.length) { const vazio=document.createElement('div'); vazio.className='chat-bubble system'; vazio.textContent='Nenhuma mensagem ainda.'; container.appendChild(vazio); return; }
    mensagens.forEach(m=>{
      const bubble=document.createElement('div'); bubble.className=`chat-bubble ${m.autorTipo===s.tipo?'mine':''}`;
      const autor=document.createElement('b'); autor.textContent=m.autorTipo; // textContent: nunca interpreta HTML
      const p=document.createElement('p'); p.textContent=m.texto;
      bubble.append(autor, p); container.appendChild(bubble);
    });
  }
  form.onsubmit=e=>{e.preventDefault(); if(!byId('textoChat').value.trim()) return; const banco=db(); banco.mensagens.push({id:Date.now(),consultaId:c.id,autorTipo:s.tipo,texto:byId('textoChat').value.trim().slice(0,5000),data:new Date().toLocaleString('pt-BR')}); save(banco); byId('textoChat').value=''; draw();}; draw();
}

function pageContato(){ const form=byId('formContato'); if(!form) return; form.onsubmit=e=>{e.preventDefault(); if (byId('website')?.value) return; const data=db(); data.contatos.push({id:Date.now(),nome:byId('nomeContato').value,email:byId('emailContato').value,mensagem:byId('mensagemContatoTexto').value}); save(data); msg(byId('mensagemContato'),'Mensagem enviada.','sucesso'); form.reset();}; }

setupNav(); pageCadastroPaciente(); pageCadastroPsicologo(); pageLogin(); renderPsicologos(); pagePerfil(); pageAgendamento(); pagePlanos(); pageAdmin(); dashboardPaciente(); dashboardPsicologo(); pageProntuario(); pageTriagem(); pageEmergencia(); pageChat(); pageContato();
