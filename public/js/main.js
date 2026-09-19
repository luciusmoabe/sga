// Ponto de entrada: entrada simulada, casca da aplicação e roteamento por hash.
import { entrar, get, sair, sessao } from './api.js';
import { est } from './estado.js';
import { $, esc, on, trilho } from './ui.js';
import { acoes, centro, direcionar, painel, pauta, prazos } from './telas-diretor.js';
import { atualizacao, historico, inicio, minhasAcoes } from './telas-chefe.js';
import { combinados } from './combinados.js';
import { estrutura } from './estrutura.js';
import { atas, reuniaoDetalhe, reunioes } from './atas.js';
import { viewReuniao } from './reuniao.js';

const GESTAO = ['diretor', 'apoio'];
const TODOS = ['diretor', 'apoio', 'chefe'];
const ROTAS = {
  painel: { f: painel, perfis: GESTAO, trilho: true, titulo: 'Painel da semana' },
  centro: { f: centro, perfis: GESTAO, titulo: 'Centro' },
  direcionar: { f: direcionar, perfis: GESTAO, titulo: 'Direcionar ação' },
  acoes: { f: acoes, perfis: GESTAO, titulo: 'Ações' },
  prazos: { f: prazos, perfis: GESTAO, titulo: 'Pedidos de prazo' },
  pauta: { f: pauta, perfis: GESTAO, titulo: 'Pauta' },
  estrutura: { f: estrutura, perfis: ['diretor'], titulo: 'Estrutura' },
  combinados: { f: combinados, perfis: TODOS, titulo: 'Combinados' },
  reunioes: { f: (r, p) => (p.id ? reuniaoDetalhe(r, p) : reunioes(r, p)), perfis: GESTAO, titulo: 'Reuniões e atas' },
  reuniao: { f: viewReuniao, perfis: GESTAO, tv: true, titulo: 'Modo Reunião' },
  inicio: { f: inicio, perfis: ['chefe'], trilho: true, titulo: 'Início' },
  atualizacao: { f: atualizacao, perfis: ['chefe'], trilho: true, titulo: 'Minha atualização' },
  'minhas-acoes': { f: minhasAcoes, perfis: ['chefe'], trilho: true, titulo: 'Minhas ações' },
  historico: { f: historico, perfis: ['chefe'], titulo: 'Histórico' },
  atas: { f: atas, perfis: ['chefe'], titulo: 'Atas' },
};

const MENU_GESTAO = [
  ['#Acompanhamento'],
  ['painel', 'Painel da semana'],
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
  ['atualizacao', 'Minha atualização'],
  ['minhas-acoes', 'Minhas ações'],
  ['historico', 'Histórico'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['atas', 'Atas'],
];
const PERFIL = { diretor: 'Diretor', apoio: 'Apoio do Diretor', chefe: 'Chefe de seção' };
const app = document.getElementById('app');

function lerRota() {
  const h = (location.hash || '#/').slice(2);
  const [caminho, qs] = h.split('?');
  const [rota, id] = caminho.split('/');
  return { rota, id, q: new URLSearchParams(qs || '') };
}
const casaDe = () => (est.user.perfil === 'chefe' ? '#/inicio' : '#/painel');

async function carregarSessao() {
  est.boot = await get('/bootstrap');
  est.user = est.boot.user;
  est.offset = new Date(est.boot.agora).getTime() - Date.now();
}

async function telaEntrada() {
  document.body.classList.remove('tv');
  const us = await fetch('/api/usuarios-demo').then((r) => r.json());
  const card = (u) => `<button class="perfil" data-u="${u.id}"><b>${esc(u.nome)}</b><span>${u.perfil === 'chefe' ? esc(u.secao_nome || 'Sem seção atribuída') : PERFIL[u.perfil]}</span></button>`;
  app.innerHTML = `<div class="entrada"><div class="entrada-caixa">
    <h1>Agilis</h1><p class="lema">Acompanhamento semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão.</p>
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

function casca() {
  const u = est.user;
  const menu = (u.perfil === 'chefe' ? MENU_CHEFE : MENU_GESTAO).filter((m) => !m[3] || m[3] === u.perfil).filter((m) => !(m[0].startsWith('#') && m[1] && m[1] !== u.perfil));
  app.innerHTML = `<div class="app"><aside class="lateral">
    <div class="marca"><strong>Agilis</strong></div>
    <nav class="menu" aria-label="Principal">${menu.map((m) => m[0].startsWith('#')
      ? `<div class="grupo"><b>${esc(m[0].slice(1))}</b></div>`
      : `<a href="#/${m[0]}" data-rota="${m[0]}" class="${m[2] === 'destaque' ? 'destaque' : ''}">${esc(m[1])}${m[2] === 'selo' ? '<span class="selo oculto" id="selo-prazos"></span>' : ''}</a>`).join('')}</nav>
    <div class="usuario"><b>${esc(u.nome)}</b>${PERFIL[u.perfil]}<br><button class="btn btn-fantasma btn-mini" id="sair">Trocar usuário</button></div></aside>
    <main class="principal"><div id="trilho"></div><div id="conteudo"></div></main></div>`;
  $('#sair').addEventListener('click', () => { sair(); est.user = null; location.hash = '#/'; render(); });
}

async function atualizarSelo() {
  if (est.user.perfil === 'chefe') return;
  try {
    const p = await get('/pedidos-prazo');
    const s = $('#selo-prazos');
    if (s) { s.textContent = p.length; s.classList.toggle('oculto', !p.length); }
  } catch { /* o selo é só um lembrete */ }
}

let gen = 0;
export async function render() {
  const minha = ++gen;
  try {
    if (!sessao.userId) return await telaEntrada();
    if (!est.user) await carregarSessao();
    const { rota, id, q } = lerRota();
    const def = ROTAS[rota];
    if (!def || !def.perfis.includes(est.user.perfil)) { location.hash = casaDe(); return; }
    document.title = `${def.titulo} · Agilis`;
    const refresh = async () => { const y = window.scrollY; await render(); window.scrollTo(0, y); };
    if (def.tv) {
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
    if (e.status === 401) { sair(); est.user = null; return telaEntrada(); }
    const alvo = $('#conteudo') || app;
    alvo.innerHTML = `<div class="cartao"><h2>Não foi possível abrir esta tela</h2><p>${esc(e.message)}</p><a class="btn btn-sec" href="${est.user ? casaDe() : '#/'}">Voltar ao início</a></div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', () => render());
render();
