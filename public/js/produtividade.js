// Produtividade das unidades: entregas, pontualidade, retrabalho, tempo de ciclo, dedicação e carga, com a comparação com o período
// anterior. Avalia UNIDADES; os números por pessoa só aparecem para o chefe da unidade e para os dirigentes acima dele.
import { get } from './api.js';
import { est } from './estado.js';
import { addDias, br, esc, vazio } from './ui.js';

const PERIODOS = [
  ['28', 'Últimos 28 dias'], ['7', 'Últimos 7 dias'], ['90', 'Últimos 90 dias'], ['mes', 'Mês anterior'], ['custom', 'Escolher datas'],
];
const ui = { periodo: '28', de: '', ate: '' };

/** Datas [de, ate] do período escolhido. */
function intervalo() {
  const hoje = est.boot.hoje;
  if (ui.periodo === 'custom' && ui.de && ui.ate) return [ui.de, ui.ate];
  if (ui.periodo === 'mes') {
    const [a, m] = hoje.split('-').map(Number);
    const fim = new Date(Date.UTC(a, m - 1, 0));
    const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
    return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)];
  }
  const n = ui.periodo === '7' ? 7 : ui.periodo === '90' ? 90 : 28;
  return [addDias(hoje, -(n - 1)), hoje];
}

const num = (v) => (v == null ? '—' : String(v).replace('.', ','));
const pct = (v) => (v == null ? '—' : `${v}%`);
const dias = (v) => (v == null ? '—' : `${num(v)} d`);
const horas = (min) => {
  if (!min) return '0 h';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
};

/** Variação em relação ao período anterior: seta e valor, sem dizer se é bom ou ruim (depende do indicador). */
function tendencia(atual, anterior, unidade = '') {
  if (atual == null || anterior == null) return '<span class="prod-tend suave">sem base de comparação</span>';
  const d = Math.round((atual - anterior) * 10) / 10;
  if (d === 0) return '<span class="prod-tend suave">= período anterior</span>';
  return `<span class="prod-tend suave">${d > 0 ? '▲' : '▼'} ${d > 0 ? '+' : '−'}${num(Math.abs(d))}${unidade} vs período anterior</span>`;
}

const AJUDA = {
  entregas: 'Ações concluídas no período. "Pontos" pesam cada entrega pelo esforço estimado (pequeno 1, médio 2, grande 3; sem estimativa vale médio).',
  pontualidade: 'Ações concluídas até o prazo vigente ÷ ações concluídas no período. Entre parênteses, o mesmo contra o prazo original: a diferença mostra prazos que foram empurrados.',
  retrabalho: 'Ações concluídas no período que já foram devolvidas para ajuste na validação ÷ ações concluídas.',
  ciclo: 'Dias entre a chegada da ação à unidade (atribuição ou criação) e a conclusão. Mediana ao lado da média, que as ações muito longas puxam para cima.',
  dedicacao: 'Tempo que as pessoas registraram nas ações da unidade no período. É declarado por elas: serve para ver tendência, não para cobrar.',
  carga: 'Foto de hoje: ações em curso, atrasadas, paradas (7 dias ou mais sem movimento) e bloqueadas. Não depende do período.',
  bloqueios: 'Impedimentos registrados no período e quantos dias, em média, levaram para ser resolvidos.',
};

function indicador(rotulo, ajuda, valor, detalhe, trend = '') {
  return `<div class="prod-ind" title="${esc(ajuda)}"><div class="prod-rotulo">${esc(rotulo)}</div><div class="prod-valor">${valor}</div>
    ${detalhe ? `<div class="prod-detalhe suave">${detalhe}</div>` : ''}${trend}</div>`;
}

