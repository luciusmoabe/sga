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

/** Painel da semana: uma linha por Centro/Coordenação, somando as subseções abaixo. */
export async function painelSemana(db, semana, hoje) {
  const centros = (await db
    .prepare(
      `select s.*, u.nome as chefe_nome from secoes s left join usuarios u on u.id = s.chefe_id
       where s.pai_id is null and s.ativa = 1 order by s.ordem, s.id`,
    )
    .all()) || [];
  const ate = addDays(hoje, 2);
  return Promise.all(
    centros.map(async (c) => {
      const ids = subarvore(db, c.id);
      const st = await db
        .prepare(
          `select
             coalesce(sum(case when status != 'concluida' and prazo < ? then 1 end), 0) atrasadas,
             coalesce(sum(case when status != 'concluida' and prazo >= ? and prazo <= ? then 1 end), 0) vencendo,
             coalesce(sum(case when status != 'concluida' then 1 end), 0) abertas,
             coalesce(sum(case when status != 'concluida' and prazo < ? and interna = 1 and compartilhada = 0 then 1 end), 0) atrasadas_internas
           from acoes where encerrada = 0 and secao_id in (${marks(ids)})`,
        )
        .get(hoje, hoje, ate, hoje, ...ids);
      const at = await ultimaAtualizacao(db, c.id, semana);
      const tempoRow = await db
        .prepare(
          `select coalesce(sum(t.minutos), 0) m from tempo t join acoes a on a.id = t.acao_id
           where a.secao_id in (${marks(ids)}) and t.data >= ? and t.data <= ?`,
        )
        .get(...ids, addDays(semana, -7), addDays(semana, -1));
      const tempoSemana = tempoRow?.m ?? 0;
      const pedidosRow = await db
        .prepare(
          `select count(*) n from pedidos_prazo p join acoes a on a.id = p.acao_id
           where p.status = 'pendente' and a.secao_id in (${marks(ids)})`,
        )
        .get(...ids);
      const pedidos = pedidosRow?.n ?? 0;
      const cor = semaforo({ enviada: !!at, atrasadas: st?.atrasadas ?? 0, vencendo: st?.vencendo ?? 0, critico: at?.critico });
      return {
        secao: { id: c.id, nome: c.nome, sigla: c.sigla, tipo: c.tipo, chefe_nome: c.chefe_nome },
        cor,
        enviada: !!at,
        enviada_em: at?.enviada_em ?? null,
        critico: !!at?.critico,
        atrasadas: st?.atrasadas ?? 0,
        vencendo: st?.vencendo ?? 0,
        abertas: st?.abertas ?? 0,
        atrasadas_internas: st?.atrasadas_internas ?? 0,
        pedidos_pendentes: pedidos,
        tempo_semana: tempoSemana,
        subsecoes: ids.length - 1,
      };
    }),
  );
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
