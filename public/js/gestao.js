// Painel de gestão do chefe, para liderar a equipe da semana. Responde, nesta ordem, a cinco perguntas:
//   1. O que precisa de mim hoje? (radar)   2. Como está o fluxo e o horizonte de prazos?   3. Estamos entregando? (8 semanas)
//   4. Como está a carga de cada pessoa?    5. Que conversas valem a pena? (apoiar, alinhar, reconhecer)
// Só lê (`GET /api/acoes`, `GET /api/produtividade`); nada aqui grava dados nem muda o semáforo. O cálculo está em
// `gestao-calculo.js` (puro, com teste).
import { get } from './api.js';
import { est } from './estado.js';
import { addDias, br, brCurto, esc, fmtMin, plural, sem, vazio } from './ui.js';
import { doTopo } from './vocab.js';
import { LIMITES, calcularGestao } from './gestao-calculo.js';

const PERIODO_DIAS = 28;
const ROTULO_SINAL = { atrasada: 'Atrasada', parada: 'Parada', sobrecarga: 'Carga alta' };

function textoRadar(r) {
  const n = r.n;
  switch (r.chave) {
    case 'critico': return [plural(n, 'ação com impedimento crítico aberto', 'ações com impedimento crítico aberto'), 'Deixa a seção em vermelho. Descubra o que destrava e quem pode ajudar; se precisar de apoio de fora, registre no impedimento.'];
    case 'atrasadas': return [plural(n, 'ação atrasada', 'ações atrasadas'), 'Combine com quem executa o que impede a entrega e a nova data. Em ação criada por outra pessoa, o prazo muda por pedido.'];
    case 'validar': return [`${plural(n, 'ação aguarda', 'ações aguardam')} a sua validação`, 'Quem concluiu espera o seu retorno: valide ou devolva com o motivo.'];
    case 'atualizacao': return ['A atualização semanal ainda não foi enviada', 'O relato é montado pelo sistema; confira e envie até o fechamento.'];
    case 'vencem': return [`${plural(n, 'ação vence', 'ações vencem')} em até 7 dias`, 'Confirme que cada uma tem responsável e já começou.'];
    case 'paradas': return [`${plural(n, 'ação parada', 'ações paradas')} (7 dias ou mais sem movimento)`, 'Pergunte se continua valendo. Registrar o andamento mantém a equipe e quem acompanha informados.'];
    case 'sem-responsavel': return [`${plural(n, 'ação em curso sem', 'ações em curso sem')} responsável`, 'Atribua para que cada ação tenha um dono.'];
    case 'pedidos': return [`${plural(n, 'ação com pedido', 'ações com pedido')} de novo prazo em análise`, `Aguardam a decisão ${doTopo()}; nada a fazer agora além de acompanhar.`];
    default: return [r.chave, ''];
  }
}
const NIVEL = { critico: ['●', 'Crítico'], atencao: ['▲', 'Atenção'], info: ['ℹ', 'Informação'] };
const DESTINO = { atualizacao: '#/atualizacao', validar: '#/minhas-acoes' };

