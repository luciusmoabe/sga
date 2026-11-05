// Indicadores de produtividade das UNIDADES (não das pessoas isoladas): entregas, pontualidade, carga, retrabalho, tempo de ciclo
// e dedicação registrada. Só soma as ações que quem consulta pode ver (as internas de subseções ficam fora para o Diretor e o
// Apoio, que só recebem a contagem do que ficou de fora). Os números por pessoa só saem para o chefe da unidade e para os
// dirigentes acima dele. Ver MULTIEMPRESA.md e CLAUDE.md.
import { addDays, DIAS_SEM_MOVIMENTO, ESFORCO_PADRAO, PESO_ESFORCO, TIPOS_DE_ACOMPANHAMENTO } from './logic.js';
import { dataNoFuso, instante } from '../public/js/datas.js';
import { empresaAtual } from './empresa.js';
import { marks } from './helpers.js';

export const DIAS_MAX_PERIODO = 366;

const dia = (ts) => (ts ? dataNoFuso(instante(ts)) : null);
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const arred = (n, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas;
const media = (v) => (v.length ? arred(v.reduce((s, x) => s + x, 0) / v.length) : null);
const mediana = (v) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return arred(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2);
};
const pct = (parte, total) => (total ? Math.round((parte / total) * 100) : null);

/** Indicadores do período: entregas (concluídas no período), dedicação e bloqueios. `concluidas` traz `concluida_dia`. */
export function indicadoresDoPeriodo({ concluidas = [], minutos = 0, bloqueios = [] }) {
  const n = concluidas.length;
  const noPrazo = concluidas.filter((a) => a.concluida_dia <= a.prazo).length;
  const noPrazoOriginal = concluidas.filter((a) => a.concluida_dia <= a.prazo_original).length;
  const alterados = concluidas.filter((a) => a.prazo !== a.prazo_original).length;
  const comRetrabalho = concluidas.filter((a) => a.devolucoes > 0).length;
  const ciclos = concluidas.map((a) => Math.max(0, diasEntre(a.inicio_dia, a.concluida_dia)));
  const execucoes = concluidas.filter((a) => a.iniciada_dia).map((a) => Math.max(0, diasEntre(a.iniciada_dia, a.concluida_dia)));
  const resolvidos = bloqueios.filter((b) => b.resolvido_dia).map((b) => Math.max(0, diasEntre(b.criado_dia, b.resolvido_dia)));
  return {
    concluidas: n,
    pontos: concluidas.reduce((s, a) => s + PESO_ESFORCO[a.esforco ?? ESFORCO_PADRAO], 0),
    no_prazo: noPrazo,
    pontualidade: pct(noPrazo, n),
    pontualidade_original: pct(noPrazoOriginal, n),
    prazo_alterado: alterados,
    prazo_alterado_pct: pct(alterados, n),
    com_retrabalho: comRetrabalho,
    retrabalho_pct: pct(comRetrabalho, n),
    devolucoes: concluidas.reduce((s, a) => s + a.devolucoes, 0),
    ciclo_medio_dias: media(ciclos),
    ciclo_mediano_dias: mediana(ciclos),
    execucao_media_dias: media(execucoes),
    minutos,
    bloqueios_registrados: bloqueios.filter((b) => b.no_periodo).length,
    bloqueios_resolvidos: resolvidos.length,
    bloqueio_medio_dias: media(resolvidos),
  };
}

/** Carga de agora (não depende do período): o que está em curso, atrasado, parado ou bloqueado. */
export function cargaAtual(abertas, hoje) {
  const limiteParada = addDays(hoje, -(DIAS_SEM_MOVIMENTO - 1));
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((a) => a.prazo < hoje).length,
    paradas: abertas.filter((a) => (a.movimentada_dia ?? a.criada_dia) < limiteParada).length,
    bloqueadas: abertas.filter((a) => a.status === 'bloqueada').length,
  };
}

/** Período anterior de mesma duração, logo antes de `de`. */
export function periodoAnterior(de, ate) {
  const dias = diasEntre(de, ate) + 1;
  return { de: addDays(de, -dias), ate: addDays(de, -1), dias };
}

/** Quem pode ver os números das pessoas: o Diretor, o Administrador e o chefe da unidade (ou dos que ficam acima dela). */
export const veNumerosIndividuais = (user) => ['diretor', 'administrador', 'chefe'].includes(user.perfil);

