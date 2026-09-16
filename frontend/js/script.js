const DB_KEY = 'psicoConnectDB_v2';
const SESSION_KEY = 'psicoConnectSession_v2';

const especialidadesPorSintoma = {
  ansiedade: ['ansiedade', 'medo', 'panico', 'pânico', 'preocupacao', 'preocupação'],
  burnout: ['trabalho', 'cansaco', 'cansaço', 'esgotamento', 'burnout', 'estresse'],
  depressao: ['tristeza', 'depressao', 'depressão', 'desanimo', 'desânimo'],
  casal: ['casal', 'relacionamento', 'conflito', 'separacao', 'separação'],
  infantil: ['crianca', 'criança', 'infantil', 'adolescente', 'escola']
};

function hojeISO(dias = 0) {
  const d = new Date(); d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function criarBancoInicial() {
  return {
    pacientes: [{ id: 1, nome: 'Paciente Demo', email: 'paciente@demo.com', telefone: '(45) 99999-0000', senha: '123456', contatoEmergencia: 'Maria - (45) 98888-1111' }],
    psicologos: [
      { id: 1, nome: 'Ana Martins', email: 'ana@demo.com', telefone: '(45) 99910-1000', senha: '123456', crpUf: 'PR', crp: '08/12345', cip: 'CIP-PR-12345', documento: 'Documento validado pelo admin', especialidade: 'Ansiedade e Burnout', cidade: 'Cascavel', endereco: 'Av. Brasil, 7210 - Centro, Cascavel - PR', lat: -24.9555, lng: -53.4552, modalidade: ['Online','Presencial'], descricao: 'Atendimento para ansiedade, estresse ocupacional e burnout.', tags: ['Ansiedade','Burnout','Adultos'], status: 'Aprovado', plano: 'Profissional', pagamento: 'Pago', horarios: [{data: hojeISO(1), hora:'09:00'}, {data: hojeISO(2), hora:'14:00'}] },
      { id: 2, nome: 'Bruno Costa', email: 'bruno@demo.com', telefone: '(45) 99920-2000', senha: '123456', crpUf: 'PR', crp: '08/54321', cip: 'CIP-PR-54321', documento: 'Documento validado pelo admin', especialidade: 'Terapia de casal', cidade: 'Toledo', endereco: 'Rua Barão, 1200 - Centro, Toledo - PR', lat: -24.7246, lng: -53.7412, modalidade: ['Online'], descricao: 'Psicoterapia para casais, comunicação e conflitos familiares.', tags: ['Casal','Família','Relacionamentos'], status: 'Aprovado', plano: 'Básico', pagamento: 'Pago', horarios: [{data: hojeISO(3), hora:'10:30'}] }
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
  return JSON.parse(data);
}
function save(data) { localStorage.setItem(DB_KEY, JSON.stringify(data)); }
function session() { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function logout() { localStorage.removeItem(SESSION_KEY); location.href = 'index.html'; }
function byId(id) { return document.getElementById(id); }
function qs(name) { return new URLSearchParams(location.search).get(name); }
function msg(el, texto, tipo='sucesso') { if (el) { el.textContent = texto; el.className = 'mensagem ' + tipo; } }
function initials(nome) { return nome.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function dinheiro(v) { return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }


const API_BASE = localStorage.getItem('PSICO_API_BASE') || 'http://localhost:3000';
const valoresPlanos = {'Básico':29.90,'Profissional':49.90,'Premium':79.90};

function slugMeet(seed) {
  const raw = String(seed || Date.now()).toLowerCase().replace(/[^a-z0-9]/g, '').padEnd(12, 'x').slice(0, 12);
  return `${raw.slice(0,3)}-${raw.slice(3,7)}-${raw.slice(7,10)}`;
}

function gerarMeetLocal(consulta, psicologo) {
  return `https://meet.google.com/${slugMeet(`${consulta.id}${psicologo?.id || ''}${consulta.data}${consulta.hora}`)}`;
}

async function chamarApi(caminho, payload) {
  const res = await fetch(`${API_BASE}${caminho}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`API retornou ${res.status}`);
  return res.json();
}

async function criarPagamentoGateway({ plano, metodo, psicologo }) {
  const valor = valoresPlanos[plano];
  const payload = { plano, metodo, valor, psicologoId: psicologo.id, nome: psicologo.nome, email: psicologo.email };
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
      checkoutUrl: `pagamento-sucesso.html?plano=${encodeURIComponent(plano)}&valor=${valor}`,
      mensagem: 'Pagamento aprovado em modo simulado local.'
    };
  }
}

async function criarMeetConsulta(consulta, psicologo) {
  const payload = {
    consultaId: consulta.id,
    summary: `Consulta PsicoConnect - ${psicologo.nome} e ${consulta.paciente}`,
    description: consulta.observacoes || 'Consulta psicológica online agendada pelo PsicoConnect.',
    startDateTime: `${consulta.data}T${consulta.hora}:00-03:00`,
    endDateTime: `${consulta.data}T${consulta.hora}:00-03:00`,
    pacienteEmail: consulta.email,
    psicologoEmail: psicologo.email
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
  if (!c.meetLink) return '<span class="badge warning">Meet pendente</span>';
  return `<a class="btn-primary" target="_blank" rel="noopener" href="${c.meetLink}">Entrar no Meet</a>`;
}

function setupNav() {
  document.querySelectorAll('[data-logout]').forEach(a => { a.style.display = session() ? 'inline-flex' : 'none'; a.onclick = (e)=>{e.preventDefault(); logout();}; });
  document.querySelectorAll('[data-session-label]').forEach(a => {
    const s = session();
    if (!s) return;
    a.textContent = s.tipo === 'Paciente' ? 'Meu painel' : s.tipo === 'Psicólogo' ? 'Painel psicólogo' : 'Admin';
    a.href = s.tipo === 'Paciente' ? 'dashboard-paciente.html' : s.tipo === 'Psicólogo' ? 'dashboard-psicologo.html' : 'admin.html';
  });
}

function pageCadastroPaciente() {
  const form = byId('formPaciente'); if (!form) return;
  form.onsubmit = e => { e.preventDefault(); const data = db();
    const email = byId('emailPacienteCadastro').value.trim().toLowerCase();
    if (data.pacientes.some(p=>p.email===email)) return msg(byId('mensagemPaciente'),'E-mail já cadastrado.','erro');
    const p = { id: Date.now(), nome: byId('nomePacienteCadastro').value.trim(), email, telefone: byId('telefonePacienteCadastro').value.trim(), senha: byId('senhaPacienteCadastro').value, contatoEmergencia: '' };
    data.pacientes.push(p); save(data); setSession({tipo:'Paciente', id:p.id}); location.href='dashboard-paciente.html';
  };
}

function pageCadastroPsicologo() {
  const form = byId('formPsicologo'); if (!form) return;
  form.onsubmit = e => { e.preventDefault(); const data = db();
    const crp = byId('crp').value.trim(); const uf = byId('crpUf').value.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf) || !/^\d{2}\/\d{4,6}$/.test(crp)) return msg(byId('mensagemCRP'),'Informe UF e CRP no formato correto. Exemplo: PR e 08/12345.','erro');
    const email = byId('email').value.trim().toLowerCase();
    if (data.psicologos.some(p=>p.email===email)) return msg(byId('mensagemCRP'),'E-mail já cadastrado.','erro');
    const psic = { id: Date.now(), nome: byId('nome').value.trim(), email, telefone: byId('telefone').value.trim(), senha: byId('senha').value, crpUf: uf, crp, cip: byId('cip')?.value.trim() || 'CIP pendente', documento: byId('documentoCip')?.value ? byId('documentoCip').value.split(/[\\/]/).pop() : 'Não anexado', especialidade: byId('especialidade').value.trim(), cidade: byId('cidadePsicologo')?.value || 'Cascavel', endereco: byId('enderecoPsicologo')?.value || 'Endereço não informado', modalidade: ['Online'], descricao: 'Perfil em análise. Após aprovação, aparecerá na busca.', tags: [byId('especialidade').value.trim()], status: 'Pendente', plano: 'Não escolhido', pagamento: 'Pendente', horarios: [] };
    data.psicologos.push(psic); save(data); setSession({tipo:'Psicólogo', id:psic.id}); msg(byId('mensagemCRP'),'Cadastro salvo. Escolha o plano mensal para enviar à aprovação.','sucesso'); setTimeout(()=>location.href='planos.html',900);
  };
}

function pageLogin() {
  const box = byId('credenciaisDemo'); if (box) box.innerHTML = '<b>Credenciais demo:</b><br>Paciente: paciente@demo.com / 123456<br>Psicólogo: ana@demo.com / 123456<br>Admin: admin@demo.com / 123456';
  const form = byId('formLogin'); if (!form) return;
  form.onsubmit = e => { e.preventDefault(); const tipo = byId('tipoUsuario').value; const email = byId('emailLogin').value.trim().toLowerCase(); const senha = byId('senhaLogin').value; const data = db();
    if (tipo === 'Administrador' && email === 'admin@demo.com' && senha === '123456') { setSession({tipo, id:0}); return location.href='admin.html'; }
    const lista = tipo === 'Paciente' ? data.pacientes : data.psicologos;
    const user = lista.find(u => u.email === email && u.senha === senha);
    if (!user) return msg(byId('mensagemLogin'),'Usuário ou senha inválidos.','erro');
    setSession({tipo, id:user.id}); location.href = tipo === 'Paciente' ? 'dashboard-paciente.html' : 'dashboard-psicologo.html';
  };
}

function renderPsicologos() {
  const lista = byId('listaPsicologos'); if (!lista) return; const data = db();
  const buscaUrl = (qs('busca') || '').toLowerCase(); const cidadeUrl = qs('cidade') || '';
  if (buscaUrl) byId('filtroNome').value = buscaUrl; if (cidadeUrl) byId('filtroCidade').value = cidadeUrl;
  function draw() {
    const nome = byId('filtroNome').value.toLowerCase(); const mod = byId('filtroModalidade').value; const cidade = byId('filtroCidade').value;
    const itens = data.psicologos.filter(p => p.status === 'Aprovado').filter(p => (!nome || `${p.nome} ${p.especialidade} ${p.tags.join(' ')}`.toLowerCase().includes(nome)) && (!mod || p.modalidade.includes(mod)) && (!cidade || p.cidade === cidade));
    lista.innerHTML = itens.map(p => `<article class="listing-card"><div class="listing-main"><div class="avatar large">${initials(p.nome)}</div><div><h2>${p.nome}</h2><p>${p.especialidade} • CRP ${p.crp}</p><p class="rating">★★★★★ 4.9</p><div class="tag-row">${p.tags.map(t=>`<span>${t}</span>`).join('')}<span>${p.cidade}</span></div></div></div><div class="listing-actions"><a class="btn-secondary" href="perfil.html?id=${p.id}">Ver perfil</a><a class="btn-primary" href="agendamento.html?id=${p.id}">Agendar</a></div></article>`).join('') || '<p class="muted">Nenhum psicólogo encontrado.</p>';
  }
  ['filtroNome','filtroModalidade','filtroCidade'].forEach(id => byId(id)?.addEventListener('input', draw)); draw();
}

function pagePerfil() {
  if (!byId('perfilNome')) return; const p = db().psicologos.find(x=>String(x.id)===String(qs('id')||1)); if (!p) return;
  byId('perfilAvatar').textContent = initials(p.nome); byId('perfilNome').textContent = p.nome; byId('perfilEspecialidade').textContent = `${p.especialidade} • CRP ${p.crp} • CIP ${p.cip}`; byId('perfilCidade').textContent = p.cidade; byId('perfilDescricao').textContent = p.descricao; byId('perfilEndereco').textContent = p.endereco;
  byId('perfilTags').innerHTML = p.tags.map(t=>`<span>${t}</span>`).join(''); byId('perfilHorarios').innerHTML = p.horarios.map(h=>`<li>${h.data} às ${h.hora}</li>`).join('') || '<li>Nenhum horário disponível.</li>'; byId('linkAgendarPerfil').href = `agendamento.html?id=${p.id}`;
  const maps = document.querySelector('.map-placeholder'); if (maps) maps.innerHTML = `<iframe title="Mapa da clínica" width="100%" height="260" style="border:0;border-radius:18px" loading="lazy" src="https://www.google.com/maps?q=${encodeURIComponent(p.endereco)}&output=embed"></iframe><a class="btn-secondary full-width" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.endereco)}">Abrir rota no Google Maps</a>`;
}

function pageAgendamento() {
  const form = byId('formAgendamento'); if (!form) return; const data = db(); const p = data.psicologos.find(x=>String(x.id)===String(qs('id')||1));
  if (!p) return; byId('profissional').value = p.nome; const s = session(); if (s?.tipo==='Paciente') { const pac = data.pacientes.find(x=>x.id===s.id); byId('paciente').value=pac?.nome||''; byId('emailPaciente').value=pac?.email||''; }
  const datas = [...new Set(p.horarios.map(h=>h.data))]; byId('dataConsulta').innerHTML = '<option value="">Selecione</option>'+datas.map(d=>`<option>${d}</option>`).join('');
  function horas(){ const d=byId('dataConsulta').value; byId('horarioConsulta').innerHTML = '<option value="">Selecione</option>'+p.horarios.filter(h=>h.data===d).map(h=>`<option>${h.hora}</option>`).join(''); }
  byId('dataConsulta').onchange=horas;
  form.onsubmit = async e => { e.preventDefault(); const banco = db(); const psic = banco.psicologos.find(x=>x.id===p.id);
    let pacId = s?.tipo==='Paciente' ? s.id : null; if (!pacId) { const novo = {id:Date.now(), nome:byId('paciente').value, email:byId('emailPaciente').value, telefone:'', senha:'123456', contatoEmergencia:''}; banco.pacientes.push(novo); pacId=novo.id; }
    const consulta = { id: Date.now(), psicologoId:p.id, pacienteId:pacId, paciente: byId('paciente').value, email: byId('emailPaciente').value, data: byId('dataConsulta').value, hora: byId('horarioConsulta').value, modalidade: byId('modalidadeConsulta').value, observacoes: byId('observacoes').value, status:'Agendada', triagem: JSON.parse(localStorage.getItem('ultimaTriagem') || 'null'), meetLink: '', calendarEventId: '', integracaoMeet: 'Não se aplica' };
    msg(byId('mensagemAgendamento'), 'Confirmando consulta...', 'sucesso');
    if (consulta.modalidade === 'Online') {
      msg(byId('mensagemAgendamento'), 'Gerando link do Google Meet...', 'sucesso');
      const meet = await criarMeetConsulta(consulta, psic);
      consulta.meetLink = meet.meetLink;
      consulta.calendarEventId = meet.calendarEventId;
      consulta.integracaoMeet = meet.simulated ? 'Simulado' : 'Google Calendar API';
    }
    banco.consultas.push(consulta); psic.horarios = psic.horarios.filter(h=>!(h.data===consulta.data && h.hora===consulta.hora)); save(banco); msg(byId('mensagemAgendamento'), consulta.meetLink ? `Consulta agendada! Link Meet: ${consulta.meetLink}` : 'Consulta presencial agendada com sucesso!', 'sucesso'); setTimeout(()=>location.href='dashboard-paciente.html',1400);
  };
}

function pagePlanos() {
  if (!byId('btnSimularPagamento')) return; let escolhido = ''; document.querySelectorAll('.btnPlano').forEach(btn => btn.onclick = () => { escolhido = btn.dataset.plano; document.querySelectorAll('.plano-card').forEach(c=>c.classList.remove('selected-plan')); btn.closest('.plano-card').classList.add('selected-plan'); byId('statusPlano').textContent = `Plano selecionado: ${escolhido} - ${dinheiro(valoresPlanos[escolhido])}/mês`; });
  byId('btnSimularPagamento').onclick = async () => { if (!escolhido) return alert('Escolha um plano primeiro.'); const s=session(); const data=db(); const p=data.psicologos.find(x=>x.id===s?.id); if (!p) return alert('Faça login como psicólogo.'); byId('statusPlano').textContent = 'Criando checkout de pagamento...'; const metodo = byId('metodoPagamento').value; const pg = await criarPagamentoGateway({ plano: escolhido, metodo, psicologo: p }); p.plano=escolhido; p.pagamento=pg.status || 'Pago'; data.pagamentos.push({id:Date.now(),psicologoId:p.id,plano:escolhido,valor:valoresPlanos[escolhido],metodo,status:pg.status||'Pago',gateway:pg.gateway||metodo,checkoutUrl:pg.checkoutUrl||'',transacaoId:pg.transacaoId||'',data:hojeISO(0)}); save(data); byId('statusPlano').innerHTML = `${pg.mensagem || 'Pagamento aprovado.'}<br><b>Status:</b> ${p.pagamento}<br><b>Transação:</b> ${pg.transacaoId || 'sem id'} ${pg.checkoutUrl ? `<br><a class="btn-secondary" target="_blank" href="${pg.checkoutUrl}">Abrir checkout</a>` : ''}<br>Cadastro enviado para validação do admin.`; };
}

function pageAdmin() {
  if (!byId('listaAprovacoes')) return; if (session()?.tipo !== 'Administrador') return location.href='login.html'; const data=db();
  byId('listaAprovacoes').innerHTML = data.psicologos.filter(p=>p.status!=='Aprovado').map(p=>`<article class="listing-card"><div><h3>${p.nome}</h3><p>${p.especialidade} • CRP ${p.crpUf} ${p.crp}</p><p>CIP: ${p.cip} • Documento: ${p.documento}</p><p>Plano: ${p.plano} • Pagamento: ${p.pagamento}</p></div><div class="listing-actions"><button class="btn-primary" onclick="aprovarPsicologo(${p.id})">Aprovar</button><button class="btn-danger" onclick="reprovarPsicologo(${p.id})">Reprovar</button></div></article>`).join('') || '<p class="muted">Nenhum cadastro pendente.</p>';
  byId('listaPagamentos').innerHTML = data.pagamentos.map(pg=>{const p=data.psicologos.find(x=>x.id===pg.psicologoId);return `<li>${p?.nome||'Profissional'} - ${pg.plano} - ${dinheiro(pg.valor)} - ${pg.status}</li>`}).join('');
}
window.aprovarPsicologo = id => { const data=db(); const p=data.psicologos.find(x=>x.id===id); p.status='Aprovado'; save(data); location.reload(); };
window.reprovarPsicologo = id => { const data=db(); const p=data.psicologos.find(x=>x.id===id); p.status='Recusado'; save(data); location.reload(); };

function dashboardPaciente() {
  if (!byId('consultasPaciente')) return; const s=session(); if (s?.tipo!=='Paciente') return location.href='login.html'; const data=db(); const pac=data.pacientes.find(p=>p.id===s.id); byId('tituloPaciente').textContent=`Olá, ${pac?.nome||'Paciente'}`;
  const consultas=data.consultas.filter(c=>c.pacienteId===s.id); byId('consultasPaciente').innerHTML=consultas.map(c=>{const p=data.psicologos.find(x=>x.id===c.psicologoId); return `<article class="dashboard-card"><h3>${p?.nome}</h3><p>${c.data} às ${c.hora} • ${c.modalidade}</p><p>Status: <b>${c.status}</b></p><p>${c.integracaoMeet ? `Integração: ${c.integracaoMeet}` : ''}</p><div class="card-actions">${botaoMeet(c)}<a class="btn-secondary" href="chat.html?id=${c.id}">Chat</a><button class="btn-danger" onclick="cancelarConsulta(${c.id})">Cancelar</button></div></article>`}).join('') || '<p class="muted">Você ainda não possui consultas.</p>';
}
window.cancelarConsulta = id => { const data=db(); const c=data.consultas.find(x=>x.id===id); if(c){c.status='Cancelada'; save(data); location.reload();} };

function dashboardPsicologo() {
  if (!byId('painelPsicologo')) return; const s=session(); if (s?.tipo!=='Psicólogo') return location.href='login.html'; const data=db(); const p=data.psicologos.find(x=>x.id===s.id); byId('tituloPsicologo').textContent=`Olá, ${p.nome}`; byId('resumoPsicologo').textContent=`Status: ${p.status} • Plano: ${p.plano} • Pagamento: ${p.pagamento}`;
  byId('listaHorariosPsicologo').innerHTML=p.horarios.map((h,i)=>`<li>${h.data} às ${h.hora} <button class="link-button" onclick="removerHorario(${i})">remover</button></li>`).join('') || '<li>Nenhum horário cadastrado.</li>';
  byId('consultasPsicologo').innerHTML=data.consultas.filter(c=>c.psicologoId===p.id).map(c=>`<article class="dashboard-card"><h3>${c.paciente}</h3><p>${c.data} às ${c.hora} • ${c.status} • ${c.modalidade}</p><p>${c.observacoes||''}</p><div class="card-actions">${botaoMeet(c)}<a class="btn-secondary" href="chat.html?id=${c.id}">Chat</a><a class="btn-primary" href="prontuario.html?id=${c.id}">Prontuário</a></div></article>`).join('') || '<p class="muted">Nenhuma consulta agendada.</p>';
  byId('formHorario').onsubmit=e=>{e.preventDefault(); if(!byId('novaData').value || !byId('novaHora').value) return msg(byId('mensagemHorario'),'Informe data e hora.','erro'); p.horarios.push({data:byId('novaData').value,hora:byId('novaHora').value}); save(data); location.reload();};
}
window.removerHorario = i => { const data=db(); const p=data.psicologos.find(x=>x.id===session().id); p.horarios.splice(i,1); save(data); location.reload(); };

function pageProntuario() {
  const form=byId('formProntuario'); if(!form) return; const data=db(); const c=data.consultas.find(x=>String(x.id)===String(qs('id'))); if(!c) return; const p=data.pacientes.find(x=>x.id===c.pacienteId); byId('infoProntuario').textContent = `Paciente: ${p?.nome || c.paciente} • Consulta: ${c.data} às ${c.hora}`;
  const atual=data.prontuarios.find(x=>x.consultaId===c.id); ['queixa','evolucao','conduta','observacao'].forEach(id=>{ if(atual && byId(id)) byId(id).value=atual[id]||''; }); if(atual) byId('statusProntuario').textContent=`Status: ${atual.entregue ? 'Prontuário entregue/finalizado' : 'Rascunho'}`;
  byId('btnGerarIa').onclick=()=>{ const tri=c.triagem; byId('queixa').value = c.observacoes || 'Paciente buscou atendimento psicológico.'; byId('evolucao').value = tri ? `Triagem indicou foco em ${tri.sugestao}. Intensidade informada: ${tri.intensidade}/10.` : 'Sessão inicial para acolhimento e levantamento de demanda.'; byId('conduta').value = 'Manter acompanhamento, definir objetivos terapêuticos e orientar estratégias de autocuidado.'; };
  form.onsubmit=e=>{e.preventDefault(); const banco=db(); const existente=banco.prontuarios.find(x=>x.consultaId===c.id); const payload={id:existente?.id||Date.now(), consultaId:c.id, psicologoId:c.psicologoId, pacienteId:c.pacienteId, queixa:byId('queixa').value, evolucao:byId('evolucao').value, conduta:byId('conduta').value, observacao:byId('observacao').value, entregue:byId('entregue').checked, data:hojeISO(0)}; if(existente) Object.assign(existente,payload); else banco.prontuarios.push(payload); save(banco); msg(byId('mensagemProntuario'),'Prontuário salvo com sucesso.','sucesso'); byId('statusProntuario').textContent = payload.entregue ? 'Status: Prontuário entregue/finalizado' : 'Status: Rascunho'; };
}

function pageTriagem() {
  const form=byId('formTriagem'); if(!form) return; form.onsubmit=e=>{e.preventDefault(); const texto=(byId('relatoTriagem').value||'').toLowerCase(); const intensidade=Number(byId('intensidadeTriagem').value); let sugestao='Psicologia clínica'; let pontos=0; Object.entries(especialidadesPorSintoma).forEach(([esp,pals])=>{const score=pals.filter(p=>texto.includes(p)).length; if(score>pontos){pontos=score; sugestao=esp.charAt(0).toUpperCase()+esp.slice(1);}}); if(intensidade>=8) sugestao += ' com prioridade alta'; const resultado={sugestao,intensidade,relato:byId('relatoTriagem').value,data:hojeISO(0)}; localStorage.setItem('ultimaTriagem',JSON.stringify(resultado)); byId('resultadoTriagem').innerHTML=`<div class="notice-box"><b>Sugestão:</b> ${sugestao}<br>Essa triagem não substitui avaliação profissional, mas ajuda a filtrar psicólogos.</div><a class="btn-primary" href="psicologos.html?busca=${encodeURIComponent(sugestao)}">Buscar profissionais indicados</a>`; };
}

function pageEmergencia() {
  const form=byId('formEmergencia'); if(!form) return; form.onsubmit=e=>{e.preventDefault(); const nome=byId('nomeEmergencia').value||'contato de confiança'; const local=byId('localEmergencia').value||'minha localização atual'; byId('mensagemEmergenciaGerada').value=`Olá, ${nome}. Estou passando por um momento difícil e preciso de apoio agora. Você pode falar comigo ou vir até ${local}? Se eu não responder, por favor acione ajuda de emergência.`; };
}

function pageChat() {
  const form=byId('formChat'); if(!form) return; const id=Number(qs('id')); const data=db(); const c=data.consultas.find(x=>x.id===id); const s=session(); if(!c || !s) return location.href='login.html'; byId('chatInfo').textContent=`Consulta ${c.data} às ${c.hora}`;
  function draw(){ const banco=db(); byId('chatMensagens').innerHTML=banco.mensagens.filter(m=>m.consultaId===id).map(m=>`<div class="chat-bubble ${m.autorTipo===s.tipo?'mine':''}"><b>${m.autorTipo}</b><p>${m.texto}</p></div>`).join('') || '<div class="chat-bubble system">Nenhuma mensagem ainda.</div>'; }
  form.onsubmit=e=>{e.preventDefault(); if(!byId('textoChat').value.trim()) return; const banco=db(); banco.mensagens.push({id:Date.now(),consultaId:id,autorTipo:s.tipo,texto:byId('textoChat').value.trim(),data:new Date().toLocaleString('pt-BR')}); save(banco); byId('textoChat').value=''; draw();}; draw();
}

function pageContato(){ const form=byId('formContato'); if(!form) return; form.onsubmit=e=>{e.preventDefault(); const data=db(); data.contatos.push({id:Date.now(),nome:byId('nomeContato').value,email:byId('emailContato').value,mensagem:byId('mensagemContatoTexto').value}); save(data); msg(byId('mensagemContato'),'Mensagem enviada.','sucesso'); form.reset();}; }

setupNav(); pageCadastroPaciente(); pageCadastroPsicologo(); pageLogin(); renderPsicologos(); pagePerfil(); pageAgendamento(); pagePlanos(); pageAdmin(); dashboardPaciente(); dashboardPsicologo(); pageProntuario(); pageTriagem(); pageEmergencia(); pageChat(); pageContato();