/** O radar de "O que precisa de você hoje". `max` limita os itens (o resumo da tela Hoje mostra os mais graves; o Painel de gestão, todos). */
export function radarHTML(g, max = Infinity) {
  if (!g.radar.length) return `<div class="gestao-ok"><b>✓ Nada urgente.</b> Sem atrasos, impedimentos críticos nem validações pendentes. Bom momento para olhar o que vence adiante e reconhecer a equipe.</div>`;
  return `<ol class="gestao-radar">${g.radar.slice(0, max).map((r) => {
    const [titulo, dica] = textoRadar(r);
    const [forma, nome] = NIVEL[r.nivel];
    return `<li class="gestao-risco n-${r.nivel}"><div class="gestao-risco-cab"><span class="gestao-nivel" title="${nome}"><span aria-hidden="true">${forma}</span> ${nome}</span>
      <b>${titulo}</b>${DESTINO[r.chave] ? `<a class="btn btn-sec btn-mini" href="${DESTINO[r.chave]}">Abrir</a>` : ''}</div>
      <p class="suave pequeno">${esc(dica)}</p>
      ${r.acoes.length ? `<ul>${r.acoes.map((a) => `<li><a href="#/acao/${a.id}">${esc(a.titulo)}</a> <span class="suave">${a.secao ? `${esc(a.secao)} · ` : ''}${a.dias > 0 ? `${a.dias} d de atraso` : a.dias === 0 ? 'vence hoje' : `vence em ${br(a.prazo)}`}</span></li>`).join('')}${r.n > r.acoes.length ? `<li class="suave">e mais ${r.n - r.acoes.length}</li>` : ''}</ul>` : ''}</li>`;
  }).join('')}</ol>`;
}

function kpi(rotulo, valor, detalhe = '', alerta = false) {
  return `<div class="prod-ind${alerta ? ' gestao-alerta' : ''}"><div class="prod-rotulo">${esc(rotulo)}</div><div class="prod-valor">${valor}</div>${detalhe ? `<div class="prod-detalhe suave">${detalhe}</div>` : ''}</div>`;
}

/** Barra horizontal com o número ao lado: o valor sempre aparece em texto, a barra só reforça. */
const barra = (rotulo, n, max, cls = '', extra = '') => `<li class="gestao-barra ${cls}"><span class="gestao-barra-rotulo">${esc(rotulo)}</span>
  <span class="gestao-trilho" aria-hidden="true"><i style="width:${max ? Math.max(n ? 4 : 0, Math.round((n / max) * 100)) : 0}%"></i></span><b class="num">${n}</b>${extra ? `<span class="suave pequeno">${extra}</span>` : ''}</li>`;

function fluxoHTML(g) {
  const f = g.fluxo, total = f.a_fazer + f.em_andamento + f.bloqueada;
  if (!total) return '<p class="suave">Nenhuma ação em curso.</p>';
  const seg = (n, cls) => (n ? `<i class="${cls}" style="flex:${n}"></i>` : '');
  return `<div class="gestao-pilha" aria-hidden="true">${seg(f.a_fazer, 'afazer')}${seg(f.em_andamento, 'andando')}${seg(f.bloqueada, 'bloq')}</div>
    <ul class="gestao-legenda"><li><span class="afazer" aria-hidden="true"></span>A fazer <b class="num">${f.a_fazer}</b></li><li><span class="andando" aria-hidden="true"></span>Em andamento <b class="num">${f.em_andamento}</b></li><li><span class="bloq" aria-hidden="true"></span>Bloqueadas <b class="num">${f.bloqueada}</b></li></ul>
    <p class="suave pequeno">${f.em_andamento > f.a_fazer + f.bloqueada && total > 4 ? 'Muita coisa começada: priorize terminar antes de abrir novas frentes.' : f.em_andamento === 0 ? 'Nada em andamento: o trabalho está parado esperando alguém começar.' : 'Fluxo equilibrado entre o que está começado e o que espera.'}</p>`;
}

function horizonteHTML(g) {
  const h = g.horizonte, max = Math.max(1, ...Object.values(h));
  return `<ul class="gestao-barras">${barra('Vencidas', h.vencidas, max, 'ruim')}${barra('Até 2 dias', h.ate2, max, 'atencao')}${barra('3 a 7 dias', h.de3a7, max)}${barra('8 a 14 dias', h.de8a14, max)}${barra('Depois', h.depois, max, 'suave')}</ul>`;
}