/**
 * Monta a resposta para `user`. `unidadesIds` já vem filtrado pela permissão de quem consulta; `visiveis` é o escopo de
 * ações (`visiveisAcoes`). Todas as consultas ficam na empresa em curso.
 */
const TODOS = Symbol('todos');

export async function calcularProdutividade(db, { visiveis, de, ate, hoje, unidades }) {
  const emp = empresaAtual();
  const anterior = periodoAnterior(de, ate);
  const todosIds = [...new Set(unidades.flatMap((u) => [...u.ids, ...u.subunidades.flatMap((s) => [...s.ids])]))];
  if (!todosIds.length) return { anterior, unidades: [] };
  const desde = anterior.de;
  const [concl, abertas, tempo, imped, usuarios, total] = await Promise.all([
    db.prepare(`select a.id, a.secao_id, a.responsavel_id, a.prazo, a.prazo_original, a.concluida_em, a.devolucoes, a.esforco, a.iniciada_em,
        a.atribuida_em, a.recebida_em, a.criada_em
      from acoes a where ${visiveis.where} and a.status = 'concluida' and a.concluida_em is not null
        and substr(a.concluida_em, 1, 10) >= ? and substr(a.concluida_em, 1, 10) <= ? and a.secao_id in (${marks(todosIds)})`)
      .all(...visiveis.params, addDays(desde, -1), addDays(ate, 1), ...todosIds),
    db.prepare(`select a.id, a.secao_id, a.responsavel_id, a.prazo, a.status, a.movimentada_em, a.criada_em
      from acoes a where ${visiveis.where} and a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0 and a.secao_id in (${marks(todosIds)})`)
      .all(...visiveis.params, ...todosIds),
    db.prepare(`select t.usuario_id, a.secao_id, t.minutos, t.data from tempo t join acoes a on a.id = t.acao_id
      where ${visiveis.where} and t.data >= ? and t.data <= ? and a.secao_id in (${marks(todosIds)})`)
      .all(...visiveis.params, desde, ate, ...todosIds),
    db.prepare(`select i.criado_em, i.resolvido_em, a.secao_id from impedimentos i join acoes a on a.id = i.acao_id
      where ${visiveis.where} and a.secao_id in (${marks(todosIds)})
        and ((substr(i.criado_em, 1, 10) >= ? and substr(i.criado_em, 1, 10) <= ?) or (substr(i.resolvido_em, 1, 10) >= ? and substr(i.resolvido_em, 1, 10) <= ?))`)
      .all(...visiveis.params, ...todosIds, addDays(desde, -1), addDays(ate, 1), addDays(desde, -1), addDays(ate, 1)),
    db.prepare('select id, nome from usuarios where empresa_id = ?').all(emp),
    // Tudo o que existe nas unidades, com ou sem permissão para ver: a diferença é o que ficou de fora (ações internas).
    db.prepare(`select a.secao_id, count(*) n from acoes a where a.empresa_id = ? and a.secao_id in (${marks(todosIds)})
      and ((a.status = 'concluida' and substr(a.concluida_em, 1, 10) >= ? and substr(a.concluida_em, 1, 10) <= ?)
        or (a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0)) group by a.secao_id`)
      .all(emp, ...todosIds, addDays(desde, -1), addDays(ate, 1)),
  ]);

  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const conclLinhas = concl.map((a) => ({
    ...a, concluida_dia: dia(a.concluida_em), inicio_dia: dia(a.atribuida_em ?? a.recebida_em ?? a.criada_em), iniciada_dia: dia(a.iniciada_em),
  }));
  const abertasLinhas = abertas.map((a) => ({ ...a, movimentada_dia: dia(a.movimentada_em), criada_dia: dia(a.criada_em) }));
  const bloqueiosLinhas = imped.map((i) => ({ secao_id: i.secao_id, criado_dia: dia(i.criado_em), resolvido_dia: dia(i.resolvido_em) }));
  const entre = (d, p) => d != null && d >= p.de && d <= p.ate;
  const atual = { de, ate };

  // `pessoa`: TODOS (a unidade inteira), um id (quem responde pela ação ou lançou o tempo) ou null (ação sem responsável).
  const indicadoresDe = (ids, pessoa = TODOS) => {
    const doResponsavel = (r) => ids.has(r.secao_id) && (pessoa === TODOS || r.responsavel_id === pessoa);
    const doLancamento = (t) => ids.has(t.secao_id) && (pessoa === TODOS || t.usuario_id === pessoa);
    const doPeriodo = (p) => indicadoresDoPeriodo({
      concluidas: conclLinhas.filter((a) => doResponsavel(a) && entre(a.concluida_dia, p)),
      minutos: tempo.filter((t) => doLancamento(t) && entre(t.data, p)).reduce((s, t) => s + Number(t.minutos), 0),
      bloqueios: pessoa === TODOS
        ? bloqueiosLinhas.filter((b) => ids.has(b.secao_id) && (entre(b.criado_dia, p) || entre(b.resolvido_dia, p))).map((b) => ({ ...b, no_periodo: entre(b.criado_dia, p) }))
        : [],
    });
    return {
      atual: doPeriodo(atual),
      anterior: doPeriodo(anterior),
      carga: cargaAtual(abertasLinhas.filter(doResponsavel), hoje),
    };
  };

  const pessoasDe = (ids) => {
    const donos = new Set();
    for (const a of conclLinhas) if (ids.has(a.secao_id) && (entre(a.concluida_dia, atual) || entre(a.concluida_dia, anterior))) donos.add(a.responsavel_id ?? null);
    for (const a of abertasLinhas) if (ids.has(a.secao_id)) donos.add(a.responsavel_id ?? null);
    const lista = [];
    for (const id of donos) {
      // Horas são de quem lançou; as demais medidas, de quem responde pela ação.
      const base = indicadoresDe(ids, id);
      lista.push({ id, nome: id == null ? 'Sem responsável atribuído' : (nomes.get(id) ?? 'Conta removida'), ...base });
    }
    return lista.sort((a, b) => b.atual.pontos - a.atual.pontos || (a.nome > b.nome ? 1 : -1));
  };

  const ocultasDe = (ids, visiveisN) => Math.max(0, total.filter((t) => ids.has(t.secao_id)).reduce((s, t) => s + Number(t.n), 0) - visiveisN);
  const visiveisN = (ids) => conclLinhas.filter((a) => ids.has(a.secao_id)).length + abertasLinhas.filter((a) => ids.has(a.secao_id)).length;

  return {
    anterior,
    unidades: unidades.map((u) => ({
      secao: u.secao,
      ...indicadoresDe(u.ids),
      ocultas: ocultasDe(u.ids, visiveisN(u.ids)),
      pessoas: u.verPessoas ? pessoasDe(u.ids) : null,
      subunidades: u.subunidades.map((s) => ({ secao: s.secao, ...indicadoresDe(s.ids), pessoas: u.verPessoas ? pessoasDe(s.ids) : null })),
    })),
  };
}

