// Reunião da seção: o que a reunião da organização-mãe tem, em nível de seção (só muda a instância): agendamento próprio
// (dia da semana, horário, periodicidade e data da próxima), combinados da seção e revisão da ata por sugestões e versões.
// Registrado por `reunioes-equipe.js`, antes das rotas `/:id`, para que "agenda" e "combinados" não sejam lidos como número.
import { empresaAtual } from './empresa.js';
import { falha, h, permit, texto } from './helpers.js';
import { DIA_PADRAO, FREQUENCIAS, HORA_PADRAO, INTERVALOS_REUNIAO, LIMITE_COMBINADOS, agora, cicloDe, ehISO, refReuniao, reuniaoAnterior } from './logic.js';

export function extrasReuniaoEquipe(app, { db, q, q1, run, agoraISO, hoje, cfg, reuniaoDe, comReuniao, travar }) {
  const soChefe = permit('chefe');
  const semSecao = () => { throw falha(409, 'Você ainda não está vinculado a uma seção. Peça {topo:ao} para atribuí-lo a uma seção.'); };
  const secaoDe = (req) => req.user.secao_id || semSecao();

  // ---------- Agenda da seção ----------
  const configDe = async (secaoId) => Object.fromEntries((await q('select chave, valor from secao_config where secao_id = ? and empresa_id = ?', secaoId, empresaAtual())).map((r) => [r.chave, r.valor]));
  /** Dia, horário, periodicidade e data da próxima reunião da seção; o que a seção não definiu vale o da instituição. */
  const agendaDe = async (secaoId) => {
    const [c, emp] = await Promise.all([configDe(secaoId), cfg()]);
    const dia = c.reuniao_dia != null ? Number(c.reuniao_dia) : emp.reuniao_dia != null ? Number(emp.reuniao_dia) : DIA_PADRAO;
    const hora = c.reuniao_hora || emp.reuniao_hora || HORA_PADRAO;
    const { intervalo, proxima } = cicloDe(c);
    const referencia = (horaCorte = 12) => refReuniao(agora(), { dia, intervalo, proxima, horaCorte });
    const semana = referencia();
    return { dia, hora, intervalo, proxima, semana, anterior: reuniaoAnterior(semana, { dia, intervalo }), referencia,
      combinados_frequencia: c.combinados_frequencia || 'sempre', propria: Object.keys(c).length > 0 };
  };
  const agendaOut = ({ referencia, ...a }) => ({ ...a, hoje: hoje() });

  app.get('/api/reunioes-equipe/agenda', soChefe, h(async (req) => agendaOut(await agendaDe(secaoDe(req)))));
  app.put('/api/reunioes-equipe/agenda', soChefe, h(async (req) => {
    const secaoId = secaoDe(req);
    const b = req.body || {};
    const valores = [];
    if (b.reuniao_dia != null) {
      const dia = Number(b.reuniao_dia);
      if (String(b.reuniao_dia).trim() === '' || !Number.isInteger(dia) || dia < 0 || dia > 6) throw falha(400, 'O dia da reunião deve ser um número entre 0 (domingo) e 6 (sábado).');
      valores.push(['reuniao_dia', String(dia)]);
    }
    if (b.reuniao_hora != null) {
      const hora = String(b.reuniao_hora).trim();
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw falha(400, 'O horário da reunião deve estar no formato HH:MM (ex.: 10:00).');
      valores.push(['reuniao_hora', hora]);
    }
    if (b.reuniao_intervalo != null) {
      const intervalo = Number(b.reuniao_intervalo);
      if (!INTERVALOS_REUNIAO.includes(intervalo)) throw falha(400, 'A reunião é semanal (7 dias) ou quinzenal (14 dias).');
      valores.push(['reuniao_intervalo', String(intervalo)]);
    }
    if (b.combinados_frequencia != null) {
      if (!FREQUENCIAS.includes(b.combinados_frequencia)) throw falha(400, 'Escolha quando os combinados aparecem: sempre, na primeira reunião do mês ou quando mudarem.');
      valores.push(['combinados_frequencia', b.combinados_frequencia]);
    }
    const apagarProxima = 'reuniao_proxima' in b && (b.reuniao_proxima === null || b.reuniao_proxima === '');
    if (b.reuniao_proxima) {
      if (!ehISO(b.reuniao_proxima)) throw falha(400, 'Informe a data da próxima reunião (AAAA-MM-DD).');
      if (b.reuniao_proxima < hoje()) throw falha(400, 'A data da próxima reunião não pode ser anterior a hoje.');
      if (await q1(`select 1 as ok from reunioes_equipe where secao_id = ? and status = 'em_andamento' and empresa_id = ?`, secaoId, empresaAtual())) throw falha(409, 'Há uma reunião em andamento. Encerre-a antes de mudar a data da próxima.');
      valores.push(['reuniao_proxima', b.reuniao_proxima]);
    }
    return db.transaction(async () => {
      const atual = await agendaDe(secaoId);
      // Quinzenal precisa saber de que data contar: sem uma data marcada, a série começa na próxima reunião prevista.
      if (valores.some(([k, v]) => k === 'reuniao_intervalo' && v === '14') && !valores.some(([k]) => k === 'reuniao_proxima') && !apagarProxima && !atual.proxima) {
        const dia = valores.find(([k]) => k === 'reuniao_dia');
        valores.push(['reuniao_proxima', refReuniao(agora(), { dia: dia ? Number(dia[1]) : atual.dia, horaCorte: 12 })]);
      }
      if (apagarProxima) await run(`delete from secao_config where secao_id = ? and chave = 'reuniao_proxima' and empresa_id = ?`, secaoId, empresaAtual());
      for (const [chave, valor] of valores) {
        await run('insert into secao_config (secao_id, empresa_id, chave, valor) values (?,?,?,?) on conflict (secao_id, chave) do update set valor = excluded.valor', secaoId, empresaAtual(), chave, valor);
      }
      return agendaOut(await agendaDe(secaoId));
    });
  }));

  // ---------- Combinados da seção ----------
  const avisoLimite = async (secaoId) => {
    const n = Number((await q1('select count(*) as n from secao_combinados where secao_id = ? and ativo = 1 and arquivado = 0 and empresa_id = ?', secaoId, empresaAtual())).n);
    return n > LIMITE_COMBINADOS ? `Há ${n} combinados ativos. Recomendamos de 5 a ${LIMITE_COMBINADOS} para que a abertura da reunião continue rápida.` : null;
  };
  /** A tela de abertura da reunião (combinados) aparece conforme a frequência escolhida pela seção. */
  const mostrarCombinados = async (secaoId) => {
    const freq = (await agendaDe(secaoId)).combinados_frequencia;
    if (freq === 'sempre') return true;
    if (freq === 'primeira_do_mes') return !(await q1('select 1 as ok from reunioes_equipe where secao_id = ? and substr(data, 1, 7) = ? and empresa_id = ?', secaoId, hoje().slice(0, 7), empresaAtual()));
    const ultima = await q1('select iniciada_em from reunioes_equipe where secao_id = ? and empresa_id = ? order by iniciada_em desc limit 1', secaoId, empresaAtual());
    const alterado = (await q1('select max(alterado_em) as m from secao_combinados where secao_id = ? and empresa_id = ?', secaoId, empresaAtual()))?.m;
    return !ultima || !!(alterado && alterado > ultima.iniciada_em);
  };
  const snapshotCombinados = (secaoId) => q('select id, texto, ordem from secao_combinados where secao_id = ? and ativo = 1 and arquivado = 0 and empresa_id = ? order by ordem, id', secaoId, empresaAtual());

  app.get('/api/reunioes-equipe/combinados', soChefe, h(async (req) => {
    const secaoId = secaoDe(req);
    const inativos = req.query.todos === '1';
    const arquivados = req.query.arquivados === '1';
    const itens = (await q(`select * from secao_combinados where secao_id = ? and empresa_id = ? ${arquivados ? '' : 'and arquivado = 0'} ${inativos || arquivados ? '' : 'and ativo = 1'} order by arquivado, ordem, id`, secaoId, empresaAtual()))
      .map((c) => ({ ...c, ativo: !!c.ativo, arquivado: !!c.arquivado }));
    const ativos = Number((await q1('select count(*) as n from secao_combinados where secao_id = ? and ativo = 1 and arquivado = 0 and empresa_id = ?', secaoId, empresaAtual())).n);
    return { itens, ativos, limite: LIMITE_COMBINADOS, aviso: await avisoLimite(secaoId) };
  }));
  app.post('/api/reunioes-equipe/combinados', soChefe, h(async (req, res) => {
    const secaoId = secaoDe(req);
    const t = texto(req.body?.texto, 240);
    if (!t) throw falha(400, 'Escreva o combinado.');
    const ordem = Number((await q1('select coalesce(max(ordem), 0) + 1 as o from secao_combinados where secao_id = ? and empresa_id = ?', secaoId, empresaAtual())).o);
    const id = (await run('insert into secao_combinados (empresa_id, secao_id, texto, ordem, ativo, arquivado, criado_por, criado_em, alterado_em) values (?,?,?,?,?,?,?,?,?)',
      empresaAtual(), secaoId, t, ordem, 1, 0, req.user.id, agoraISO(), agoraISO())).lastInsertRowid;
    res.status(201);
    return { combinado: await q1('select * from secao_combinados where id = ?', id), aviso: await avisoLimite(secaoId) };
  }));
  app.patch('/api/reunioes-equipe/combinados/:id', soChefe, h(async (req) => {
    const secaoId = secaoDe(req);
    const id = Number(req.params.id);
    const c = await q1('select * from secao_combinados where id = ? and secao_id = ? and empresa_id = ?', id, secaoId, empresaAtual());
    if (!c) throw falha(404, 'Combinado não encontrado.');
    const b = req.body || {};
    if ('texto' in b) {
      const t = texto(b.texto, 240);
      if (!t) throw falha(400, 'O combinado não pode ficar vazio.');
      await run('update secao_combinados set texto = ? where id = ?', t, id);
    }
    if ('ativo' in b) await run('update secao_combinados set ativo = ? where id = ?', b.ativo ? 1 : 0, id);
    if ('arquivado' in b) await run('update secao_combinados set arquivado = ?, ativo = case when ? = 1 then 0 else ativo end where id = ?', b.arquivado ? 1 : 0, b.arquivado ? 1 : 0, id);
    if (b.mover === 'cima' || b.mover === 'baixo') {
      const lista = await q('select id from secao_combinados where secao_id = ? and arquivado = 0 and empresa_id = ? order by ordem, id', secaoId, empresaAtual());
      for (let i = 0; i < lista.length; i++) await run('update secao_combinados set ordem = ? where id = ?', i + 1, lista[i].id);
      const i = lista.findIndex((x) => x.id === id);
      const j = b.mover === 'cima' ? i - 1 : i + 1;
      if (i >= 0 && j >= 0 && j < lista.length) {
        await run('update secao_combinados set ordem = ? where id = ?', j + 1, id);
        await run('update secao_combinados set ordem = ? where id = ?', i + 1, lista[j].id);
      }
    }
    await run('update secao_combinados set alterado_em = ? where id = ?', agoraISO(), id);
    const novo = await q1('select * from secao_combinados where id = ?', id);
    return { combinado: { ...novo, ativo: !!novo.ativo, arquivado: !!novo.arquivado }, aviso: await avisoLimite(secaoId) };
  }));

  // ---------- Revisão da ata: sugestões e versões ----------
  const sugestoesDe = (reuniaoId) => q(`select a.*, u.nome as usuario_nome, v.nome as respondida_por_nome from reuniao_equipe_sugestoes a
    join usuarios u on u.id = a.usuario_id left join usuarios v on v.id = a.respondida_por where a.reuniao_id = ? order by a.id`, reuniaoId);
  const presente = async (reuniaoId, usuarioId) => !!(await q1('select 1 as ok from reuniao_equipe_participantes where reuniao_id = ? and usuario_id = ? and presente = 1', reuniaoId, usuarioId));
  /** Sugestões, versões publicadas e se quem consulta pode sugerir (quem esteve presente, depois que a ata é enviada). */
  const revisaoDe = async (user, r) => ({
    sugestoes: r.status === 'enviada' ? await sugestoesDe(r.id) : [],
    pode_sugerir: r.status === 'enviada' && ['chefe', 'membro'].includes(user.perfil) && await presente(r.id, user.id),
    revisoes: r.status === 'enviada' ? await q(`select a.id, a.ata_texto, a.criada_em, u.nome as criado_por_nome from reuniao_equipe_revisoes a
      left join usuarios u on u.id = a.criado_por where a.reuniao_id = ? order by a.id desc`, r.id) : [],
  });
  const registrarVersao = (r, user, t) => run('insert into reuniao_equipe_revisoes (reuniao_id, ata_texto, criado_por, criada_em) values (?,?,?,?)', r.id, t, user.id, agoraISO());
  /** Ao corrigir uma ata já enviada, guarda a versão anterior (uma vez) e a nova. */
  const guardarVersoes = async (r, user, nova) => {
    if (r.status !== 'enviada' || nova === r.ata_texto) return;
    if (!(await q1('select id from reuniao_equipe_revisoes where reuniao_id = ? limit 1', r.id))) await registrarVersao(r, user, r.ata_texto);
    await registrarVersao(r, user, nova);
  };

  app.post('/api/reunioes-equipe/:id/sugestoes', permit('chefe', 'membro'), h(async (req, res) => db.transaction(async () => {
    await travar();
    const r = await reuniaoDe(req.params.id);
    if (r.status !== 'enviada') throw falha(409, 'A ata ainda não foi publicada.');
    if (!(await presente(r.id, req.user.id))) throw falha(403, 'Somente quem esteve presente na reunião pode sugerir revisões da ata.');
    const tipo = req.body?.tipo;
    const t = texto(req.body?.texto, 2000);
    if (!['correcao', 'inclusao', 'supressao'].includes(tipo) || !t) throw falha(400, 'Informe o tipo e descreva a revisão solicitada.');
    await run('insert into reuniao_equipe_sugestoes (reuniao_id, usuario_id, tipo, texto, criada_em) values (?,?,?,?,?)', r.id, req.user.id, tipo, t, agoraISO());
    res.status(201);
    return { ok: true };
  })));
  app.post('/api/reunioes-equipe/:id/sugestoes/:sugestaoId/responder', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    if (r.status !== 'enviada') throw falha(409, 'A ata ainda não foi publicada.');
    const s = await q1('select * from reuniao_equipe_sugestoes where id = ? and reuniao_id = ?', Number(req.params.sugestaoId), r.id);
    if (!s) throw falha(404, 'Sugestão não encontrada.');
    if (s.status !== 'pendente') throw falha(409, 'Esta sugestão já foi respondida.');
    const status = req.body?.status;
    const resposta = texto(req.body?.resposta, 2000);
    if (!['acolhida', 'nao_acolhida'].includes(status) || !resposta) throw falha(400, 'Informe o resultado e a resposta ao participante.');
    if (status === 'acolhida' && req.body.ata_texto !== undefined) {
      const t = texto(req.body.ata_texto, 20000);
      if (!t) throw falha(400, 'A ata não pode ficar vazia.');
      if (req.body.ata_base !== r.ata_texto) throw falha(409, 'A ata foi alterada por outra pessoa. Recarregue antes de responder.');
      await guardarVersoes(r, req.user, t);
      await run('update reunioes_equipe set ata_texto = ? where id = ? and empresa_id = ?', t, r.id, empresaAtual());
    }
    await run('update reuniao_equipe_sugestoes set status = ?, resposta = ?, respondida_por = ?, respondida_em = ? where id = ?', status, resposta, req.user.id, agoraISO(), s.id);
    return { ok: true };
  })));

  return { agendaDe, mostrarCombinados, snapshotCombinados, revisaoDe, guardarVersoes, registrarVersao };
}
