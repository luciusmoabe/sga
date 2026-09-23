import { addDays, semaforo } from './logic.js';
import { porNecessidade as compararNecessidade } from '../public/js/regras.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const falha = (status, message) => new HttpError(status, message);

/** Envolve um handler (síncrono ou assíncrono): o retorno vira JSON e exceções vão para o middleware de erro. */
export const h = (fn) => (req, res, next) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .then((r) => {
      if (r !== undefined && !res.headersSent) res.json(r);
    })
    .catch(next);
};

export const permit = (...perfis) => (req, res, next) =>
  perfis.includes(req.user.perfil)
    ? next()
    : next(falha(403, 'Seu perfil não tem acesso a esta ação.'));

export const json = (s, padrao) => {
  try {
    return s ? JSON.parse(s) : padrao;
  } catch {
    return padrao;
  }
};

export const marks = (ids) => ids.map(() => '?').join(',');
export const texto = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function atualizacaoDe(row) {
  if (!row) return null;
  return {
    ...row,
    feito: json(row.feito, { previstos: [], extras: [] }),
    proximo: json(row.proximo, []),
    impedimentos: json(row.impedimentos, []),
    critico: !!row.critico,
  };
}

export const ultimaAtualizacao = async (db, secaoId, semana) => {
  const row = await db
    .prepare('select * from atualizacoes where secao_id = ? and semana = ? order by versao desc limit 1')
    .get(secaoId, semana);
  return atualizacaoDe(row);
};

/** Ids de cada Centro/Coordenação ativo e de suas subseções, numa única consulta recursiva
 *  (antes eram N consultas, uma por Centro). `union` descarta repetições e protege contra ciclos. */
export async function arvoresDosCentros(db) {
  const rows = await db.prepare(
    `with recursive t(centro_id, id) as (
       select id, id from secoes where pai_id is null and ativa = 1
       union select t.centro_id, s.id from secoes s join t on s.pai_id = t.id
     ) select centro_id, id from t order by centro_id, id`,
  ).all();
  const arvores = new Map();
  for (const r of rows) {
    if (!arvores.has(r.centro_id)) arvores.set(r.centro_id, []);
    arvores.get(r.centro_id).push(r.id);
  }
  return arvores;
}

/** Painel da semana: uma linha por Centro/Coordenação, somando as subseções abaixo.
 *  Poucas consultas e todas independentes rodam em paralelo: com o banco distante, o tempo da tela
 *  é o número de idas em série (não de consultas). `arvoresPre` evita repetir a árvore quando o chamador já a tem. */