function semanasHTML(g) {
  const max = Math.max(1, ...g.semanas.map((s) => s.entregas));
  const total = g.semanas.reduce((s, x) => s + x.entregas, 0);
  const media = Math.round((total / g.semanas.length) * 10) / 10;
  const ult = g.kpis.entregasSemana, pen = g.kpis.entregasSemanaAnterior;
  return `<ul class="gestao-barras">${g.semanas.map((s, i) => barra(`até ${brCurto(s.ate)}${i === g.semanas.length - 1 ? ' (hoje)' : ''}`, s.entregas, max, '', s.entregas ? `${s.noPrazo} no prazo` : '')).join('')}</ul>
    <p class="suave pequeno">Média de ${String(media).replace('.', ',')} entrega${media === 1 ? '' : 's'} por semana nas últimas ${g.semanas.length}. ${ult > pen ? 'A semana mais recente superou a anterior.' : ult < pen ? 'A semana mais recente ficou abaixo da anterior: veja se o que travou é pontual ou recorrente.' : 'Mesmo ritmo da semana anterior.'}</p>`;
}

function equipeHTML(g) {
  if (!g.pessoas.length) return vazio('Nenhuma pessoa com ações em curso', 'Quando houver ações atribuídas, a carga de cada pessoa aparece aqui.');
  return `<div class="tabela-rolagem"><table class="tabela-lista"><thead><tr><th>Pessoa</th><th>Em aberto</th><th>Em andamento</th><th>Atrasadas</th><th>Paradas</th><th>Entregas (${PERIODO_DIAS} d)</th><th>Horas (${PERIODO_DIAS} d)</th><th>Sinais</th></tr></thead><tbody>
    ${g.pessoas.map((p) => `<tr><td data-rotulo="Pessoa"><b>${esc(p.nome)}</b></td><td data-rotulo="Em aberto" class="num">${p.abertas}</td><td data-rotulo="Em andamento" class="num">${p.emAndamento}</td>
      <td data-rotulo="Atrasadas" class="num">${p.atrasadas || '—'}</td><td data-rotulo="Paradas" class="num">${p.paradas || '—'}</td>
      <td data-rotulo="Entregas" class="num">${p.id == null ? '—' : p.entregas}</td><td data-rotulo="Horas" class="num">${p.id == null ? '—' : fmtMin(p.minutos)}</td>
      <td data-rotulo="Sinais">${p.sinais.length ? p.sinais.map((s) => `<span class="pilula">${ROTULO_SINAL[s]}</span>`).join(' ') : '<span class="suave">—</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="suave pequeno">Carga alta = mais de ${LIMITES.emAndamentoPorPessoa} ações em andamento ou mais de ${LIMITES.abertasPorPessoa} em aberto (sugestão de gestão). Entregas e horas vêm do período de ${PERIODO_DIAS} dias; as horas são de quem lançou. Serve para conversar com a equipe, não para ranquear.</p>`;
}

const TIPO_CONVERSA = { apoiar: ['Apoiar', 'apoiar'], alinhar: ['Alinhar', 'alinhar'], reconhecer: ['Reconhecer', 'reconhecer'] };
function conversasHTML(g) {
  if (!g.conversas.length) return '<p class="suave">Sem pontos de atenção individuais agora. Aproveite para perguntar a cada pessoa o que a ajudaria a entregar melhor.</p>';
  return `<ul class="gestao-conversas">${g.conversas.map((c) => `<li class="c-${c.tipo}"><span class="pilula">${TIPO_CONVERSA[c.tipo][0]}</span> <b>${esc(c.nome)}</b> <span>${esc(c.texto)}</span></li>`).join('')}</ul>`;
}

function secoesHTML(g) {
  if (!g.secoes.length) return '';
  return `<section class="cartao" aria-labelledby="gestao-secoes-t"><h2 id="gestao-secoes-t">Por seção</h2>
    <div class="tabela-rolagem"><table class="tabela-lista"><thead><tr><th>Seção</th><th>Em aberto</th><th>Atrasadas</th><th>Paradas</th><th>Bloqueadas</th></tr></thead><tbody>
    ${g.secoes.map((s) => `<tr><td data-rotulo="Seção"><b>${esc(s.nome)}</b></td><td data-rotulo="Em aberto" class="num">${s.abertas}</td><td data-rotulo="Atrasadas" class="num">${s.atrasadas || '—'}</td><td data-rotulo="Paradas" class="num">${s.paradas || '—'}</td><td data-rotulo="Bloqueadas" class="num">${s.bloqueadas || '—'}</td></tr>`).join('')}</tbody></table></div></section>`;
}

export async function gestao(raiz) {
  const hoje = est.boot.hoje;
  const secaoId = est.boot.secao?.id;
  const [acoes, prod] = await Promise.all([
    get('/acoes'),
    get(`/produtividade?de=${addDias(hoje, -(PERIODO_DIAS - 1))}&ate=${hoje}${secaoId ? `&secao=${secaoId}` : ''}`).catch(() => null), // sem isto o painel ainda funciona, só sem entregas e horas
  ]);
  const g = calcularGestao({ acoes, hoje, pessoasDoPeriodo: prod?.unidades?.[0]?.pessoas ?? [], atualizacaoPendente: est.boot.atualizacao_enviada === false });
  const k = g.kpis;
  const motivo = g.radar[0] ? textoRadar(g.radar[0])[0] : 'Sem pendências';
  raiz.innerHTML = `
    <div class="cabeca"><div><h1>Painel de gestão</h1>
      <div class="sub">Para conduzir a equipe da semana: o que precisa de você, como anda o fluxo, se estamos entregando e quem precisa de apoio.</div></div>
      <div class="gestao-situacao"><span class="suave pequeno">Situação</span> ${sem(g.cor)}<span class="suave pequeno">${motivo}</span></div></div>
    <div class="prod-grade" id="gestao-kpis">
      ${kpi('Em curso', k.emCurso)}
      ${kpi('Atrasadas', k.atrasadas, '', k.atrasadas > 0)}
      ${kpi('Vencem em 7 dias', k.vencem7)}
      ${kpi('Aguardam você', k.validar, 'para validar', k.validar > 0)}
      ${kpi('Bloqueadas', k.bloqueadas, '', k.bloqueadas > 0)}
      ${kpi('Entregas (7 dias)', k.entregasSemana, `${k.entregasSemanaAnterior} na semana anterior`)}
    </div>
    <div class="gestao-duas">
      <section class="cartao" id="gestao-radar" aria-labelledby="gestao-radar-t"><h2 id="gestao-radar-t">O que precisa de você hoje</h2>${radarHTML(g)}</section>
      <div class="gestao-coluna">
        <section class="cartao" id="gestao-fluxo" aria-labelledby="gestao-fluxo-t"><h2 id="gestao-fluxo-t">Fluxo de trabalho</h2>${fluxoHTML(g)}</section>
        <section class="cartao" id="gestao-horizonte" aria-labelledby="gestao-hor-t"><h2 id="gestao-hor-t">Prazos das ações em curso</h2>${horizonteHTML(g)}</section>
      </div>
    </div>
    <section class="cartao" id="gestao-semanas" aria-labelledby="gestao-sem-t"><h2 id="gestao-sem-t">Entregas por semana</h2>${semanasHTML(g)}</section>
    <section class="cartao" id="gestao-equipe" aria-labelledby="gestao-eq-t"><h2 id="gestao-eq-t">Carga da equipe</h2>${equipeHTML(g)}</section>
    <section class="cartao" id="gestao-conversas" aria-labelledby="gestao-cv-t"><h2 id="gestao-cv-t">Conversas que valem a pena</h2>
      <p class="suave pequeno">Sugestões geradas pelos números: para a reunião da equipe e os 1:1. Apoiar primeiro, alinhar depois, reconhecer sempre.</p>${conversasHTML(g)}</section>
    ${secoesHTML(g)}`;
}
