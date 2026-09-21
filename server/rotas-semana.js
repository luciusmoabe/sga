// Sessão inicial, atualização semanal do chefe e painel, pauta e detalhe do Diretor.
import { subarvore } from './db.js';
import { FUSO_NEGOCIO, HORA_CORTE_PADRAO, agora, ehDiaReuniao, fechamentoDe, refDiaReuniao } from './logic.js';
import { atualizacaoDe, cartoesReuniao, falha, h, marks, painelSemana, permit, texto, ultimaAtualizacao } from './helpers.js';

export function rotasSemana(app, { db, q, q1, run, agoraISO, hoje, cfgReuniao, semanaDe, SELECT_ACAO, acaoOut }) {
  // ---------- Bootstrap ----------
  app.get('/api/bootstrap', h(async (req) => {
    const { dia, hora, config } = await cfgReuniao();
    const semana = refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    const secao = req.user.secao_id ? await q1('select id, nome, sigla, tipo from secoes where id = ?', req.user.secao_id) : null;
    return {
      user: req.user,
      csrf: req.csrf,
      secao,
      agora: agoraISO(),
      hoje: hoje(),
      semana,
      fechamento: fechamentoDe(semana),
      config,
      fuso: FUSO_NEGOCIO,
      reuniao_dia: dia,
      reuniao_hora: hora,
    };
  }));


  // ---------- Atualização semanal do chefe ----------
  app.get('/api/atualizacao', permit('chefe'), h(async (req) => {
    if (!req.user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção. Peça ao Diretor para atribuí-lo.');
    const semana = await semanaDe(req);
    const anterior = (await q1(`select semana from atualizacoes where secao_id = ? and semana < ? order by semana desc limit 1`, req.user.secao_id, semana))?.semana;
    const prev = anterior ? await ultimaAtualizacao(db, req.user.secao_id, anterior) : null;
    return {
      semana,
      fechamento: fechamentoDe(semana),
      atual: await ultimaAtualizacao(db, req.user.secao_id, semana),
      anterior: prev ? { semana: anterior, proximo: prev.proximo } : null,
    };
  }));
  app.put('/api/atualizacao', permit('chefe'), h(async (req) => {
    if (!req.user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção.');
    const b = req.body || {};
    const { dia } = await cfgReuniao();
    const semana = b.semana || refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    if (!ehDiaReuniao(semana, dia)) throw falha(400, 'Semana inválida.');
    const lista = (v) => (Array.isArray(v) ? v.map((x) => texto(x, 400)).filter(Boolean).slice(0, 30) : []);
    const previstos = (Array.isArray(b.feito?.previstos) ? b.feito.previstos : [])
      .map((p) => ({ texto: texto(p?.texto, 400), cumprido: !!p?.cumprido })).filter((p) => p.texto);
    const feito = { previstos, extras: lista(b.feito?.extras) };
    const proximo = lista(b.proximo);
    const impedimentos = lista(b.impedimentos);
    if (!previstos.length && !feito.extras.length && !proximo.length) throw falha(400, 'Registre ao menos o que foi feito ou o que será feito.');
    return db.transaction(async () => {
      // A seção existe mesmo quando ainda não há atualização desta semana.
      // Travá-la serializa a escolha da próxima versão entre instâncias PostgreSQL.
      if (db.isPg) await q1('select id from secoes where id = ? for update', req.user.secao_id);
      const versao = ((await q1('select coalesce(max(versao), 0) v from atualizacoes where secao_id = ? and semana = ?', req.user.secao_id, semana)).v) + 1;
      await run(`insert into atualizacoes (secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (?,?,?,?,?,?,?,?,?,?)`,
        req.user.secao_id, semana, versao, JSON.stringify(feito), JSON.stringify(proximo), JSON.stringify(impedimentos),
        b.critico && impedimentos.length ? 1 : 0, texto(b.apoio, 600), req.user.id, agoraISO());
      return await ultimaAtualizacao(db, req.user.secao_id, semana);
    });
  }));

  const historicoDe = async (secaoId, limite = 12) =>
    (await q(`select a.* from atualizacoes a where a.secao_id = ?
       and a.versao = (select max(b.versao) from atualizacoes b where b.secao_id = a.secao_id and b.semana = a.semana)
       order by a.semana desc limit ?`, secaoId, limite)).map(atualizacaoDe);
  app.get('/api/historico', permit('chefe'), h(async (req) => (req.user.secao_id ? await historicoDe(req.user.secao_id) : [])));

  // ---------- Painel do Diretor ----------
  app.get('/api/painel', permit('diretor', 'apoio'), h(async (req) => {
    const semana = await semanaDe(req);
    const itens = await painelSemana(db, semana, hoje());
    return {
      semana,
      fechamento: fechamentoDe(semana),
      itens,
      resumo: {
        verde: itens.filter((i) => i.cor === 'verde').length,
        amarelo: itens.filter((i) => i.cor === 'amarelo').length,
        vermelho: itens.filter((i) => i.cor === 'vermelho').length,
        pendentes: itens.filter((i) => !i.enviada).length,
        pedidos: itens.reduce((n, i) => n + i.pedidos_pendentes, 0),
      },
    };
  }));
  // Pauta da semana (base da versão para impressão): mesmos cartões do Modo Reunião, sem reunião aberta.
  app.get('/api/pauta', permit('diretor', 'apoio'), h(async (req) => {
    const semana = await semanaDe(req);
    return { semana, cartoes: await cartoesReuniao(db, semana, hoje()) };
  }));
  app.get('/api/secoes/:id/detalhe', permit('diretor', 'apoio'), h(async (req) => {
    const id = Number(req.params.id);
    const s = await q1('select * from secoes where id = ? and pai_id is null', id);
    if (!s) throw falha(404, 'Centro não encontrado.');
    const semana = await semanaDe(req);
    const item = (await painelSemana(db, semana, hoje())).find((i) => i.secao.id === id);
    const ids = await subarvore(db, id);
    const acoes = (await q(`${SELECT_ACAO} where a.secao_id in (${marks(ids)}) and (a.interna = 0 or a.compartilhada = 1) and a.encerrada = 0 and a.arquivada = 0
                     order by case a.status when 'concluida' then 1 else 0 end, a.prazo`, ...ids)).map(acaoOut);
    const tempoTotal = (await q1(`select coalesce(sum(t.minutos), 0) m from tempo t join acoes a on a.id = t.acao_id where a.secao_id in (${marks(ids)})`, ...ids))?.m ?? 0;
    return { semana, item, historico: await historicoDe(id), acoes, tempo_total: tempoTotal };
  }));
}