export async function painelSemana(db, semana, hoje, arvoresPre = null) {
  const [centros, arvores] = await Promise.all([
    db.prepare(
      `select s.*, u.nome as chefe_nome from secoes s left join usuarios u on u.id = s.chefe_id
       where s.pai_id is null and s.ativa = 1 order by s.ordem, s.id`,
    ).all(),
    arvoresPre ?? arvoresDosCentros(db),
  ]);
  if (!centros.length) return [];

  const ate = addDays(hoje, 2);
  // Todos os ids de seções (raízes + descendentes), achatados com mapeamento para o centro raiz
  const todosIds = [];
  const idParaCentro = new Map();
  for (const c of centros) {
    for (const id of arvores.get(c.id) ?? [c.id]) {
      todosIds.push(id);
      idParaCentro.set(id, c.id);
    }
  }
  const semanaInicio = addDays(semana, -7);
  const semanaFim = addDays(semana, -1);

  const [statsRows, atualizacaoRows, tempoRows, pedidosRows, criticosRows] = await Promise.all([
    // 1: estatísticas de ações agrupadas por secao_id
    db.prepare(
      `select
         secao_id,
         coalesce(sum(case when status != 'concluida' and prazo < ? then 1 end), 0) atrasadas,
         coalesce(sum(case when status != 'concluida' and prazo >= ? and prazo <= ? then 1 end), 0) vencendo,
         coalesce(sum(case when status != 'concluida' then 1 end), 0) abertas,
         coalesce(sum(case when status != 'concluida' and prazo < ? and interna = 1 and compartilhada = 0 then 1 end), 0) atrasadas_internas
       from acoes
       where encerrada = 0 and arquivada = 0 and secao_id in (${marks(todosIds)})
       group by secao_id`,
    ).all(hoje, hoje, ate, hoje, ...todosIds),
    // 2: última atualização de cada seção, incluindo subseções
    db.prepare(
      `select a.*
       from atualizacoes a
       where a.secao_id in (${marks(todosIds)}) and a.semana = ?
         and a.versao = (
           select max(b.versao) from atualizacoes b
           where b.secao_id = a.secao_id and b.semana = a.semana
         )`,
    ).all(...todosIds, semana),
    // 3: tempo na semana, agrupado por seção
    db.prepare(
      `select a.secao_id, coalesce(sum(t.minutos), 0) minutos
       from tempo t
       join acoes a on a.id = t.acao_id
       where a.secao_id in (${marks(todosIds)}) and t.data >= ? and t.data <= ?
       group by a.secao_id`,
    ).all(...todosIds, semanaInicio, semanaFim),
    // 4: pedidos pendentes por seção
    db.prepare(
      `select a.secao_id, count(*) n
       from pedidos_prazo p
       join acoes a on a.id = p.acao_id
       where p.status = 'pendente' and a.arquivada = 0 and a.encerrada = 0 and a.secao_id in (${marks(todosIds)})
       group by a.secao_id`,
    ).all(...todosIds),
    // 5: impedimentos críticos ainda abertos em ações em curso, por seção (deixam a seção em vermelho)
    db.prepare(
      `select a.secao_id, count(*) n
       from impedimentos i
       join acoes a on a.id = i.acao_id
       where i.resolvido_em is null and i.critico = 1
         and a.status != 'concluida' and a.arquivada = 0 and a.encerrada = 0 and a.secao_id in (${marks(todosIds)})
       group by a.secao_id`,
    ).all(...todosIds),
  ]);

  // Agrega resultados por centroId
  const statsMap    = new Map();
  const tempoMap    = new Map();
  const pedidosMap  = new Map();
  const criticosMap = new Map();
  const atMap       = new Map(atualizacaoRows.map((r) => [r.secao_id, atualizacaoDe(r)]));

  for (const row of statsRows) {
    const cId = idParaCentro.get(row.secao_id);
    if (cId == null) continue;
    const prev = statsMap.get(cId) ?? { atrasadas: 0, vencendo: 0, abertas: 0, atrasadas_internas: 0 };
    statsMap.set(cId, {
      atrasadas:          prev.atrasadas          + Number(row.atrasadas),
      vencendo:           prev.vencendo           + Number(row.vencendo),
      abertas:            prev.abertas            + Number(row.abertas),
      atrasadas_internas: prev.atrasadas_internas + Number(row.atrasadas_internas),
    });
  }
  for (const row of tempoRows) {
    const cId = idParaCentro.get(row.secao_id);
    if (cId == null) continue;
    tempoMap.set(cId, (tempoMap.get(cId) ?? 0) + Number(row.minutos));
  }
  for (const row of pedidosRows) {
    const cId = idParaCentro.get(row.secao_id);
    if (cId == null) continue;
    pedidosMap.set(cId, (pedidosMap.get(cId) ?? 0) + Number(row.n));
  }
  for (const row of criticosRows) {
    const cId = idParaCentro.get(row.secao_id);
    if (cId == null) continue;
    criticosMap.set(cId, (criticosMap.get(cId) ?? 0) + Number(row.n));
  }

  return centros.map((c) => {
    const st  = statsMap.get(c.id)   ?? { atrasadas: 0, vencendo: 0, abertas: 0, atrasadas_internas: 0 };
    const at  = atMap.get(c.id)      ?? null;
    const impedimentosCriticos = criticosMap.get(c.id) ?? 0;
    // Crítico = impedimento crítico aberto em ação em curso. A marca do relato semanal antigo ainda vale
    // enquanto o relato da semana a trouxer (transição: some quando a tela do relato deixar de oferecê-la).
    const critico = impedimentosCriticos > 0 || arvores.get(c.id).some(id => atMap.get(id)?.critico);
    const cor = semaforo({ enviada: !!at, atrasadas: st.atrasadas, vencendo: st.vencendo, critico });
    return {
      secao: { id: c.id, nome: c.nome, sigla: c.sigla, tipo: c.tipo, chefe_nome: c.chefe_nome },
      cor,
      enviada:            !!at,
      enviada_em:         at?.enviada_em ?? null,
      critico,
      impedimentos_criticos: impedimentosCriticos,
      atrasadas:          st.atrasadas,
      vencendo:           st.vencendo,
      abertas:            st.abertas,
      atrasadas_internas: st.atrasadas_internas,
      pedidos_pendentes:  pedidosMap.get(c.id) ?? 0,
      tempo_semana:       tempoMap.get(c.id)   ?? 0,
      subsecoes:          (arvores.get(c.id)?.length ?? 1) - 1,
    };
  });
}

