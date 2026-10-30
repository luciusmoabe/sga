// Ponto de entrada: entrada simulada, casca da aplicação e roteamento por hash.
import { empresaLembrada, empresasDaEntrada, entrar, entrarSenha, get, lembrarEmpresa, sair, sessao, limparSessao, modoAuth, versao } from './api.js';
import { atualizarSessao, est } from './estado.js';
import { $, esc, on, trilho, toast } from './ui.js';
import { acoes, centro, direcionar, painel, pauta, prazos } from './telas-diretor.js';
import { historico, inicio, minhasAcoes } from './telas-chefe.js';
import { atualizacao } from './atualizacao.js';
import { agenda } from './agenda.js';
import { combinados } from './combinados.js';
import { estrutura } from './estrutura.js';
import { configuracaoAta } from './ata-cabecalho.js';
import { atas, reuniaoDetalhe, reunioes } from './atas.js';
import { inicioReuniao, viewReuniao } from './reuniao.js';
import { avisos } from './avisos.js';
import { equipe } from './equipe.js';
import { acoesDosCentros, lePorTodosOsCentros } from './consulta.js';
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
  estrutura: { f: estrutura, perfis: ['diretor', 'administrador'], titulo: 'Configuração' },
  configuracao: { f: (raiz, p) => est.user.perfil === 'apoio' ? configuracaoAta(raiz) : estrutura(raiz, { ...p, painel: 'ata' }), perfis: GESTAO, titulo: 'Configuração' },
  avisos: { f: avisos, perfis: ['diretor', 'administrador'], titulo: 'Avisos' },
  combinados: { f: combinados, perfis: TODOS, titulo: 'Combinados' },
  reunioes: { f: (r, p) => (p.id ? reuniaoDetalhe(r, p) : reunioes(r, p)), perfis: LEITURA, titulo: 'Reuniões e atas' },
  // Sem id: tela comum de início (nada é criado ao abrir a rota). Com id: Modo Reunião em tela cheia.
  reuniao: { f: (r, p) => (p.id ? viewReuniao(r, p) : inicioReuniao(r, p)), perfis: GESTAO, tv: (p) => !!p.id, titulo: 'Modo Reunião' },
  inicio: { f: inicio, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Início' },
  agenda: { f: agenda, perfis: [...TODOS, 'consulta', 'membro'], trilho: true, titulo: 'Agenda' },
  // Leitura das ações de todos os Centros: perfil Consulta e chefe com a permissão (a tela confere a permissão).
  'acoes-centros': { f: acoesDosCentros, perfis: ['consulta', 'chefe'], titulo: 'Ações dos Centros' },
  // O Administrador da Diretoria Adjunta envia o relato da própria seção, como um chefe.
  atualizacao: { f: atualizacao, perfis: ['chefe', 'administrador'], trilho: true, titulo: 'Minha atualização' },
  'minhas-acoes': { f: minhasAcoes, perfis: ['chefe', 'administrador', 'membro'], trilho: true, titulo: 'Minhas ações' },
  // O chefe (e o Administrador vinculado a uma seção) cadastra e desativa os membros da equipe da própria seção.
  equipe: { f: equipe, perfis: ['chefe', 'administrador'], titulo: 'Minha equipe' },
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
  'acoes-centros': '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 10s3-5.5 8.5-5.5S18.5 10 18.5 10s-3 5.5-8.5 5.5S1.5 10 1.5 10z"/><circle cx="10" cy="10" r="2.5"/></svg>',
  equipe: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="2.6"/><path d="M2 16.5c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6"/><circle cx="14.2" cy="8" r="2"/><path d="M14.5 12c2 .2 3.5 1.6 3.5 3.8"/></svg>',
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
  avisos: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3c-2.5 0-4 2-4 4.5V11l-1.5 2.5h11L14 11V7.5C14 5 12.5 3 10 3z"/><path d="M8 15.5a2 2 0 0 0 4 0"/></svg>',
};

