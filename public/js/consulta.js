// Ações dos Centros: leitura das ações de todas as seções, para o perfil Consulta e para o chefe a quem o Diretor
// deu essa permissão (usuarios.ver_outros_centros). As de fora da própria seção abrem só para leitura.
import { get } from './api.js';
import { est } from './estado.js';
import { $, br, esc, on, pilulaStatus, PRIO, STATUS, toast, vazio } from './ui.js';
import { abrirAcao } from './acao-comum.js';

export const lePorTodosOsCentros = () => est.user?.perfil === 'consulta' || (est.user?.perfil === 'chefe' && !!est.user.ver_outros_centros);

export async function acoesDosCentros(raiz) {
  if (!lePorTodosOsCentros()) {
    raiz.innerHTML = `<div class="cabeca"><h1>Ações dos Centros</h1></div><div class="cartao">${vazio(
      'Consulta não liberada', 'Peça ao Diretor para liberar a consulta às ações de todos os Centros.')}</div>`;
    return;
  }
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Ações dos Centros</h1><div class="sub">Ações de todas as seções, só para leitura${est.user.perfil === 'chefe' ? '. As da sua seção continuam em Minhas ações' : ''}.</div></div></div>
    <div class="cartao"><div class="linha filtros-acoes" style="margin-bottom:12px">
      <div class="filtro-busca" style="flex:1;min-width:200px"><label for="c-q">Buscar</label><input id="c-q" type="search" placeholder="Título ou detalhe"></div>
      <button type="button" class="btn btn-sec filtros-alternar" aria-expanded="false" aria-controls="c-filtros">Filtros</button>
      <div class="filtros-extra linha" id="c-filtros" style="margin:0">
        <div style="min-width:170px"><label for="c-secao">Seção</label><select id="c-secao"><option value="">Todas</option></select></div>
        <div style="min-width:170px"><label for="c-sit">Situação</label><select id="c-sit"><option value="abertas">Abertas</option><option value="atrasadas">Atrasadas</option><option value="concluidas">Concluídas (aguardando aceite)</option><option value="encerradas">Encerradas</option></select></div>
        <div style="min-width:170px"><label for="c-status">Status</label><select id="c-status"><option value="">Qualquer</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div></div>
      <div class="tabela-rolagem" id="c-lista"></div></div>`;
  on(raiz, 'click', '.filtros-alternar', (el) => {
    const aberto = $('.filtros-acoes', raiz).classList.toggle('filtros-abertos');
    el.setAttribute('aria-expanded', String(aberto));
  });

  // A lista de seções vem das próprias ações: quem só lê não precisa (nem pode, no perfil Consulta) ler a estrutura.
  let lista = [];
  const desenhar = () => {
    const secao = $('#c-secao', raiz).value;
    const busca = $('#c-q', raiz).value.trim().toLowerCase();
    const vistas = lista.filter((a) => (!secao || String(a.secao_id) === secao)
      && (!busca || `${a.titulo} ${a.detalhe || ''}`.toLowerCase().includes(busca)));
    $('#c-lista', raiz).innerHTML = vistas.length ? `<table class="tabela-lista"><thead><tr><th>Ação</th><th>Seção</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>
      ${vistas.map((a) => `<tr class="clicavel" data-acao="${a.id}" tabindex="0"><td><b>${esc(a.titulo)}</b> ${a.demandada_diretor ? '<span class="pilula diretor">Diretriz</span> ' : ''}<span class="pilula prio-${a.prioridade}">${PRIO[a.prioridade]}</span></td>
        <td data-rotulo="Seção">${esc(a.secao_sigla)}${a.somente_leitura ? '' : ' <span class="suave pequeno">(sua seção)</span>'}</td><td class="num" data-rotulo="Prazo">${br(a.prazo)}</td><td data-rotulo="Situação">${pilulaStatus(a)}</td></tr>`).join('')}</tbody></table>`
      : vazio('Nenhuma ação encontrada', 'Ajuste a busca ou os filtros.');
  };
  const carregar = async () => {
    const p = new URLSearchParams({ escopo: 'todos', situacao: $('#c-sit', raiz).value });
    if ($('#c-status', raiz).value) p.set('status', $('#c-status', raiz).value);
    lista = await get(`/acoes?${p}`);
    const sel = $('#c-secao', raiz);
    const escolhida = sel.value;
    const secoes = [...new Map(lista.map((a) => [a.secao_id, a.secao_sigla || a.secao_nome])).entries()].sort((x, y) => x[1].localeCompare(y[1]));
    sel.innerHTML = `<option value="">Todas</option>${secoes.map(([id, nome]) => `<option value="${id}" ${String(id) === escolhida ? 'selected' : ''}>${esc(nome)}</option>`).join('')}`;
    desenhar();
  };
  for (const id of ['c-sit', 'c-status']) $(`#${id}`, raiz).addEventListener('change', () => carregar().catch((e) => toast(e.message, 'erro')));
  $('#c-secao', raiz).addEventListener('change', desenhar);
  let t;
  $('#c-q', raiz).addEventListener('input', () => { clearTimeout(t); t = setTimeout(desenhar, 200); });
  const abrir = (el) => abrirAcao(el.dataset.acao).catch((e) => toast(e.message, 'erro'));
  on(raiz, 'click', 'tr[data-acao]', abrir);
  on(raiz, 'keydown', 'tr[data-acao]', (el, ev) => { if (ev.key === 'Enter') abrir(el); });
  await carregar();
}
