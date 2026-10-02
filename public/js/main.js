// Ponto de entrada: entrada simulada, casca da aplicação e roteamento por hash.
import { entrar, entrarSenha, get, sair, sessao, limparSessao, modoAuth, versao } from './api.js';
import { atualizarSessao, est } from './estado.js';
import { $, esc, on, trilho, toast } from './ui.js';
import { acoes, centro, direcionar, painel, pauta, prazos } from './telas-diretor.js';
import { historico, inicio, minhasAcoes } from './telas-chefe.js';
import { atualizacao } from './atualizacao.js';
import { agenda } from './agenda.js';
import { combinados } from './combinados.js';
import { estrutura } from './estrutura.js';
import { atas, reuniaoDetalhe, reunioes } from './atas.js';
import { inicioReuniao, viewReuniao } from './reuniao.js';
import { DIRETORIA_ADJUNTA, ROTULO_PERFIL } from './regras.js';
import { abrirTrocaSenha, telaTrocaSenha } from './senha.js';

const GESTAO = ['diretor', 'apoio', 'administrador'];
const LEITURA = ['diretor', 'apoio', 'administrador']; // telas de acompanhamento que o Administrador também consulta
const TODOS = ['diretor', 'apoio', 'chefe', 'administrador'];
const ROTAS = {
  painel: { f: painel, perfis: LEITURA, trilho: true, titulo: 'Painel da semana' },
  centro: { f: centro, perfis: LEITURA, titulo: 'Centro' },
  direcionar: { f: direcionar, perfis: GESTAO, titulo: 'Direcionar ação' },
  acoes: { f: acoes, perfis: LEITURA, titulo: 'Ações' },
  prazos: { f: prazos, perfis: LEITURA, titulo: 'Pedidos de prazo' },
  pauta: { f: pauta, perfis: LEITURA, titulo: 'Pauta' },
  estrutura: { f: estrutura, perfis: ['diretor', 'administrador'], titulo: 'Estrutura' },
  combinados: { f: combinados, perfis: TODOS, titulo: 'Combinados' },
  reunioes: { f: (r, p) => (p.id ? reuniaoDetalhe(r, p) : reunioes(r, p)), perfis: LEITURA, titulo: 'Reuniões e atas' },
  // Sem id: tela comum de início (nada é criado ao abrir a rota). Com id: Modo Reunião em tela cheia.
  reuniao: { f: (r, p) => (p.id ? viewReuniao(r, p) : inicioReuniao(r, p)), perfis: GESTAO, tv: (p) => !!p.id, titulo: 'Modo Reunião' },
  inicio: { f: inicio, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Início' },
  agenda: { f: agenda, perfis: TODOS, trilho: true, titulo: 'Agenda' },
  // O Administrador da Diretoria Adjunta envia o relato da própria seção, como um chefe.
  atualizacao: { f: atualizacao, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Minha atualização' },
  'minhas-acoes': { f: minhasAcoes, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Minhas ações' },
  historico: { f: historico, perfis: ['chefe'], titulo: 'Histórico' },
  atas: { f: atas, perfis: ['chefe'], titulo: 'Atas' },
};

// Ícones do menu: SVG embutido (sem fonte de ícones nem CDN de terceiros), um traço simples por rota.
// `stroke="currentColor"` acompanha a cor do link (normal, hover, selecionado) sem CSS à parte.
const ICONES = {
  painel: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="2.5" width="6" height="6" rx="1.2"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.2"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.2"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.2"/></svg>',
  agenda: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2.5" y="4" width="15" height="13" rx="1.5"/><line x1="2.5" y1="8" x2="17.5" y2="8"/><line x1="6" y1="2" x2="6" y2="5.5"/><line x1="14" y1="2" x2="14" y2="5.5"/></svg>',
  reuniao: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3.5" width="16" height="10.5" rx="1.5"/><line x1="7" y1="17.5" x2="13" y2="17.5"/><line x1="10" y1="14" x2="10" y2="17.5"/><path d="M8.3 6.3v5l4.4-2.5-4.4-2.5z" fill="currentColor" stroke="none"/></svg>',
  direcionar: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="10" x2="16" y2="10"/><polyline points="11,5 16,10 11,15"/></svg>',
  acoes: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,5 4,6.5 6.5,3.5"/><line x1="9" y1="5" x2="17.5" y2="5"/><polyline points="2.5,11 4,12.5 6.5,9.5"/><line x1="9" y1="11" x2="17.5" y2="11"/><line x1="2.5" y1="16" x2="17.5" y2="16"/></svg>',
  prazos: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10.5" r="7"/><polyline points="10,6.5 10,10.5 13,12.5"/></svg>',
  combinados: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="2.5" x2="5" y2="17.5"/><path d="M5 3.5h9l-2.3 3 2.3 3H5"/></svg>',
  reunioes: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5v3.5h3.5"/><line x1="7.5" y1="10" x2="14" y2="10"/><line x1="7.5" y1="13.5" x2="14" y2="13.5"/></svg>',
  estrutura: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="4" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><line x1="10" y1="6" x2="10" y2="10"/><line x1="10" y1="10" x2="4.5" y2="13"/><line x1="10" y1="10" x2="15.5" y2="13"/></svg>',
  inicio: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 10 3l7 6.5"/><path d="M5 8.5v8h10v-8"/></svg>',
  atualizacao: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 3.5 16 7l-9 9-4 1 1-4z"/></svg>',
  'minhas-acoes': '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="2.5,5 4,6.5 6.5,3.5"/><line x1="9" y1="5" x2="17.5" y2="5"/><polyline points="2.5,11 4,12.5 6.5,9.5"/><line x1="9" y1="11" x2="17.5" y2="11"/><line x1="2.5" y1="16" x2="17.5" y2="16"/></svg>',
  historico: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6"/><polyline points="2.5,3.5 3.5,6.5 6.5,5.5"/><polyline points="10,7 10,10.3 12.5,11.8"/></svg>',
  atas: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5v3.5h3.5"/><line x1="7.5" y1="10" x2="14" y2="10"/><line x1="7.5" y1="13.5" x2="14" y2="13.5"/></svg>',
};

const MENU_GESTAO = [
  ['#Acompanhamento'],
  ['painel', 'Painel da semana'],
  ['agenda', 'Agenda'],
  ['reuniao', 'Iniciar reunião', 'destaque'],
  ['#Ações'],
  ['direcionar', 'Direcionar ação'],
  ['acoes', 'Ações'],
  ['prazos', 'Pedidos de prazo', 'selo'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['reunioes', 'Reuniões e atas'],
  ['#Organização', 'diretor'],
  ['estrutura', 'Estrutura', '', 'diretor'],
];
const MENU_CHEFE = [
  ['#Minha Seção'],
  ['inicio', 'Início'],
  ['agenda', 'Agenda'],
  ['atualizacao', 'Minha atualização'],
  ['minhas-acoes', 'Minhas ações'],
  ['historico', 'Histórico'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['atas', 'Atas'],
];
// O Administrador tem acesso total: o menu do Diretor, com a estrutura como "Contas e estrutura".
const MENU_ADMIN = MENU_GESTAO.map((m) => (m[0] === '#Organização' ? ['#Administração'] : m[0] === 'estrutura' ? ['estrutura', 'Contas e estrutura'] : m));
const PERFIL = ROTULO_PERFIL;
const app = document.getElementById('app');

function lerRota() {
  const h = (location.hash || '#/').slice(2);
  const [caminho, qs] = h.split('?');
  const [rota, id] = caminho.split('/');
  return { rota, id, q: new URLSearchParams(qs || '') };
}
const casaDe = () => (est.user.perfil === 'chefe' ? '#/inicio' : '#/painel');


// O bootstrap (usuário, semana, selo) muda pouco: reaproveitá-lo poupa uma ida ao servidor a cada troca de tela.
// É refeito depois de 30 s, de qualquer gravação, de novo login ou troca de usuário.
const VALIDADE_BOOT_MS = 30_000;
let boot = { em: 0, mutacoes: -1, geracao: -1 };
async function carregarSessao() {
  const fresco = est.boot && est.user && boot.geracao === sessao.geracao && boot.mutacoes === versao.mutacoes && Date.now() - boot.em < VALIDADE_BOOT_MS;
  if (fresco) return;
  const geracao = sessao.geracao, mutacoes = versao.mutacoes;
  atualizarSessao(await get('/bootstrap'));
  boot = { em: Date.now(), mutacoes, geracao };
}

// Tela para onde voltar depois de um novo login causado por sessão expirada.
let retorno = null;

async function telaEntrada({ expirada = false } = {}) {
  document.body.classList.remove('tv');
  if (!expirada) retorno = null;
  if (await modoAuth() === 'supabase') {
    app.innerHTML = `<div class="entrada"><div class="entrada-caixa estreita">
      <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo">
      <p class="entrada-tag">Acompanhamento semanal</p>
      <h1>Bem-vindo ao Agilis</h1>
      <p class="lema">Entre com seu e-mail e senha.</p>
      ${expirada ? '<div class="info" role="status">Sua sessão expirou. Entre novamente para continuar de onde parou; rascunhos não enviados foram mantidos.</div>' : ''}
      <form id="login-senha">
        <div class="campo"><label for="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" autocomplete="username" maxlength="254" required></div>
        <div class="campo"><label for="login-password">Senha</label>
        <input id="login-password" name="senha" type="password" autocomplete="current-password" maxlength="1024" required></div>
        <p id="login-erro" role="alert" aria-live="polite"></p>
        <button class="btn btn-primario btn-entrar" type="submit">Entrar <span aria-hidden="true">→</span></button>
      </form><p class="login-ajuda">Para solicitar acesso ou redefinir sua senha, contate o administrador do Agilis.</p>
      </div></div>`;
    const form = $('#login-senha');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const botao = form.querySelector('button');
      if (botao.disabled) return;
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      const erro = form.querySelector('#login-erro');
      erro.textContent = '';
      try {
        await entrarSenha(form.elements.email.value, form.elements.senha.value);
        form.elements.senha.value = '';
        est.user = null;
        location.hash = retorno || '#/';
        retorno = null;
        await render();
      } catch (err) {
        form.elements.senha.value = '';
        erro.textContent = err.message;
        form.elements.senha.focus();
      } finally { botao.disabled = false; botao.textContent = 'Entrar'; }
    });
    return;
  }
  const us = await fetch('/api/usuarios-demo').then((r) => r.json());
  const card = (u) => `<button class="perfil" data-u="${u.id}"><b>${esc(u.nome)}</b><span>${u.perfil === 'chefe' ? esc(u.secao_nome || 'Sem seção atribuída') : PERFIL[u.perfil]}</span></button>`;
  app.innerHTML = `<div class="entrada"><div class="entrada-caixa">
    <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo">
    <p class="entrada-tag">Protótipo de demonstração</p>
    <h1>Bem-vindo ao Agilis</h1>
    <p class="lema">Acompanhamento semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão.</p>
    <div class="info">Protótipo com dados fictícios. Escolha um perfil para explorar; não há senha nesta versão.</div>
    <div class="grupo-titulo">Diretor e Apoio</div><div class="perfis">${us.filter((u) => u.perfil !== 'chefe').map(card).join('')}</div>
    <div class="grupo-titulo">Chefes de seção</div><div class="perfis">${us.filter((u) => u.perfil === 'chefe').map(card).join('')}</div></div></div>`;
}

// Delegação única no contêiner #app: vale para a tela de entrada, sem acumular ouvintes.
on(app, 'click', '[data-u]', async (el) => {
  if (sessao.userId) return;
  entrar(el.dataset.u);
  location.hash = '#/';
  await render();
});

// ---------- Instalar como aplicativo ----------
// O navegador dispara este evento quando o Agilis cumpre os requisitos de instalação (manifesto + service
// worker). Guardamos o evento para oferecer o botão só quando a instalação for realmente possível.
const rodandoComoApp = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
let promptInstalar = null;
const atualizarBotaoInstalar = () => {
  const botao = $('#instalar-app');
  botao?.classList.toggle('oculto', !promptInstalar || rodandoComoApp());
};
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  promptInstalar = ev;
  atualizarBotaoInstalar();
});
window.addEventListener('appinstalled', () => {
  promptInstalar = null;
  atualizarBotaoInstalar();
  toast('Agilis instalado. Você já pode abri-lo como um aplicativo.');
});
on(app, 'click', '#instalar-app', async () => {
  if (!promptInstalar) return;
  promptInstalar.prompt();
  await promptInstalar.userChoice;
  promptInstalar = null;
  atualizarBotaoInstalar();
});

function casca() {
  const u = est.user;
  // Quem é da Diretoria Adjunta (Administrador vinculado a ela) cria e acompanha as ações da seção e envia o relato semanal.
  const daDiretoriaAdjunta = u.perfil === 'administrador' && est.boot?.secao?.tipo === DIRETORIA_ADJUNTA;
  const base = u.perfil === 'chefe' ? MENU_CHEFE : u.perfil === 'administrador' ? MENU_ADMIN : MENU_GESTAO;
  const menu = [...(daDiretoriaAdjunta ? [[`#${est.boot.secao.sigla || 'Diretoria Adjunta'}`], ['inicio', 'Início da seção'], ['minhas-acoes', 'Minhas ações'], ['atualizacao', 'Minha atualização']] : []), ...base]
    .filter((m) => !m[3] || m[3] === u.perfil).filter((m) => !(m[0].startsWith('#') && m[1] && m[1] !== u.perfil));
  app.innerHTML = `<div class="app"><aside class="lateral">
    <div class="marca"><img src="/imagens/logo-agilis.png" alt="Agilis" class="marca-logo"></div>
    <nav class="menu" aria-label="Principal">${menu.map((m) => m[0].startsWith('#')
      ? `<div class="grupo"><b>${esc(m[0].slice(1))}</b></div>`
      : `<a href="#/${m[0]}" data-rota="${m[0]}" class="${m[2] === 'destaque' ? 'destaque' : ''}"><span class="menu-rotulo">${ICONES[m[0]] || ''}${esc(m[1])}</span>${m[2] === 'selo' ? '<span class="selo oculto" id="selo-prazos"></span>' : ''}</a>`).join('')}</nav>
    <div class="usuario"><b>${esc(u.nome)}</b>${PERFIL[u.perfil]}${est.boot?.secao?.tipo === DIRETORIA_ADJUNTA ? ` · ${esc(est.boot.secao.sigla || est.boot.secao.nome)}` : ''}<br><span class="usuario-acoes">${sessao.modo === 'demo' ? '' : '<button class="btn btn-fantasma btn-mini" id="alterar-senha">Alterar senha</button>'}<button class="btn btn-fantasma btn-mini" id="sair">${sessao.modo === 'demo' ? 'Trocar usuário' : 'Sair'}</button></span>
      <button class="btn btn-fantasma btn-mini oculto" id="instalar-app" style="margin-top:6px">Instalar aplicativo</button></div></aside>
    <main class="principal"><div id="trilho"></div><div id="conteudo"></div></main></div>`;
  atualizarBotaoInstalar();
  $('#alterar-senha')?.addEventListener('click', () => abrirTrocaSenha());
  $('#sair').addEventListener('click', async () => {
    try { await sair(); est.user = null; est.boot = null; location.hash = '#/'; render(); }
    catch (e) { toast(e.message); }
  });
}

// A contagem vem no bootstrap: não há requisição própria para o selo.
function atualizarSelo() {
  if (est.user.perfil === 'chefe') return;
  const n = est.boot?.pedidos_pendentes ?? 0;
  const s = $('#selo-prazos');
  if (s) { s.textContent = n; s.classList.toggle('oculto', !n); }
}

let gen = 0;
// Barra fina de progresso enquanto a próxima tela carrega (aparece só se demorar mais de ~150 ms).
export async function render() {
  const minha = gen + 1;
  document.body.classList.add('carregando');
  try { await renderizar(); } finally { if (minha === gen) document.body.classList.remove('carregando'); }
}
async function renderizar() {
  const minha = ++gen;
  try {
    const modo = await modoAuth();
    if (minha !== gen) return;
    if (modo === 'demo' && !sessao.userId) return await telaEntrada();
    await carregarSessao();
    if (minha !== gen) return;
    // Senha inicial provisória: nada funciona até a pessoa criar a própria.
    if (est.user.trocar_senha) return telaTrocaSenha(app, { aoConcluir: async () => { est.user = null; est.boot = null; location.hash = '#/'; await render(); }, aoSair: async () => { try { await sair(); } catch { /* segue */ } est.user = null; est.boot = null; location.hash = '#/'; render(); } });
    const { rota, id, q } = lerRota();
    const def = ROTAS[rota];
    if (!def || !def.perfis.includes(est.user.perfil)) { location.hash = casaDe(); return; }
    document.title = `${def.titulo} · Agilis`;
    const refresh = async () => { const y = window.scrollY; await render(); window.scrollTo(0, y); };
    if (def.tv?.({ id })) {
      document.body.classList.add('tv');
      app.innerHTML = '<div class="tv-app" id="tv"></div>';
      await def.f($('#tv'), { id, q, refresh });
      return;
    }
    document.body.classList.remove('tv');
    if (!$('.app') || $('.app')?.dataset.perfil !== est.user.perfil) { casca(); $('.app').dataset.perfil = est.user.perfil; }
    for (const a of document.querySelectorAll('.menu a')) {
      const ativa = a.dataset.rota === rota || (rota === 'centro' && a.dataset.rota === 'painel') || (rota === 'pauta' && a.dataset.rota === 'painel');
      if (ativa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    $('#trilho').innerHTML = def.trilho ? trilho(est.boot) : '';
    const conteudo = $('#conteudo');
    const novo = document.createElement('div');
    novo.id = 'conteudo';
    await def.f(novo, { id, q, refresh });
    if (minha !== gen) return;
    conteudo.replaceWith(novo);
    atualizarSelo();
  } catch (e) {
    if (minha !== gen) return;
    if (e.status === 401) {
      const eraLogado = !!est.user;
      if (eraLogado && !retorno) retorno = location.hash;
      limparSessao(); est.user = null; est.boot = null;
      return telaEntrada({ expirada: eraLogado });
    }
    if (e.dados?.trocar_senha) { est.user = null; est.boot = null; return render(); }
    const alvo = $('#conteudo') || app;
    alvo.innerHTML = `<div class="cartao"><h2>Não foi possível abrir esta tela</h2><p>${esc(e.message)}</p><a class="btn btn-sec" href="${est.user ? casaDe() : '#/'}">Voltar ao início</a></div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', () => render());
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* segue sem instalação; a navegação comum continua funcionando */ });