const MENU_GESTAO = [
  ['#Acompanhamento'],
  ['painel', 'Painel da semana'],
  ['agenda', 'Agenda'],
  ['reuniao', 'Iniciar reunião', 'destaque'],
  ['#Ações'],
  ['direcionar', 'Direcionar ação'],
  ['acoes', 'Ações'],
  ['prazos', 'Pedidos de prazo'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['reunioes', 'Reuniões e atas'],
  ['#Organização', 'diretor'],
  ['estrutura', 'Configuração', '', 'diretor'],
  ['configuracao', 'Configuração', '', 'apoio'],
  ['avisos', 'Avisos', '', 'diretor'],
];
const MENU_CHEFE = [
  ['#Minha Seção'],
  ['inicio', 'Início'],
  ['agenda', 'Agenda'],
  ['atualizacao', 'Minha atualização'],
  ['minhas-acoes', 'Minhas ações'],
  ['equipe', 'Minha equipe'],
  ['historico', 'Histórico'],
  ['#Reunião'],
  ['combinados', 'Combinados'],
  ['atas', 'Atas'],
];
// Membro da equipe: lê as ações da sua seção e executa as que o chefe atribuiu a ele (ou que ele criou).
const MENU_MEMBRO = [['#Minha seção'], ['minhas-acoes', 'Minhas ações'], ['agenda', 'Agenda']];
// Consulta: só lê as ações dos Centros.
const MENU_CONSULTA = [['#Consulta'], ['acoes-centros', 'Ações dos Centros'], ['agenda', 'Agenda']];
// O Administrador tem acesso total às abas de Configuração.
const MENU_ADMIN = MENU_GESTAO.map((m) => (m[0] === '#Organização' ? ['#Administração'] : m[0] === 'estrutura' ? ['estrutura', 'Configuração'] : m[0] === 'avisos' ? ['avisos', 'Avisos'] : m));
const PERFIL = ROTULO_PERFIL;
// Selos do menu, com a contagem que vem no bootstrap: pedidos de prazo pendentes (gestão) e ações recebidas
// que a pessoa ainda não abriu (chefe e Diretoria Adjunta).
const SELOS = { prazos: [['pedidos_pendentes'], 'pedidos de prazo pendentes'], 'minhas-acoes': [['acoes_novas', 'acoes_a_validar'], 'ações novas ou aguardando a sua validação'] };
const selo = (rota) => (SELOS[rota] ? `<span class="selo oculto" data-selo="${rota}" title="${SELOS[rota][1]}"></span>` : '');
const app = document.getElementById('app');

function lerRota() {
  const h = (location.hash || '#/').slice(2);
  const [caminho, qs] = h.split('?');
  const [rota, id] = caminho.split('/');
  return { rota, id, q: new URLSearchParams(qs || '') };
}
// Início da seção também é a tela de entrada do Administrador da Diretoria Adjunta (mesma tela do chefe).
const casaDe = () => (est.user.perfil === 'consulta' ? '#/acoes-centros' : est.user.perfil === 'membro' ? '#/minhas-acoes'
  : est.user.perfil === 'chefe' || (est.user.perfil === 'administrador' && est.boot?.secao?.tipo === DIRETORIA_ADJUNTA) ? '#/inicio' : '#/painel');


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

/** Empresa escolhida na entrada: a do endereço (`?empresa=slug`), a lembrada do último acesso ou a única que existe. */
const empresaDoEndereco = () => (new URLSearchParams(location.search).get('empresa') || '').trim().toLowerCase().slice(0, 60);
function escolherEmpresa({ empresas, escolhida }) {
  const pedida = empresaDoEndereco();
  if (pedida && escolhida) return escolhida.slug;
  const lembrada = empresaLembrada();
  if (empresas.some((e) => e.slug === lembrada)) return lembrada;
  return empresas.length === 1 ? empresas[0].slug : '';
}

/** Campo "Empresa" da entrada. Com uma só empresa (ou vinda do endereço, fora da lista) mostra o nome; com várias, um seletor
 *  com busca (a partir de 7 empresas). O servidor sempre confere se a conta pertence à empresa escolhida. */
function campoEmpresa({ empresas: lista, escolhida }, atual) {
  const empresas = [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const doEndereco = escolhida && !empresas.some((e) => e.slug === escolhida.slug);
  if (doEndereco || empresas.length === 1) {
    const e = doEndereco ? escolhida : empresas[0];
    return `<div class="campo empresa-fixa"><span class="rotulo-campo">Empresa</span><b>${esc(e.nome)}</b><input type="hidden" name="empresa" value="${esc(e.slug)}">${empresas.length > 1 || doEndereco ? '<a href="/">Não é a sua? Escolher outra</a>' : ''}</div>`;
  }
  return `<div class="campo"><label for="login-empresa">Empresa</label>
    ${empresas.length > 6 ? '<input id="login-empresa-busca" type="search" placeholder="Buscar empresa" aria-label="Buscar empresa" autocomplete="off">' : ''}
    <select id="login-empresa" name="empresa" required>
      <option value="">Escolha a sua empresa</option>
      ${empresas.map((e) => `<option value="${esc(e.slug)}"${e.slug === atual ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}
    </select></div>`;
}

async function telaEntrada({ expirada = false } = {}) {
  document.body.classList.remove('tv');
  if (!expirada) retorno = null;
  if (await modoAuth() === 'supabase') {
    let lista;
    try { lista = await empresasDaEntrada(empresaDoEndereco()); }
    catch { lista = { empresas: [], escolhida: null }; }
    const atual = escolherEmpresa(lista);
    app.innerHTML = `<div class="entrada"><div class="entrada-caixa estreita">
      <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo">
      <p class="entrada-tag">Acompanhamento semanal</p>
      <h1>Bem-vindo ao Agilis</h1>
      <p class="lema">Entre com seu e-mail e senha.</p>
      ${expirada ? '<div class="info" role="status">Sua sessão expirou. Entre novamente para continuar de onde parou; rascunhos não enviados foram mantidos.</div>' : ''}
      <form id="login-senha">
        ${campoEmpresa(lista, atual)}
        <div class="campo"><label for="login-email">E-mail</label>
        <input id="login-email" name="email" type="email" autocomplete="username" maxlength="254" required></div>
        <div class="campo"><label for="login-password">Senha</label>
        <div class="senha-com-olho"><input id="login-password" name="senha" type="password" autocomplete="current-password" maxlength="1024" required>
        <button type="button" class="senha-olho" id="mostrar-senha" aria-label="Mostrar senha" aria-controls="login-password" aria-pressed="false" title="Mostrar senha"><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
        <p id="login-erro" role="alert" aria-live="polite"></p>
        <button class="btn btn-primario btn-entrar" type="submit">Entrar <span aria-hidden="true">→</span></button>
      </form><p class="login-ajuda">Para solicitar acesso ou redefinir sua senha, contate o administrador do Agilis.</p>
      </div></div>`;
    const form = $('#login-senha');
    $('#mostrar-senha').addEventListener('click', (e) => {
      const campo = $('#login-password');
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      e.currentTarget.setAttribute('aria-pressed', String(mostrar));
      e.currentTarget.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      e.currentTarget.title = mostrar ? 'Ocultar senha' : 'Mostrar senha';
    });
    // Busca no seletor de empresas (só aparece quando há muitas): esconde as que não combinam, sem tirar a escolhida.
    $('#login-empresa-busca')?.addEventListener('input', (ev) => {
      const termo = ev.currentTarget.value.trim().toLowerCase();
      for (const op of $('#login-empresa').options) op.hidden = !!op.value && !!termo && !op.textContent.toLowerCase().includes(termo) && !op.selected;
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const botao = form.querySelector('button[type=submit]');
      if (botao.disabled) return;
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      const erro = form.querySelector('#login-erro');
      erro.textContent = '';
      try {
        const empresa = form.elements.empresa?.value || '';
        if (!empresa && lista.empresas.length !== 1) throw new Error('Escolha a sua empresa.');
        await entrarSenha(form.elements.email.value, form.elements.senha.value, empresa);
        if (empresa) lembrarEmpresa(empresa);
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
  const lista = await empresasDaEntrada(empresaDoEndereco()).catch(() => ({ empresas: [], escolhida: null }));
  const pedidaDemo = escolherEmpresa(lista);
  const demo = await fetch(`/api/usuarios-demo${pedidaDemo ? `?empresa=${encodeURIComponent(pedidaDemo)}` : ''}`).then((r) => r.json());
  const us = demo.usuarios;
  const slugDemo = demo.empresa || pedidaDemo;
  const nomeDemo = lista.empresas.find((e) => e.slug === slugDemo)?.nome || lista.escolhida?.nome || '';
  const trocaEmpresa = lista.empresas.length > 1
    ? `<div class="grupo-titulo">Empresa</div><div class="perfis">${[...lista.empresas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((e) => `<button class="perfil${e.slug === slugDemo ? ' ativo' : ''}" data-empresa="${esc(e.slug)}" aria-pressed="${e.slug === slugDemo}"><b>${esc(e.nome)}</b></button>`).join('')}</div>` : '';
  const card = (u) => `<button class="perfil" data-u="${u.id}"><b>${esc(u.nome)}</b><span>${['chefe', 'membro'].includes(u.perfil) ? esc(u.secao_nome || 'Sem seção atribuída') : PERFIL[u.perfil]}</span></button>`;
  app.innerHTML = `<div class="entrada"><div class="entrada-caixa">
    <img src="/imagens/logo-agilis.png" alt="Agilis" class="entrada-logo">
    <p class="entrada-tag">Protótipo de demonstração</p>
    <h1>Bem-vindo ao Agilis</h1>
    <p class="lema">Acompanhamento semanal dos Centros${nomeDemo ? ` — ${esc(nomeDemo)}` : ''}.</p>
    <div class="info">Protótipo com dados fictícios. Escolha um perfil para explorar; não há senha nesta versão.</div>
    ${trocaEmpresa}
    ${us.length ? '' : '<div class="info">Esta empresa ainda não tem usuários cadastrados.</div>'}
    ${us.length ? `<div class="grupo-titulo">Diretor e Apoio</div><div class="perfis">${us.filter((u) => !['chefe', 'membro'].includes(u.perfil)).map(card).join('')}</div>
    <div class="grupo-titulo">Chefes de seção</div><div class="perfis">${us.filter((u) => u.perfil === 'chefe').map(card).join('')}</div>` : ''}
    ${us.some((u) => u.perfil === 'membro') ? `<div class="grupo-titulo">Membros da equipe</div><div class="perfis">${us.filter((u) => u.perfil === 'membro').map(card).join('')}</div>` : ''}</div></div>`;
}

// Delegação única no contêiner #app: vale para a tela de entrada, sem acumular ouvintes.
on(app, 'click', '[data-empresa]', async (el) => {
  if (sessao.userId) return;
  lembrarEmpresa(el.dataset.empresa);
  await telaEntrada();
});
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
  // O chefe com a permissão do Diretor ganha "Ações dos Centros", logo abaixo das próprias ações.
  const chefe = lePorTodosOsCentros() ? MENU_CHEFE.flatMap((m) => (m[0] === 'minhas-acoes' ? [m, ['acoes-centros', 'Ações dos Centros']] : [m])) : MENU_CHEFE;
  const base = u.perfil === 'chefe' ? chefe : u.perfil === 'administrador' ? MENU_ADMIN : u.perfil === 'consulta' ? MENU_CONSULTA : u.perfil === 'membro' ? MENU_MEMBRO : MENU_GESTAO;
  const menu = [...(daDiretoriaAdjunta ? [[`#${est.boot.secao.sigla || 'Diretoria Adjunta'}`], ['inicio', 'Início da seção'], ['minhas-acoes', 'Minhas ações'], ['equipe', 'Minha equipe'], ['atualizacao', 'Minha atualização']] : []), ...base]
    .filter((m) => !m[3] || m[3] === u.perfil).filter((m) => !(m[0].startsWith('#') && m[1] && m[1] !== u.perfil));
  app.innerHTML = `<div class="app"><aside class="lateral">
    <div class="marca"><img src="/imagens/logo-agilis.png" alt="Agilis" class="marca-logo">${est.boot?.empresa ? `<div class="marca-empresa" title="${esc(est.boot.empresa.nome)}">${esc(est.boot.empresa.sigla || est.boot.empresa.nome)}</div>` : ''}</div>
    <nav class="menu" aria-label="Principal">${menu.map((m) => m[0].startsWith('#')
      ? `<div class="grupo"><b>${esc(m[0].slice(1))}</b></div>`
      : `<a href="#/${m[0]}" data-rota="${m[0]}" class="${m[2] === 'destaque' ? 'destaque' : ''}"><span class="menu-rotulo">${ICONES[m[0]] || ''}${esc(m[1])}</span>${selo(m[0])}</a>`).join('')}</nav>
    <div class="usuario"><b>${esc(u.nome)}</b>${PERFIL[u.perfil]}${est.boot?.secao?.tipo === DIRETORIA_ADJUNTA ? ` · ${esc(est.boot.secao.sigla || est.boot.secao.nome)}` : ''}<br><span class="usuario-acoes">${sessao.modo === 'demo' ? '' : '<button class="btn btn-fantasma btn-mini" id="alterar-senha">Alterar senha</button>'}<button class="btn btn-fantasma btn-mini" id="sair">${sessao.modo === 'demo' ? 'Trocar usuário' : 'Sair'}</button></span>
      <button class="btn btn-fantasma btn-mini oculto" id="instalar-app" style="margin-top:6px">Instalar aplicativo</button></div></aside>
    <main class="principal"><div id="trilho"></div><div id="conteudo"></div></main>
    ${cascaMovel(u, menu)}</div>`;
  atualizarBotaoInstalar();
  document.title = est.boot?.empresa ? `Agilis · ${est.boot.empresa.sigla || est.boot.empresa.nome}` : 'Agilis';
  $('#alterar-senha')?.addEventListener('click', () => abrirTrocaSenha());
  $('#sair').addEventListener('click', async () => {
    try { await sair(); est.user = null; est.boot = null; location.hash = '#/'; render(); }
    catch (e) { toast(e.message); }
  });
  ligarCascaMovel();
}

// ---------- Celular (até 760 px): barra de topo, abas inferiores e folha "Mais" ----------
// No computador estes elementos ficam escondidos e a lateral continua igual. As abas trazem as telas mais usadas
// de cada perfil, ao alcance do polegar; "Mais" reúne o resto do menu e a conta.
const ABAS_MOVEL = {
  chefe: [['inicio', 'Início'], ['minhas-acoes', 'Ações'], ['atualizacao', 'Atualização'], ['agenda', 'Agenda']],
  gestao: [['painel', 'Painel'], ['agenda', 'Agenda'], ['acoes', 'Ações'], ['prazos', 'Prazos']],
  consulta: [['acoes-centros', 'Ações'], ['agenda', 'Agenda']],
  membro: [['minhas-acoes', 'Ações'], ['agenda', 'Agenda']],
};
const ICONE_MAIS = '<svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/></svg>';
// Iniciais do primeiro e do último nome, sem parênteses, partículas nem posto/graduação
// ("Ten Cel PM Lucius Moabe" → LM, "Diretor (demonstração)" → DD, "Ana Ribeiro" → AR).
const NAO_NOME = new Set(['sd', 'cb', 'sgt', 'subten', 'st', 'ten', 'cap', 'maj', 'cel', 'gen', 'asp', 'al', 'pm', 'bm', 'dr', 'dra', 'sr', 'sra']);
const iniciais = (nome) => {
  const partes = nome.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter((p) => p.length > 2 && !NAO_NOME.has(p.toLowerCase()));
  const escolhidas = partes.length > 1 ? [partes[0], partes.at(-1)] : partes;
  return escolhidas.map((p) => p[0]).join('').toUpperCase() || nome.trim()[0]?.toUpperCase() || '?';
};

function cascaMovel(u, menu) {
  const abas = ABAS_MOVEL[['chefe', 'consulta', 'membro'].includes(u.perfil) ? u.perfil : 'gestao'];
  const rotuloPerfil = `${PERFIL[u.perfil]}${est.boot?.secao ? ` · ${esc(est.boot.secao.sigla || est.boot.secao.nome)}` : ''}`;
  return `<header class="topo-movel">
      <img src="/imagens/logo-agilis.png" alt="Agilis" class="topo-movel-logo">
      <button type="button" class="topo-movel-conta" data-abrir-mais aria-label="Conta e mais opções">${esc(iniciais(u.nome))}</button>
    </header>
    <nav class="abas-movel" aria-label="Navegação principal">
      ${abas.map(([rota, rotulo]) => `<a href="#/${rota}" data-rota="${rota}">${ICONES[rota] || ''}<span>${rotulo}</span>${selo(rota)}</a>`).join('')}
      <button type="button" data-abrir-mais data-aba-mais>${ICONE_MAIS}<span>Mais</span></button>
    </nav>
    <dialog class="folha-mais" aria-label="Mais opções">
      <div class="folha-alca" aria-hidden="true"></div>
      <div class="folha-conta"><span class="topo-movel-conta" aria-hidden="true">${esc(iniciais(u.nome))}</span>
        <div><b>${esc(u.nome)}</b><div class="suave pequeno">${rotuloPerfil}</div></div></div>
      <nav class="folha-menu" aria-label="Todas as telas">${menu.map((m) => m[0].startsWith('#')
        ? `<div class="folha-grupo">${esc(m[0].slice(1))}</div>`
        : `<a href="#/${m[0]}" data-rota="${m[0]}">${ICONES[m[0]] || ''}<span>${esc(m[1])}</span>${selo(m[0])}</a>`).join('')}</nav>
      <div class="folha-acoes">
        ${sessao.modo === 'demo' ? '' : '<button type="button" class="btn btn-sec" data-conta="senha">Alterar senha</button>'}
        <button type="button" class="btn btn-sec oculto" data-conta="instalar">Instalar aplicativo</button>
        <button type="button" class="btn btn-sec" data-conta="sair">${sessao.modo === 'demo' ? 'Trocar usuário' : 'Sair'}</button>
        <button type="button" class="btn btn-fantasma" data-fechar-mais>Fechar</button>
      </div>
    </dialog>`;
}

function ligarCascaMovel() {
  const folha = $('.folha-mais');
  if (!folha) return;
  const fechar = () => folha.open && folha.close();
  // Ouvintes nos próprios botões (recriados com a casca), para não se acumularem em `app` a cada troca de perfil.
  for (const b of app.querySelectorAll('[data-abrir-mais]')) {
    b.addEventListener('click', () => {
      $('[data-conta="instalar"]', folha)?.classList.toggle('oculto', !promptInstalar);
      if (!folha.open) folha.showModal();
    });
  }
  folha.addEventListener('click', (ev) => {
    if (ev.target === folha || ev.target.closest('[data-fechar-mais], .folha-menu a')) fechar(); // toque fora da folha ou num link
  });
  on(folha, 'click', '[data-conta="senha"]', () => { fechar(); abrirTrocaSenha(); });
  on(folha, 'click', '[data-conta="instalar"]', () => { fechar(); $('#instalar-app')?.click(); });
  on(folha, 'click', '[data-conta="sair"]', () => { fechar(); $('#sair').click(); });
}

// As contagens vêm no bootstrap: não há requisição própria para os selos.
function atualizarSelo() {
  for (const s of document.querySelectorAll('[data-selo]')) {
    const n = SELOS[s.dataset.selo][0].reduce((total, chave) => total + (est.boot?.[chave] ?? 0), 0);
    s.textContent = n;
    s.classList.toggle('oculto', !n);
  }
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
    // A casca muda com o perfil e com a consulta aos outros Centros (o menu ganha "Ações dos Centros").
    const chaveCasca = `${est.user.perfil}:${lePorTodosOsCentros() ? 1 : 0}`;
    if (!$('.app') || $('.app')?.dataset.perfil !== chaveCasca) { casca(); $('.app').dataset.perfil = chaveCasca; }
    for (const a of document.querySelectorAll('.menu a, .abas-movel a, .folha-menu a')) {
      const ativa = a.dataset.rota === rota || (rota === 'centro' && a.dataset.rota === 'painel') || (rota === 'pauta' && a.dataset.rota === 'painel');
      if (ativa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    // No celular, a aba "Mais" fica marcada quando a tela atual não tem aba própria.
    $('[data-aba-mais]')?.classList.toggle('ativa', !document.querySelector('.abas-movel a[aria-current]'));
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
// Uma tela que só recarrega os próprios dados (sem render) também mantém os selos do menu em dia.
window.addEventListener('sgc:selos', () => { if (est.user) carregarSessao().then(atualizarSelo).catch(() => { /* fica para a próxima tela */ }); });
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* segue sem instalação; a navegação comum continua funcionando */ });
