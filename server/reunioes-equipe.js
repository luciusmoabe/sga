// Reunião do chefe com a equipe da própria seção (membros, suplentes e chefes das subseções): presença, pauta com a situação
// das ações de cada pessoa, decisões e ata. É independente da reunião do Diretor (`reunioes.js`): tem tabelas próprias
// (`reunioes_equipe`, migração 29) e cada seção tem no máximo uma reunião em andamento.
//   - Conduz (inicia, registra, encerra, edita e envia a ata): o chefe da seção, titular ou suplente (`user.secao_id` = seção da reunião).
//   - Lê a ata enviada: quem esteve presente (membro ou chefe) e o Administrador. O Diretor e o Apoio não leem estas atas.
import { subarvore } from './db.js';
import { empresaAtual } from './empresa.js';
import { falha, h, marks, permit, texto } from './helpers.js';
import { DIAS_SEM_MOVIMENTO, addDays, br, parseISO } from './logic.js';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const STATUS_PRIO = { atrasada: 0, vence: 1, parada: 2, normal: 3 };

export function rotasReunioesEquipe(app, { db, q, q1, run, agoraISO, hoje }) {
  const conduz = (user, r) => user.perfil === 'chefe' && !!user.secao_id && user.secao_id === r.secao_id;
  const soChefe = permit('chefe');
  const travar = async () => { if (db.isPg) await q1('select pg_advisory_xact_lock(7319, 3)'); };

  const reuniaoDe = async (id) => {
    const r = await q1(`select r.*, s.nome as secao_nome, s.sigla as secao_sigla from reunioes_equipe r join secoes s on s.id = r.secao_id
      where r.id = ? and r.empresa_id = ?`, Number(id), empresaAtual());
    if (!r) throw falha(404, 'Reunião da equipe não encontrada.');
    return r;
  };
  const exigirConducao = (user, r) => { if (!conduz(user, r)) throw falha(403, 'Só o chefe da seção conduz a reunião da equipe.'); };
  const emAndamento = (r) => { if (r.status !== 'em_andamento') throw falha(409, 'Esta reunião já foi encerrada.'); };
  const comReuniao = (id, user, fn) => db.transaction(async () => {
    await travar();
    const r = await reuniaoDe(id);
    exigirConducao(user, r);
    return fn(r);
  });
  const fmt = (r) => ({ id: r.id, secao_id: r.secao_id, secao_nome: r.secao_nome, secao_sigla: r.secao_sigla, data: r.data, status: r.status,
    iniciada_em: r.iniciada_em, encerrada_em: r.encerrada_em, enviada_em: r.enviada_em, ata_texto: r.ata_texto });

  /** Quem pode participar: membros, suplentes e chefes das subseções da árvore da seção (e o próprio chefe), ativos. */
  const candidatos = async (secaoId) => {
    const ids = await subarvore(db, secaoId);
    return q(`select u.id, u.nome, u.perfil, u.secao_id, s.sigla as secao_sigla from usuarios u join secoes s on s.id = u.secao_id
      where u.empresa_id = ? and u.ativo = 1 and u.perfil in ('membro', 'chefe') and u.secao_id in (${marks(ids)})
      order by case when u.secao_id = ? then 0 else 1 end, case when u.perfil = 'chefe' then 0 else 1 end, u.nome, u.id`, empresaAtual(), ...ids, secaoId);
  };

  // Situação das ações em aberto da árvore da seção, por pessoa: o que cada um traz para a pauta.
  const pauta = async (r, participantes) => {
    const ids = await subarvore(db, r.secao_id);
    const dia = hoje();
    const ate = addDays(dia, 2);
    const limiteParada = addDays(dia, -(DIAS_SEM_MOVIMENTO - 1));
    const linhas = await q(`select a.id, a.titulo, a.prazo, a.status, a.responsavel_id, s.sigla as secao_sigla,
        substr(coalesce(a.movimentada_em, a.criada_em), 1, 10) as movimento
      from acoes a join secoes s on s.id = a.secao_id
      where a.empresa_id = ? and a.secao_id in (${marks(ids)}) and a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0
      order by a.prazo, a.id`, empresaAtual(), ...ids);
    const marcar = (a) => {
      const situacao = a.prazo < dia ? 'atrasada' : a.prazo <= ate ? 'vence' : a.movimento < limiteParada ? 'parada' : 'normal';
      return { id: a.id, titulo: a.titulo, prazo: a.prazo, status: a.status, secao_sigla: a.secao_sigla, situacao };
    };
    const resumo = (acoes) => ({
      abertas: acoes.length, atrasadas: acoes.filter((a) => a.situacao === 'atrasada').length,
      vencem: acoes.filter((a) => a.situacao === 'vence').length, paradas: acoes.filter((a) => a.situacao === 'parada').length,
    });
    const doParticipante = new Set(participantes.map((p) => p.usuario_id));
    const cartoes = participantes.map((p) => {
      const acoes = linhas.filter((a) => a.responsavel_id === p.usuario_id).map(marcar).sort((x, y) => STATUS_PRIO[x.situacao] - STATUS_PRIO[y.situacao]);
      return { usuario_id: p.usuario_id, nome: p.nome, presente: !!p.presente, ...resumo(acoes), acoes };
    });
    const semDono = linhas.filter((a) => a.responsavel_id == null || !doParticipante.has(a.responsavel_id)).map(marcar)
      .sort((x, y) => STATUS_PRIO[x.situacao] - STATUS_PRIO[y.situacao]);
    if (semDono.length) cartoes.push({ usuario_id: null, nome: 'Sem responsável na reunião', presente: true, ...resumo(semDono), acoes: semDono });
    return cartoes;
  };

  const participantesDe = (reuniaoId) => q(`select p.usuario_id, p.nome, p.presente, p.ordem, u.perfil, s.sigla as secao_sigla
    from reuniao_equipe_participantes p join usuarios u on u.id = p.usuario_id left join secoes s on s.id = u.secao_id
    where p.reuniao_id = ? order by p.ordem, p.usuario_id`, reuniaoId);
  const decisoesDe = (reuniaoId) => q(`select d.id, d.texto, d.responsavel_id, u.nome as responsavel_nome, d.criada_em
    from reuniao_equipe_decisoes d left join usuarios u on u.id = d.responsavel_id where d.reuniao_id = ? order by d.id`, reuniaoId);

  // ---------- Lista ----------
  app.get('/api/reunioes-equipe', permit('chefe', 'membro', 'administrador'), h(async (req) => {
    const u = req.user;
    const propria = u.perfil !== 'membro' && u.secao_id ? u.secao_id : 0; // o membro só lê as atas das reuniões de que participou
    const linhas = await q(`select r.id, r.secao_id, s.sigla as secao_sigla, s.nome as secao_nome, r.data, r.status, r.iniciada_em, r.encerrada_em, r.enviada_em,
        (select count(*) from reuniao_equipe_decisoes d where d.reuniao_id = r.id) as decisoes,
        (select count(*) from reuniao_equipe_participantes p where p.reuniao_id = r.id and p.presente = 1) as presentes
      from reunioes_equipe r join secoes s on s.id = r.secao_id
      where r.empresa_id = ? and (r.secao_id = ?
        or (r.status = 'enviada' and exists (select 1 from reuniao_equipe_participantes p where p.reuniao_id = r.id and p.usuario_id = ? and p.presente = 1)))
      order by r.data desc, r.id desc limit 60`, empresaAtual(), propria, u.id);
    return linhas.map((r) => ({ ...r, decisoes: Number(r.decisoes), presentes: Number(r.presentes), conduzida: r.secao_id === propria && u.perfil === 'chefe' }));
  }));

  // ---------- Iniciar ----------
  app.post('/api/reunioes-equipe/iniciar', soChefe, h(async (req, res) => db.transaction(async () => {
    await travar();
    const secaoId = req.user.secao_id;
    if (!secaoId) throw falha(409, 'Você ainda não está vinculado a uma seção. Peça {topo:ao} para atribuí-lo a uma seção.');
    const aberta = await q1(`select id from reunioes_equipe where secao_id = ? and status = 'em_andamento' and empresa_id = ?`, secaoId, empresaAtual());
    if (aberta) return { reuniao: fmt(await reuniaoDe(aberta.id)), retomada: true };
    const equipe = await candidatos(secaoId);
    if (equipe.filter((c) => c.id !== req.user.id).length === 0) throw falha(409, 'A sua seção ainda não tem equipe. Cadastre as pessoas em "Minha equipe" antes de fazer a reunião.');
    const id = (await run('insert into reunioes_equipe (empresa_id, secao_id, data, iniciada_em, status, criada_por) values (?,?,?,?,?,?)',
      empresaAtual(), secaoId, hoje(), agoraISO(), 'em_andamento', req.user.id)).lastInsertRowid;
    let ordem = 0;
    for (const c of equipe) {
      await run('insert into reuniao_equipe_participantes (reuniao_id, usuario_id, nome, presente, ordem) values (?,?,?,?,?)', id, c.id, c.nome, c.id === req.user.id ? 1 : 0, ordem++);
    }
    res.status(201);
    return { reuniao: fmt(await reuniaoDe(id)), retomada: false };
  })));

  // ---------- Leitura ----------
  app.get('/api/reunioes-equipe/:id', permit('chefe', 'membro', 'administrador'), h(async (req) => {
    const r = await reuniaoDe(req.params.id);
    const participantes = await participantesDe(r.id);
    if (conduz(req.user, r)) {
      return {
        ...fmt(r), pode_conduzir: true, participantes: participantes.map((p) => ({ ...p, presente: !!p.presente })), decisoes: await decisoesDe(r.id),
        ...(r.status === 'em_andamento' ? { cartoes: await pauta(r, participantes) } : {}),
      };
    }
    const presente = participantes.some((p) => p.usuario_id === req.user.id && p.presente);
    if (r.status !== 'enviada' || !(presente || req.user.perfil === 'administrador')) throw falha(404, 'Reunião da equipe não encontrada.');
    return { ...fmt(r), pode_conduzir: false, participantes: participantes.filter((p) => p.presente).map((p) => ({ usuario_id: p.usuario_id, nome: p.nome, presente: true })), decisoes: await decisoesDe(r.id) };
  }));

  // ---------- Presença e decisões ----------
  app.put('/api/reunioes-equipe/:id/presenca', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const lista = req.body?.presentes;
    if (!Array.isArray(lista)) throw falha(400, 'Informe quem está presente.');
    const presentes = new Set(lista.map(Number));
    const participantes = await participantesDe(r.id);
    for (const p of participantes) await run('update reuniao_equipe_participantes set presente = ? where reuniao_id = ? and usuario_id = ?', presentes.has(p.usuario_id) ? 1 : 0, r.id, p.usuario_id);
    return { ok: true };
  })));

  const responsavelValido = async (r, valor) => {
    if (valor == null || valor === '') return null;
    const id = Number(valor);
    if (!(await q1('select 1 as ok from reuniao_equipe_participantes where reuniao_id = ? and usuario_id = ?', r.id, id))) throw falha(400, 'Escolha o responsável entre os participantes da reunião.');
    return id;
  };
  app.post('/api/reunioes-equipe/:id/decisoes', soChefe, h(async (req, res) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const t = texto(req.body?.texto, 600);
    if (!t) throw falha(400, 'Escreva a decisão.');
    await run('insert into reuniao_equipe_decisoes (reuniao_id, texto, responsavel_id, criada_em, criada_por) values (?,?,?,?,?)', r.id, t, await responsavelValido(r, req.body?.responsavel_id), agoraISO(), req.user.id);
    res.status(201);
    return { ok: true };
  })));
  app.patch('/api/reunioes-equipe/:id/decisoes/:decisaoId', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const d = await q1('select id from reuniao_equipe_decisoes where id = ? and reuniao_id = ?', Number(req.params.decisaoId), r.id);
    if (!d) throw falha(404, 'Decisão não encontrada.');
    const t = texto(req.body?.texto, 600);
    if (!t) throw falha(400, 'Escreva a decisão.');
    const responsavel = 'responsavel_id' in (req.body || {}) ? await responsavelValido(r, req.body.responsavel_id) : undefined;
    if (responsavel === undefined) await run('update reuniao_equipe_decisoes set texto = ? where id = ?', t, d.id);
    else await run('update reuniao_equipe_decisoes set texto = ?, responsavel_id = ? where id = ?', t, responsavel, d.id);
    return { ok: true };
  })));
  app.delete('/api/reunioes-equipe/:id/decisoes/:decisaoId', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    await run('delete from reuniao_equipe_decisoes where id = ? and reuniao_id = ?', Number(req.params.decisaoId), r.id);
    return { ok: true };
  })));

  // ---------- Ata ----------
  async function gerarAta(r) {
    const participantes = await participantesDe(r.id);
    const d = parseISO(r.data);
    const linhas = [`ATA DA REUNIÃO DA EQUIPE — ${r.secao_nome} — ${br(r.data)} (${DIAS[d.getUTCDay()]})`, ''];
    const presentes = participantes.filter((p) => p.presente);
    const ausentes = participantes.filter((p) => !p.presente);
    linhas.push('Participantes:');
    if (presentes.length) presentes.forEach((p) => linhas.push(`- ${p.nome}${p.secao_sigla ? ` (${p.secao_sigla})` : ''}`));
    else linhas.push('- Presença não registrada.');
    linhas.push('');
    if (ausentes.length) { linhas.push('Ausentes:'); ausentes.forEach((p) => linhas.push(`- ${p.nome}`)); linhas.push(''); }
    const cartoes = (await pauta(r, participantes)).filter((c) => c.abertas > 0);
    linhas.push('Situação das ações em aberto:');
    if (cartoes.length) {
      cartoes.forEach((c) => linhas.push(`- ${c.nome}: ${c.abertas} em aberto, ${c.atrasadas} atrasada(s), ${c.vencem} vencendo em até 2 dias, ${c.paradas} sem atualização há ${DIAS_SEM_MOVIMENTO}+ dias.`));
    } else linhas.push('- Nenhuma ação em aberto.');
    linhas.push('');
    const decisoes = await decisoesDe(r.id);
    linhas.push('Decisões:');
    if (decisoes.length) decisoes.forEach((x) => linhas.push(`- ${x.texto}${x.responsavel_nome ? ` (responsável: ${x.responsavel_nome})` : ''}`));
    else linhas.push('- Nenhuma decisão registrada.');
    return linhas.join('\n');
  }

  app.post('/api/reunioes-equipe/:id/encerrar', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const ata = await gerarAta(r);
    await run(`update reunioes_equipe set status = 'rascunho', encerrada_em = ?, ata_texto = ? where id = ? and empresa_id = ?`, agoraISO(), ata, r.id, empresaAtual());
    return fmt(await reuniaoDe(r.id));
  })));
  app.post('/api/reunioes-equipe/:id/reabrir', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    if (r.status !== 'rascunho') throw falha(409, 'Só é possível reabrir uma reunião cuja ata ainda está em rascunho.');
    if (await q1(`select 1 as ok from reunioes_equipe where secao_id = ? and status = 'em_andamento' and empresa_id = ?`, r.secao_id, empresaAtual())) throw falha(409, 'Já existe outra reunião em andamento na sua seção.');
    await run(`update reunioes_equipe set status = 'em_andamento', encerrada_em = null where id = ? and empresa_id = ?`, r.id, empresaAtual());
    return fmt(await reuniaoDe(r.id));
  })));
  app.put('/api/reunioes-equipe/:id/ata', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    if (r.status === 'em_andamento') throw falha(409, 'A ata só existe depois que a reunião é encerrada.');
    const t = texto(req.body?.ata_texto, 20000);
    if (!t) throw falha(400, 'A ata não pode ficar vazia.');
    if (req.body?.ata_base !== undefined && req.body.ata_base !== r.ata_texto) throw falha(409, 'A ata foi alterada por outra pessoa. Recarregue antes de salvar.');
    await run('update reunioes_equipe set ata_texto = ? where id = ? and empresa_id = ?', t, r.id, empresaAtual());
    return fmt(await reuniaoDe(r.id));
  })));
  app.post('/api/reunioes-equipe/:id/enviar-ata', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    if (r.status !== 'rascunho') throw falha(409, 'A ata precisa estar em rascunho para ser enviada.');
    await run(`update reunioes_equipe set status = 'enviada', enviada_em = ? where id = ? and empresa_id = ?`, agoraISO(), r.id, empresaAtual());
    return fmt(await reuniaoDe(r.id));
  })));
  app.delete('/api/reunioes-equipe/:id', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    await run('delete from reuniao_equipe_decisoes where reuniao_id = ?', r.id);
    await run('delete from reuniao_equipe_participantes where reuniao_id = ?', r.id);
    await run('delete from reunioes_equipe where id = ? and empresa_id = ?', r.id, empresaAtual());
    return { ok: true, id: r.id };
  })));
}
