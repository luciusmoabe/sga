import { addDays, semaforo, ORDEM_COR } from './logic.js';
import { subarvore } from './db.js';

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

/** Painel da semana: uma linha por Centro/Coordenação, somando as subseções abaixo.
 *  Implementação otimizada: 4 queries agregadas totais (independente do nº de Centros)
 *  em vez de 4 queries × N centros (N+1 problem). */
export async function painelSemana(db, semana, hoje) {
  const centros = (await db
    .prepare(
      `select s.*, u.nome as chefe_nome from secoes s left join usuarios u on u.id = s.chefe_id
       where s.pai_id is null and s.ativa = 1 order by s.ordem, s.id`,
    )
    .all()) || [];

  if (!centros.length) return [];

  const ate = addDays(hoje, 2);

  // Monta mapa centroId → [ids da subárvore]
  const arvores = new Map(centros.map((c) => [c.id, subarvore(db, c.id)]));
  // Todos os ids de seções (raízes + descendentes), achatados com mapeamento para centro raiz
  const todosIds = [];
  const idParaCentro = new Map();
  for (const [centroId, ids] of arvores) {
    for (const id of ids) {
      todosIds.push(id);
      idParaCentro.set(id, centroId);
    }
  }

  // ── Query 1: estatísticas de ações agrupadas por secao_id ──
  const statsRows = todosIds.length
    ? await db.prepare(
        `select
           secao_id,
           coalesce(sum(case when status != 'concluida' and prazo < ? then 1 end), 0) atrasadas,
           coalesce(sum(case when status != 'concluida' and prazo >= ? and prazo <= ? then 1 end), 0) vencendo,
           coalesce(sum(case when status != 'concluida' then 1 end), 0) abertas,
           coalesce(sum(case when status != 'concluida' and prazo < ? and interna = 1 and compartilhada = 0 then 1 end), 0) atrasadas_internas
         from acoes
         where encerrada = 0 and secao_id in (${marks(todosIds)})
         group by secao_id`,
      ).all(hoje, hoje, ate, hoje, ...todosIds)
    : [];

  // ── Query 2: última atualização por Centro (só raízes) ──
  const centroIds = centros.map((c) => c.id);
  const atualizacaoRows = centroIds.length
    ? await db.prepare(
        `select a.*
         from atualizacoes a
         where a.secao_id in (${marks(centroIds)}) and a.semana = ?
           and a.versao = (
             select max(b.versao) from atualizacoes b
             where b.secao_id = a.secao_id and b.semana = a.semana
           )`,
      ).all(...centroIds, semana)
    : [];

  // ── Query 3: tempo na semana, agrupado por seção ──
  const semanaInicio = addDays(semana, -7);
  const semanaFim = addDays(semana, -1);
  const tempoRows = todosIds.length
    ? await db.prepare(
        `select a.secao_id, coalesce(sum(t.minutos), 0) minutos
         from tempo t
         join acoes a on a.id = t.acao_id
         where a.secao_id in (${marks(todosIds)}) and t.data >= ? and t.data <= ?
         group by a.secao_id`,
      ).all(...todosIds, semanaInicio, semanaFim)
    : [];

  // ── Query 4: pedidos pendentes por seção ──
  const pedidosRows = todosIds.length
    ? await db.prepare(
        `select a.secao_id, count(*) n
         from pedidos_prazo p
         join acoes a on a.id = p.acao_id
         where p.status = 'pendente' and a.secao_id in (${marks(todosIds)})
         group by a.secao_id`,
      ).all(...todosIds)
    : [];

  // Agrega resultados por centroId
  const statsMap    = new Map();
  const tempoMap    = new Map();
  const pedidosMap  = new Map();
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

  return centros.map((c) => {
    const st  = statsMap.get(c.id)   ?? { atrasadas: 0, vencendo: 0, abertas: 0, atrasadas_internas: 0 };
    const at  = atMap.get(c.id)      ?? null;
    const cor = semaforo({ enviada: !!at, atrasadas: st.atrasadas, vencendo: st.vencendo, critico: at?.critico });
    return {
      secao: { id: c.id, nome: c.nome, sigla: c.sigla, tipo: c.tipo, chefe_nome: c.chefe_nome },
      cor,
      enviada:            !!at,
      enviada_em:         at?.enviada_em ?? null,
      critico:            !!at?.critico,
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

export const porNecessidade = (lista) =>
  [...lista].sort((a, b) => ORDEM_COR[a.cor] - ORDEM_COR[b.cor] || a.secao.id - b.secao.id);

/** Cartões do Modo Reunião: painel + relato da semana + ações visíveis ao Diretor + pedidos de prazo. */
export async function cartoesReuniao(db, semana, hoje) {
  const painel = await painelSemana(db, semana, hoje);
  const itens = porNecessidade(painel);
  return Promise.all(
    itens.map(async (p) => {
      const ids = subarvore(db, p.secao.id);
      const acoesRaw = (await db
        .prepare(
          `select a.id, a.titulo, a.prazo, a.status, a.prioridade, a.encerrada,
                  coalesce((select sum(minutos) from tempo where acao_id = a.id), 0) tempo_total,
                  s.sigla secao_sigla
           from acoes a join secoes s on s.id = a.secao_id
           where a.secao_id in (${marks(ids)}) and a.encerrada = 0 and (a.interna = 0 or a.compartilhada = 1)
           order by case a.status when 'concluida' then 1 else 0 end, a.prazo`,
        )
        .all(...ids)) || [];
      const acoes = acoesRaw.map((a) => ({ ...a, atrasada: a.status !== 'concluida' && a.prazo < hoje }));
      const pedidos = (await db
        .prepare(
          `select p.id, p.acao_id, p.novo_prazo, p.prazo_atual, p.justificativa, a.titulo acao_titulo
           from pedidos_prazo p join acoes a on a.id = p.acao_id
           where p.status = 'pendente' and a.secao_id in (${marks(ids)}) order by p.criado_em`,
        )
        .all(...ids)) || [];
      const at = await ultimaAtualizacao(db, p.secao.id, semana);
      return { ...p, atualizacao: at, acoes, pedidos };
    }),
  );
}
