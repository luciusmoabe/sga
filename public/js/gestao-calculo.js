// Cálculo puro (sem DOM nem rede) da tela "Painel de gestão" do chefe. Entra a lista de ações que o chefe enxerga (`GET /api/acoes`)
// e, opcionalmente, as pessoas de `GET /api/produtividade` (entregas e horas do período); sai tudo o que a tela desenha.
// Só mede o que o sistema já registra e nunca muda semáforo nem status. Os limites abaixo são SUGESTÕES de gestão, não regra de
// negócio: ajuste com o Diretor se a realidade da seção pedir.
import { dataNoFuso, diasEntre, instante, somarDias } from './datas.js';

export const LIMITES = {
  emAndamentoPorPessoa: 3, // mais que isso ao mesmo tempo: o trabalho se espalha e nada fecha
  abertasPorPessoa: 6,     // mais que isso em aberto: carga alta
  semanas: 8,              // janela do gráfico de entregas
  reconhecer: 3,           // entregas no período, sem atraso, para sugerir um reconhecimento
};

const emCurso = (a) => a.status !== 'concluida' && !a.encerrada && !a.arquivada;
const diaDe = (ts) => (ts ? dataNoFuso(instante(ts)) : null);
const porPrazo = (x, y) => x.prazo.localeCompare(y.prazo) || x.id - y.id;
const resumo = (a, hoje) => ({ id: a.id, titulo: a.titulo, prazo: a.prazo, dias: diasEntre(a.prazo, hoje), secao: a.secao_sigla || '' });

/** Faixas de prazo das ações em curso, em relação a hoje. */
export function horizonte(abertas, hoje) {
  const f = { vencidas: 0, ate2: 0, de3a7: 0, de8a14: 0, depois: 0 };
  for (const a of abertas) {
    const d = diasEntre(hoje, a.prazo);
    if (d < 0) f.vencidas += 1; else if (d <= 2) f.ate2 += 1; else if (d <= 7) f.de3a7 += 1; else if (d <= 14) f.de8a14 += 1; else f.depois += 1;
  }
  return f;
}

/** Entregas por janela de 7 dias terminando hoje (a mais recente por último). */
export function entregasPorSemana(acoes, hoje, n = LIMITES.semanas) {
  const conc = acoes.filter((a) => a.status === 'concluida' && a.concluida_em).map((a) => ({ dia: diaDe(a.concluida_em), prazo: a.prazo }));
  return Array.from({ length: n }, (_, k) => {
    const ate = somarDias(hoje, -7 * (n - 1 - k));
    const de = somarDias(ate, -6);
    const dela = conc.filter((c) => c.dia >= de && c.dia <= ate);
    return { de, ate, entregas: dela.length, noPrazo: dela.filter((c) => c.dia <= c.prazo).length };
  });
}

function pessoasDe(acoes, abertas, hoje, doPeriodo) {
  const mapa = new Map();
  const get = (id, nome) => {
    if (!mapa.has(id)) mapa.set(id, { id, nome: id == null ? 'Sem responsável atribuído' : (nome || 'Conta removida'), abertas: 0, aFazer: 0, emAndamento: 0, bloqueadas: 0, atrasadas: 0, paradas: 0, entregas: 0, minutos: 0, pontos: 0 });
    return mapa.get(id);
  };
  for (const a of abertas) {
    const p = get(a.responsavel_id ?? null, a.responsavel_nome);
    p.abertas += 1;
    if (a.status === 'a_fazer') p.aFazer += 1;
    if (a.status === 'em_andamento') p.emAndamento += 1;
    if (a.status === 'bloqueada') p.bloqueadas += 1;
    if (a.prazo < hoje) p.atrasadas += 1;
    if (a.parada) p.paradas += 1;
  }
  for (const d of doPeriodo) {
    if (d.id == null) continue;
    const p = get(d.id, d.nome);
    p.entregas = d.atual?.concluidas ?? 0; p.minutos = d.atual?.minutos ?? 0; p.pontos = d.atual?.pontos ?? 0;
  }
  const lista = [...mapa.values()].map((p) => ({
    ...p,
    sinais: [
      ...(p.atrasadas ? ['atrasada'] : []),
      ...(p.paradas ? ['parada'] : []),
      ...(p.emAndamento > LIMITES.emAndamentoPorPessoa || p.abertas > LIMITES.abertasPorPessoa ? ['sobrecarga'] : []),
    ],
  }));
  // Quem tem mais a resolver primeiro; "sem responsável" por último.
  return lista.sort((x, y) => Number(x.id == null) - Number(y.id == null) || y.atrasadas - x.atrasadas || y.abertas - x.abertas || x.nome.localeCompare(y.nome));
}