export const porNecessidade = (lista) => [...lista].sort(compararNecessidade);

/** Cartões do Modo Reunião: painel + relato da semana + ações visíveis ao Diretor + pedidos de prazo.
 *  Consultas agrupadas para todos os Centros de uma vez (antes eram três por Centro). */
export async function cartoesReuniao(db, semana, hoje) {
  const arvores = await arvoresDosCentros(db);
  const painel = await painelSemana(db, semana, hoje, arvores);
  const itens = porNecessidade(painel);
  const todosIds = itens.flatMap((p) => arvores.get(p.secao.id) ?? [p.secao.id]);
  const centroDe = new Map(itens.flatMap((p) => (arvores.get(p.secao.id) ?? [p.secao.id]).map((id) => [id, p.secao.id])));
  const raizes = itens.map((p) => p.secao.id);
  const [acoesRaw, pedidosRaw, atRaw, impedimentosRaw] = todosIds.length ? await Promise.all([
    db.prepare(
      `select a.id, a.secao_id, a.titulo, a.prazo, a.status, a.prioridade, a.encerrada,
              coalesce((select sum(minutos) from tempo where acao_id = a.id), 0) tempo_total,
              s.sigla secao_sigla
       from acoes a join secoes s on s.id = a.secao_id
       where a.secao_id in (${marks(todosIds)}) and a.encerrada = 0 and a.arquivada = 0 and (a.interna = 0 or a.compartilhada = 1)
       order by case a.status when 'concluida' then 1 else 0 end, a.prazo`,
    ).all(...todosIds),
    db.prepare(
      `select p.id, p.acao_id, a.secao_id, p.novo_prazo, p.prazo_atual, p.justificativa, a.titulo acao_titulo
       from pedidos_prazo p join acoes a on a.id = p.acao_id
       where p.status = 'pendente' and a.arquivada = 0 and a.encerrada = 0 and (a.interna = 0 or a.compartilhada = 1)
         and a.secao_id in (${marks(todosIds)}) order by p.criado_em`,
    ).all(...todosIds),
    db.prepare(
      `select a.* from atualizacoes a where a.secao_id in (${marks(raizes)}) and a.semana = ?
         and a.versao = (select max(b.versao) from atualizacoes b where b.secao_id = a.secao_id and b.semana = a.semana)`,
    ).all(...raizes, semana),
    // Impedimentos abertos em ações em curso, só de ações visíveis ao Diretor: o quadro da reunião mostra o estado de agora.
    db.prepare(
      `select i.id, i.acao_id, i.descricao, i.critico, i.apoio, i.criado_em, a.titulo acao_titulo, a.secao_id, s.sigla secao_sigla
       from impedimentos i join acoes a on a.id = i.acao_id join secoes s on s.id = a.secao_id
       where i.resolvido_em is null and a.status != 'concluida' and a.arquivada = 0 and a.encerrada = 0
         and (a.interna = 0 or a.compartilhada = 1) and a.secao_id in (${marks(todosIds)})
       order by i.critico desc, i.criado_em, i.id`,
    ).all(...todosIds),
  ]) : [[], [], [], []];
  const porCentro = (linhas) => {
    const m = new Map();
    for (const l of linhas) {
      const c = centroDe.get(l.secao_id);
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(l);
    }
    return m;
  };
  const acoesPor = porCentro(acoesRaw);
  const pedidosPor = porCentro(pedidosRaw);
  const impedimentosPor = porCentro(impedimentosRaw);
  const atPor = new Map(atRaw.map((r) => [r.secao_id, atualizacaoDe(r)]));
  return itens.map((p) => ({
    ...p,
    atualizacao: atPor.get(p.secao.id) ?? null,
    acoes: (acoesPor.get(p.secao.id) ?? []).map(({ secao_id, ...a }) => ({ ...a, atrasada: a.status !== 'concluida' && a.prazo < hoje })),
    pedidos: (pedidosPor.get(p.secao.id) ?? []).map(({ secao_id, ...x }) => x),
    impedimentos: (impedimentosPor.get(p.secao.id) ?? []).map(({ secao_id, ...i }) => ({ ...i, critico: !!i.critico })),
  }));
}