function indicadoresHTML(u) {
  const a = u.atual, p = u.anterior, c = u.carga;
  return `<div class="prod-grade">
    ${indicador('Entregas', AJUDA.entregas, a.concluidas, `${a.pontos} ponto${a.pontos === 1 ? '' : 's'} de esforço`, tendencia(a.concluidas, p.concluidas))}
    ${indicador('Pontualidade', AJUDA.pontualidade, pct(a.pontualidade), a.pontualidade_original != null && a.pontualidade_original !== a.pontualidade ? `${pct(a.pontualidade_original)} no prazo original` : (a.prazo_alterado ? `${a.prazo_alterado} com prazo alterado` : ''), tendencia(a.pontualidade, p.pontualidade, ' pp'))}
    ${indicador('Retrabalho', AJUDA.retrabalho, pct(a.retrabalho_pct), a.devolucoes ? `${a.devolucoes} devolução${a.devolucoes === 1 ? '' : 'ões'}` : '', tendencia(a.retrabalho_pct, p.retrabalho_pct, ' pp'))}
    ${indicador('Tempo de ciclo', AJUDA.ciclo, dias(a.ciclo_medio_dias), a.ciclo_mediano_dias != null ? `mediana ${dias(a.ciclo_mediano_dias)}${a.execucao_media_dias != null ? ` · execução ${dias(a.execucao_media_dias)}` : ''}` : '', tendencia(a.ciclo_medio_dias, p.ciclo_medio_dias, ' d'))}
    ${indicador('Dedicação registrada', AJUDA.dedicacao, horas(a.minutos), '', tendencia(Math.round(a.minutos / 6) / 10, Math.round(p.minutos / 6) / 10, ' h'))}
    ${indicador('Em aberto hoje', AJUDA.carga, c.abertas, `${c.atrasadas} atrasada${c.atrasadas === 1 ? '' : 's'} · ${c.paradas} parada${c.paradas === 1 ? '' : 's'} · ${c.bloqueadas} bloqueada${c.bloqueadas === 1 ? '' : 's'}`)}
  </div>
  ${a.bloqueios_registrados || a.bloqueios_resolvidos ? `<p class="suave pequeno" title="${esc(AJUDA.bloqueios)}">Bloqueios no período: ${a.bloqueios_registrados} registrado${a.bloqueios_registrados === 1 ? '' : 's'}, ${a.bloqueios_resolvidos} resolvido${a.bloqueios_resolvidos === 1 ? '' : 's'}${a.bloqueio_medio_dias != null ? ` (em média ${dias(a.bloqueio_medio_dias)})` : ''}.</p>` : ''}`;
}