/** Pontos de conversa para a reunião de equipe e para os 1:1: apoiar, alinhar e reconhecer (nunca cobrar). */
export function conversas(pessoas) {
  const lista = [];
  for (const p of pessoas.filter((x) => x.id != null)) {
    if (p.atrasadas || p.paradas >= 2) lista.push({ tipo: 'apoiar', nome: p.nome, texto: `${plural(p.atrasadas, 'atrasada')}${p.paradas ? `, ${plural(p.paradas, 'parada', 'paradas')}` : ''}. Pergunte o que está travando e o que você pode tirar do caminho.` });
    if (p.emAndamento > LIMITES.emAndamentoPorPessoa) lista.push({ tipo: 'alinhar', nome: p.nome, texto: `${p.emAndamento} ações em andamento ao mesmo tempo. Combinem o que vem primeiro e o que espera.` });
    else if (p.emAndamento === 0 && p.aFazer > 0) lista.push({ tipo: 'alinhar', nome: p.nome, texto: `Nada em andamento e ${p.aFazer} a fazer. Ajude a escolher a próxima ação e a destravar o início.` });
    if (p.entregas >= LIMITES.reconhecer && !p.atrasadas) lista.push({ tipo: 'reconhecer', nome: p.nome, texto: `${p.entregas} entregas no período, sem atraso. Vale reconhecer na reunião.` });
  }
  const ordem = { apoiar: 0, alinhar: 1, reconhecer: 2 };
  return lista.sort((x, y) => ordem[x.tipo] - ordem[y.tipo]);
}
const plural = (n, um, varios = `${um}s`) => `${n} ${n === 1 ? um : varios}`;

/**
 * @param {{acoes: object[], hoje: string, pessoasDoPeriodo?: object[], atualizacaoPendente?: boolean}} entrada
 */
export function calcularGestao({ acoes, hoje, pessoasDoPeriodo = [], atualizacaoPendente = false }) {
  const abertas = acoes.filter(emCurso);
  const atrasadas = abertas.filter((a) => a.prazo < hoje).sort(porPrazo);
  const criticas = abertas.filter((a) => a.impedimento_critico);
  const vencem7 = abertas.filter((a) => a.prazo >= hoje && diasEntre(hoje, a.prazo) <= 7).sort(porPrazo);
  const vencem2 = vencem7.filter((a) => diasEntre(hoje, a.prazo) <= 2);
  const validar = abertas.concat(acoes.filter((a) => a.status === 'concluida' && !a.encerrada && !a.arquivada)).filter((a) => a.aguardando_validacao === 'chefe');
  const paradas = abertas.filter((a) => a.parada && a.prazo >= hoje);
  const bloqueadas = abertas.filter((a) => a.status === 'bloqueada');
  const pedidos = abertas.filter((a) => a.pedido_pendente);
  const usaResponsavel = abertas.some((a) => a.responsavel_id != null);
  const semResp = usaResponsavel ? abertas.filter((a) => a.responsavel_id == null) : [];
  const semanas = entregasPorSemana(acoes, hoje);
  const ult = semanas.at(-1), pen = semanas.at(-2);

  const radar = [
    criticas.length && { chave: 'critico', nivel: 'critico', n: criticas.length, acoes: criticas.slice(0, 3).map((a) => resumo(a, hoje)) },
    atrasadas.length && { chave: 'atrasadas', nivel: 'critico', n: atrasadas.length, acoes: atrasadas.slice(0, 3).map((a) => resumo(a, hoje)) },
    validar.length && { chave: 'validar', nivel: 'atencao', n: validar.length, acoes: validar.slice(0, 3).map((a) => resumo(a, hoje)) },
    atualizacaoPendente && { chave: 'atualizacao', nivel: 'atencao', n: 1, acoes: [] },
    vencem7.length && { chave: 'vencem', nivel: 'atencao', n: vencem7.length, acoes: vencem7.slice(0, 3).map((a) => resumo(a, hoje)) },
    paradas.length && { chave: 'paradas', nivel: 'atencao', n: paradas.length, acoes: paradas.slice(0, 3).map((a) => resumo(a, hoje)) },
    semResp.length && { chave: 'sem-responsavel', nivel: 'info', n: semResp.length, acoes: semResp.slice(0, 3).map((a) => resumo(a, hoje)) },
    pedidos.length && { chave: 'pedidos', nivel: 'info', n: pedidos.length, acoes: pedidos.slice(0, 3).map((a) => resumo(a, hoje)) },
  ].filter(Boolean);

  const cor = atrasadas.length || criticas.length ? 'vermelho' : atualizacaoPendente || vencem2.length ? 'amarelo' : 'verde';
  const pessoas = pessoasDe(acoes, abertas, hoje, pessoasDoPeriodo);

  // Subseções (e a própria seção) quando as ações vêm de mais de uma.
  const porSecao = new Map();
  for (const a of abertas) {
    const k = a.secao_id;
    if (!porSecao.has(k)) porSecao.set(k, { id: k, nome: a.secao_sigla || a.secao_nome, abertas: 0, atrasadas: 0, paradas: 0, bloqueadas: 0 });
    const s = porSecao.get(k);
    s.abertas += 1; if (a.prazo < hoje) s.atrasadas += 1; if (a.parada) s.paradas += 1; if (a.status === 'bloqueada') s.bloqueadas += 1;
  }

  return {
    cor, radar,
    kpis: { emCurso: abertas.length, atrasadas: atrasadas.length, vencem7: vencem7.length, validar: validar.length, bloqueadas: bloqueadas.length, entregasSemana: ult.entregas, entregasSemanaAnterior: pen.entregas },
    fluxo: { a_fazer: abertas.filter((a) => a.status === 'a_fazer').length, em_andamento: abertas.filter((a) => a.status === 'em_andamento').length, bloqueada: bloqueadas.length },
    horizonte: horizonte(abertas, hoje),
    semanas, pessoas, conversas: conversas(pessoas),
    secoes: porSecao.size > 1 ? [...porSecao.values()].sort((x, y) => y.atrasadas - x.atrasadas || y.abertas - x.abertas) : [],
  };
}
