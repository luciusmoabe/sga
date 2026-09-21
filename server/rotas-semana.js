// Sessão inicial, atualização semanal do chefe e painel, pauta e detalhe do Diretor.
import { subarvore } from './db.js';
import { FUSO_NEGOCIO, HORA_CORTE_PADRAO, agora, ehDiaReuniao, fechamentoDe, refDiaReuniao } from './logic.js';
import { atualizacaoDe, cartoesReuniao, falha, h, marks, painelSemana, permit, texto, ultimaAtualizacao } from './helpers.js';

export function rotasSemana(app, { db, q, q1, run, agoraISO, hoje, cfgReuniao, semanaDe, SELECT_ACAO, acaoOut }) {
  // ---------- Bootstrap ----------
  app.get('/api/bootstrap', h(async (req) => {
    // Consultas independentes em paralelo; a contagem de pedidos alimenta o selo do menu sem uma requisição a mais.
    const [{ dia, hora, config }, secao, pedidos] = await Promise.all([
      cfgReuniao(),
      req.user.secao_id ? q1('select id, nome, sigla, tipo from secoes where id = ?', req.user.secao_id) : null,
      req.user.perfil === 'chefe' ? null : q1(
        `select count(*) n from pedidos_prazo p join acoes a on a.id = p.acao_id
         where p.status = 'pendente' and a.arquivada = 0 and a.encerrada = 0 and (${req.user.perfil === 'administrador' ? '1 = 1' : 'a.interna = 0 or a.compartilhada = 1'})`),
    ]);
    const semana = refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    return {
      pedidos_pendentes: Number(pedidos?.n ?? 0),
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
  // O chefe age na própria seção; o Administrador, em qualquer seção ativa, informada em secao_id.
  const secaoDaAtualizacao = async (req) => {
    if (req.user.perfil !== 'administrador') {
      if (!req.user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção. Peça ao Diretor para atribuí-lo.');
      return req.user.secao_id;
    }
    const id = Number(req.query.secao_id ?? req.body?.secao_id);
    if (!id || !(await q1('select id from secoes where id = ?', id))) throw falha(400, 'Informe a seção da atualização (secao_id).');
    return id;
  };
  app.get('/api/atualizacao', permit('chefe', 'administrador'), h(async (req) => {
    const secaoId = await secaoDaAtualizacao(req);
    const semana = await semanaDe(req);
    const anterior = (await q1(`select semana from atualizacoes where secao_id = ? and semana < ? order by semana desc limit 1`, secaoId, semana))?.semana;
    const prev = anterior ? await ultimaAtualizacao(db, secaoId, anterior) : null;
    return {
      semana,
      fechamento: fechamentoDe(semana),
      atual: await ultimaAtualizacao(db, secaoId, semana),
      anterior: prev ? { semana: anterior, proximo: prev.proximo } : null,
    };
  }));
  app.put('/api/atualizacao', permit('chefe', 'administrador'), h(async (req) => {
    const secaoId = await secaoDaAtualizacao(req);
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
      if (db.isPg) await q1('select id from secoes where id = ? for update', secaoId);
      const versao = ((await q1('select coalesce(max(versao), 0) v from atualizacoes where secao_id = ? and semana = ?', secaoId, semana)).v) + 1;
      await run(`insert into atualizacoes (secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (?,?,?,?,?,?,?,?,?,?)`,
        secaoId, semana, versao, JSON.stringify(feito), JSON.stringify(proximo), JSON.stringify(impedimentos),
        b.critico && impedimentos.length ? 1 : 0, texto(b.apoio, 600), req.user.id, agoraISO());
      return await ultimaAtualizacao(db, secaoId, semana);
    });
  }));

  const historicoDe = async (secaoId, limite = 12) =>
    (await q(`select a.* from atualizacoes a where a.secao_id = ?
       and a.versao = (select max(b.versao) from atualizacoes b where b.secao_id = a.secao_id and b.semana = a.semana)
       order by a.semana desc limit ?`, secaoId, limite)).map(atualizacaoDe);
  app.get('/api/historico', permit('chefe', 'administrador'), h(async (req) => (
    req.user.perfil === 'administrador' || req.user.secao_id ? await historicoDe(await secaoDaAtualizacao(req)) : [])));

  // ---------- Painel do Diretor ----------
  app.get('/api/painel', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
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
  app.get('/api/pauta', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
    const semana = await semanaDe(req);
    return { semana, cartoes: await cartoesReuniao(db, semana, hoje()) };
  }));
  app.get('/api/secoes/:id/detalhe', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
    const id = Number(req.params.id);
    const todas = req.user.perfil === 'administrador';
    // Consultas independentes em paralelo (o tempo da tela é o número de idas em série ao banco).
    const [s, semana, ids] = await Promise.all([
      q1('select * from secoes where id = ? and pai_id is null', id), semanaDe(req), subarvore(db, id),
    ]);
    if (!s) throw falha(404, 'Centro não encontrado.');
    const [painel, historico, acoes, tempo] = await Promise.all([
      painelSemana(db, semana, hoje()),
      historicoDe(id),
      q(`${SELECT_ACAO} where a.secao_id in (${marks(ids)}) and (${todas ? '1 = 1' : 'a.interna = 0 or a.compartilhada = 1'}) and a.encerrada = 0 and a.arquivada = 0
                     order by case a.status when 'concluida' then 1 else 0 end, a.prazo`, ...ids),
      q1(`select coalesce(sum(t.minutos), 0) m from tempo t join acoes a on a.id = t.acao_id where a.secao_id in (${marks(ids)})`, ...ids),
    ]);
    const item = painel.find((i) => i.secao.id === id);
    return { semana, item, historico, acoes: acoes.map(acaoOut), tempo_total: tempo?.m ?? 0, acoes_internas_visiveis: todas };
  }));
}