function tabelaHTML(linhas, primeira) {
  return `<div class="tabela-rolagem"><table class="tabela-lista prod-tabela"><thead><tr><th>${esc(primeira)}</th><th>Entregas</th><th>Pontos</th><th>Pontualidade</th><th>Retrabalho</th><th>Dedicação</th><th>Em aberto</th><th>Atrasadas</th></tr></thead><tbody>
    ${linhas.map((l) => `<tr><td data-rotulo="${esc(primeira)}"><b>${esc(l.nome)}</b></td><td data-rotulo="Entregas" class="num">${l.atual.concluidas}</td><td data-rotulo="Pontos" class="num">${l.atual.pontos}</td>
      <td data-rotulo="Pontualidade" class="num">${pct(l.atual.pontualidade)}</td><td data-rotulo="Retrabalho" class="num">${pct(l.atual.retrabalho_pct)}</td>
      <td data-rotulo="Dedicação" class="num">${horas(l.atual.minutos)}</td><td data-rotulo="Em aberto" class="num">${l.carga.abertas}</td><td data-rotulo="Atrasadas" class="num">${l.carga.atrasadas}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function unidadeHTML(u) {
  const subs = (u.subunidades ?? []).map((s) => ({ ...s, nome: s.secao.sigla ? `${s.secao.nome} (${s.secao.sigla})` : s.secao.nome }));
  return `<section class="cartao prod-unidade" data-unidade="${u.secao.id}">
    <div class="linha entre"><h2>${esc(u.secao.nome)}${u.secao.sigla ? ` <span class="suave">· ${esc(u.secao.sigla)}</span>` : ''}</h2></div>
    ${indicadoresHTML(u)}
    ${u.ocultas ? `<p class="suave pequeno">${u.ocultas} ação${u.ocultas === 1 ? ' interna' : 'ões internas'} da unidade não entra${u.ocultas === 1 ? '' : 'm'} nestes números (só o chefe e o Administrador as veem).</p>` : ''}
    ${subs.length ? `<details class="prod-detalhes"><summary>Subseções (${subs.length})</summary>${tabelaHTML(subs, 'Subseção')}</details>` : ''}
    ${u.pessoas ? `<details class="prod-detalhes"><summary>Pessoas (${u.pessoas.length})</summary>${tabelaHTML(u.pessoas, 'Pessoa')}
      <p class="suave pequeno">Entregas e prazos são de quem responde pela ação; as horas, de quem as lançou. Use para conversar com a equipe, não para ranquear.</p></details>` : ''}
  </section>`;
}

export async function produtividade(raiz) {
  const pintar = async () => {
    const [de, ate] = intervalo();
    const area = raiz.querySelector('#prod-conteudo');
    area.innerHTML = '<p class="suave">Calculando…</p>';
    try {
      const r = await get(`/produtividade?de=${de}&ate=${ate}`);
      area.innerHTML = `<p class="suave pequeno">Período: ${br(r.periodo.de)} a ${br(r.periodo.ate)} (${r.periodo.dias} dias), comparado com ${br(r.anterior.de)} a ${br(r.anterior.ate)}.</p>
        ${r.unidades.length ? r.unidades.map(unidadeHTML).join('') : vazio('Nenhuma unidade para mostrar', 'Quando houver unidades ativas, os indicadores aparecem aqui.')}`;
    } catch (e) {
      area.innerHTML = `<div class="erro-form" role="alert">${esc(e.message)}</div>`;
    }
  };
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Produtividade</h1>
      <div class="sub">Indicadores das unidades, sempre comparados com o período anterior. Passe o mouse sobre um indicador para ver como ele é calculado.</div></div></div>
    <div class="cartao prod-filtros"><div class="linha" style="gap:12px;align-items:flex-end;flex-wrap:wrap">
      <div class="campo"><label for="prod-periodo">Período</label><select id="prod-periodo">${PERIODOS.map(([v, r]) => `<option value="${v}" ${ui.periodo === v ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="campo prod-datas" ${ui.periodo === 'custom' ? '' : 'hidden'}><label for="prod-de">De</label><input id="prod-de" type="date" max="${est.boot.hoje}" value="${ui.de || addDias(est.boot.hoje, -27)}"></div>
      <div class="campo prod-datas" ${ui.periodo === 'custom' ? '' : 'hidden'}><label for="prod-ate">Até</label><input id="prod-ate" type="date" max="${est.boot.hoje}" value="${ui.ate || est.boot.hoje}"></div>
    </div>
    <p class="suave pequeno" style="margin:8px 0 0">Mede <b>unidades</b>, não pessoas isoladas. Compare cada unidade com o próprio histórico: unidades de natureza diferente não são comparáveis entre si. Nenhum indicador sozinho diz se o trabalho vai bem; leia-os em conjunto.</p></div>
    <div id="prod-conteudo"></div>`;
  const sel = raiz.querySelector('#prod-periodo');
  sel.addEventListener('change', () => {
    ui.periodo = sel.value;
    raiz.querySelectorAll('.prod-datas').forEach((el) => { el.hidden = ui.periodo !== 'custom'; });
    if (ui.periodo !== 'custom') pintar();
  });
  for (const id of ['prod-de', 'prod-ate']) {
    raiz.querySelector(`#${id}`).addEventListener('change', () => {
      ui.de = raiz.querySelector('#prod-de').value; ui.ate = raiz.querySelector('#prod-ate').value;
      if (ui.de && ui.ate && ui.de <= ui.ate) pintar();
    });
  }
  await pintar();
}