/** Unidades que `user` pode consultar, com os ids que cada uma soma (ela e as subseções abaixo). */
export async function unidadesDoUsuario(db, user, secaoPedida = null) {
  const todas = await db.prepare('select id, nome, sigla, tipo, pai_id, ativa from secoes where empresa_id = ?').all(empresaAtual());
  const porId = new Map(todas.map((s) => [s.id, s]));
  const filhosSub = new Map();
  for (const s of todas) if (s.tipo === 'subsecao' && s.pai_id != null) {
    if (!filhosSub.has(s.pai_id)) filhosSub.set(s.pai_id, []);
    filhosSub.get(s.pai_id).push(s);
  }
  const idsDe = (id) => { const r = new Set([id]); for (const f of filhosSub.get(id) ?? []) for (const x of idsDe(f.id)) r.add(x); return r; };
  const resumo = (s) => ({ id: s.id, nome: s.nome, sigla: s.sigla, tipo: s.tipo });
  const montar = (s, verPessoas) => ({
    secao: resumo(s), ids: idsDe(s.id), verPessoas,
    subunidades: (filhosSub.get(s.id) ?? []).filter((f) => f.ativa).map((f) => ({ secao: resumo(f), ids: idsDe(f.id) })),
  });
  if (user.perfil === 'chefe') {
    const propria = porId.get(user.secao_id);
    if (!propria) return null;
    // O chefe consulta a própria unidade (e, nela, as subseções); uma subseção sua pode ser aberta com `secao`.
    const alvo = secaoPedida && idsDe(propria.id).has(secaoPedida) ? porId.get(secaoPedida) : propria;
    return [montar(alvo, true)];
  }
  const verPessoas = veNumerosIndividuais(user);
  if (secaoPedida) {
    const s = porId.get(secaoPedida);
    return s ? [montar(s, verPessoas)] : [];
  }
  return todas.filter((s) => s.ativa && TIPOS_DE_ACOMPANHAMENTO.includes(s.tipo)).map((s) => montar(s, verPessoas));
}
