// Reunião do chefe com a equipe da própria seção (membros, suplentes e chefes das subseções), com a mesma estrutura da reunião do
// Diretor (`reunioes.js`): Modo Reunião com visão geral e um cartão por pessoa, presença, decisões, informações, ações criadas ao
// vivo, ata em rascunho, revisão e envio. Tem tabelas próprias (`reunioes_equipe`, migrações 29 e 30) e cada seção tem no máximo
// uma reunião em andamento.
//   - Conduz (inicia, registra, encerra, edita e envia a ata): o chefe da seção, titular ou suplente (`user.secao_id` = seção da reunião).
//   - Lê a ata enviada: quem esteve presente (membro ou chefe), o chefe de uma seção acima (as atas das subseções abaixo dele) e o
//     Administrador. O Diretor e o Apoio não leem estas atas.
import { subarvore } from './db.js';
import { empresaAtual } from './empresa.js';
import { falha, h, marks, permit, texto } from './helpers.js';
import { DIAS_SEM_MOVIMENTO, addDays, br, ehISO, parseISO } from './logic.js';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const ORDEM_SITUACAO = { atrasada: 0, vence: 1, parada: 2, normal: 3 };
const ORDEM_COR = { vermelho: 0, amarelo: 1, verde: 2 };
const PRIO = { alta: 'alta', media: 'média', baixa: 'baixa' };

export function rotasReunioesEquipe(app, { db, q, q1, run, agoraISO, hoje }) {
  const conduz = (user, r) => user.perfil === 'chefe' && !!user.secao_id && user.secao_id === r.secao_id;
  const soChefe = permit('chefe');
  const travar = async () => { if (db.isPg) await q1('select pg_advisory_xact_lock(7319, 3)'); };

  const reuniaoDe = async (id) => {
    const r = await q1(`select r.*, s.nome as secao_nome, s.sigla as secao_sigla, s.tipo as secao_tipo from reunioes_equipe r join secoes s on s.id = r.secao_id
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
  const fmt = (r) => ({ id: r.id, secao_id: r.secao_id, secao_nome: r.secao_nome, secao_sigla: r.secao_sigla, secao_tipo: r.secao_tipo, data: r.data, status: r.status,
    iniciada_em: r.iniciada_em, encerrada_em: r.encerrada_em, enviada_em: r.enviada_em, ata_texto: r.ata_texto, proxima_em: r.proxima_em ?? null });

  /** Quem pode participar: membros, suplentes e chefes das subseções da árvore da seção (e o próprio chefe), ativos. */
  const candidatos = async (secaoId) => {
    const ids = await subarvore(db, secaoId);
    return q(`select u.id, u.nome, u.perfil, u.secao_id, s.sigla as secao_sigla from usuarios u join secoes s on s.id = u.secao_id
      where u.empresa_id = ? and u.ativo = 1 and u.perfil in ('membro', 'chefe') and u.secao_id in (${marks(ids)})
      order by case when u.secao_id = ? then 0 else 1 end, case when u.perfil = 'chefe' then 0 else 1 end, u.nome, u.id`, empresaAtual(), ...ids, secaoId);
  };

  // Um cartão por pessoa, como o cartão de cada seção na reunião do Diretor: o que fez, o que vem, impedimentos, apoio e as ações.
  const pauta = async (r, participantes) => {
    const ids = await subarvore(db, r.secao_id);
    const dia = hoje();
    const ate2 = addDays(dia, 2);
    const ate7 = addDays(dia, 7);
    const limiteParada = addDays(dia, -(DIAS_SEM_MOVIMENTO - 1));
    const inicio = (await q1('select max(data) as d from reunioes_equipe where secao_id = ? and empresa_id = ? and id != ? and data < ?', r.secao_id, empresaAtual(), r.id, r.data))?.d || addDays(r.data, -7);
    const [abertas, feitas, imps] = await Promise.all([
      q(`select a.id, a.titulo, a.prazo, a.status, a.responsavel_id, s.sigla as secao_sigla, substr(coalesce(a.movimentada_em, a.criada_em), 1, 10) as movimento
        from acoes a join secoes s on s.id = a.secao_id
        where a.empresa_id = ? and a.secao_id in (${marks(ids)}) and a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0
        order by a.prazo, a.id`, empresaAtual(), ...ids),
      q(`select a.id, a.titulo, a.responsavel_id, a.concluida_em from acoes a
        where a.empresa_id = ? and a.secao_id in (${marks(ids)}) and a.status = 'concluida' and a.concluida_em is not null and substr(a.concluida_em, 1, 10) >= ?
        order by a.concluida_em, a.id`, empresaAtual(), ...ids, inicio),
      q(`select i.id, i.descricao, i.critico, i.apoio, a.id as acao_id, a.titulo as acao_titulo, a.responsavel_id
        from impedimentos i join acoes a on a.id = i.acao_id
        where a.empresa_id = ? and a.secao_id in (${marks(ids)}) and i.resolvido_em is null and a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0
        order by i.critico desc, i.id`, empresaAtual(), ...ids),
    ]);
    const marcar = (a) => ({
      id: a.id, titulo: a.titulo, prazo: a.prazo, status: a.status, secao_sigla: a.secao_sigla,
      situacao: a.prazo < dia ? 'atrasada' : a.prazo <= ate2 ? 'vence' : a.movimento < limiteParada ? 'parada' : 'normal',
    });
    const montar = (base, acoesBrutas, feitasDe, impsDe) => {
      const acoes = acoesBrutas.map(marcar).sort((x, y) => ORDEM_SITUACAO[x.situacao] - ORDEM_SITUACAO[y.situacao]);
      const atrasadas = acoes.filter((a) => a.situacao === 'atrasada').length;
      const vencem = acoes.filter((a) => a.situacao === 'vence').length;
      const paradas = acoes.filter((a) => a.situacao === 'parada').length;
      const critico = impsDe.some((i) => i.critico);
      return {
        ...base, abertas: acoes.length, atrasadas, vencem, paradas, acoes,
        cor: atrasadas || critico ? 'vermelho' : vencem || paradas || impsDe.length ? 'amarelo' : 'verde',
        feitas: feitasDe.map((a) => ({ id: a.id, titulo: a.titulo, concluida_em: a.concluida_em })),
        proximas: acoes.filter((a) => a.situacao !== 'atrasada' && a.prazo <= ate7).map(({ id, titulo, prazo }) => ({ id, titulo, prazo })),
        impedimentos: impsDe.map((i) => ({ id: i.id, acao_id: i.acao_id, acao_titulo: i.acao_titulo, descricao: i.descricao, critico: !!i.critico, apoio: i.apoio || null })),
        apoios: impsDe.filter((i) => i.apoio).map((i) => ({ acao_titulo: i.acao_titulo, apoio: i.apoio })),
      };
    };
    const doParticipante = new Set(participantes.map((p) => p.usuario_id));
    const cartoes = participantes.map((p) => montar(
      { usuario_id: p.usuario_id, nome: p.nome, secao_sigla: p.secao_sigla || null, presente: !!p.presente },
      abertas.filter((a) => a.responsavel_id === p.usuario_id), feitas.filter((a) => a.responsavel_id === p.usuario_id), imps.filter((i) => i.responsavel_id === p.usuario_id)));
    const semDono = (x) => x.responsavel_id == null || !doParticipante.has(x.responsavel_id);
    const extra = montar({ usuario_id: null, nome: 'Sem responsável na reunião', secao_sigla: null, presente: true }, abertas.filter(semDono), feitas.filter(semDono), imps.filter(semDono));
    if (extra.abertas || extra.feitas.length || extra.impedimentos.length) cartoes.push(extra);
    // Em ordem de necessidade, como na reunião do Diretor: quem está presente e mais precisa de atenção vem primeiro.
    return cartoes.map((c, i) => ({ c, i })).sort((x, y) => (Number(!x.c.presente) - Number(!y.c.presente)) || (ORDEM_COR[x.c.cor] - ORDEM_COR[y.c.cor]) || (x.i - y.i)).map((x) => x.c);
  };

  const participantesDe = (reuniaoId) => q(`select p.usuario_id, p.nome, p.presente, p.ordem, u.perfil, s.sigla as secao_sigla
    from reuniao_equipe_participantes p join usuarios u on u.id = p.usuario_id left join secoes s on s.id = u.secao_id
    where p.reuniao_id = ? order by p.ordem, p.usuario_id`, reuniaoId);
  const decisoesDe = (reuniaoId) => q(`select d.id, d.texto, d.responsavel_id, u.nome as responsavel_nome, d.criada_em
    from reuniao_equipe_decisoes d left join usuarios u on u.id = d.responsavel_id where d.reuniao_id = ? order by d.id`, reuniaoId);
  const informacoesDe = (reuniaoId) => q('select id, texto, criada_em from reuniao_equipe_informacoes where reuniao_id = ? order by id', reuniaoId);
  const novasAcoesDe = (reuniaoId) => q(`select a.id, a.titulo, a.prazo, a.prioridade, u.nome as responsavel_nome from reuniao_equipe_acoes x
    join acoes a on a.id = x.acao_id left join usuarios u on u.id = a.responsavel_id where x.reuniao_id = ? and a.empresa_id = ? order by a.id`, reuniaoId, empresaAtual());

  /** A reunião e tudo o que foi registrado nela (para a condução, a ata e o histórico). */
  const completa = async (r, participantes) => ({
    ...fmt(r), pode_conduzir: true, participantes: participantes.map((p) => ({ ...p, presente: !!p.presente })),
    decisoes: await decisoesDe(r.id), informacoes: await informacoesDe(r.id), novas_acoes: await novasAcoesDe(r.id),
  });

  // ---------- Lista ----------
  app.get('/api/reunioes-equipe', permit('chefe', 'membro', 'administrador'), h(async (req) => {
    const u = req.user;
    const propria = u.perfil !== 'membro' && u.secao_id ? u.secao_id : 0;
    // O chefe lê também as atas enviadas das subseções abaixo dele; o membro, só as das reuniões de que participou.
    const abaixo = propria ? await subarvore(db, propria) : [0];
    const linhas = await q(`select r.id, r.secao_id, s.sigla as secao_sigla, s.nome as secao_nome, s.tipo as secao_tipo, s.ordem as secao_ordem, r.data, r.status, r.iniciada_em, r.encerrada_em, r.enviada_em,
        (select count(*) from reuniao_equipe_decisoes d where d.reuniao_id = r.id) as decisoes,
        (select count(*) from reuniao_equipe_participantes p where p.reuniao_id = r.id and p.presente = 1) as presentes
      from reunioes_equipe r join secoes s on s.id = r.secao_id
      where r.empresa_id = ? and (r.secao_id = ?
        or (r.status = 'enviada' and r.secao_id in (${marks(abaixo)}))
        or (r.status = 'enviada' and exists (select 1 from reuniao_equipe_participantes p where p.reuniao_id = r.id and p.usuario_id = ? and p.presente = 1)))
      order by r.data desc, r.id desc limit 100`, empresaAtual(), propria, ...abaixo, u.id);
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
      return { ...(await completa(r, participantes)), ...(r.status === 'em_andamento' ? { cartoes: await pauta(r, participantes) } : {}) };
    }
    const presente = participantes.some((p) => p.usuario_id === req.user.id && p.presente);
    const acima = req.user.perfil === 'chefe' && req.user.secao_id ? (await subarvore(db, req.user.secao_id)).includes(r.secao_id) : false;
    if (r.status !== 'enviada' || !(presente || acima || req.user.perfil === 'administrador')) throw falha(404, 'Reunião da equipe não encontrada.');
    return {
      ...fmt(r), pode_conduzir: false, participantes: participantes.filter((p) => p.presente).map((p) => ({ usuario_id: p.usuario_id, nome: p.nome, presente: true })),
      decisoes: await decisoesDe(r.id), informacoes: await informacoesDe(r.id), novas_acoes: await novasAcoesDe(r.id),
    };
  }));

  // ---------- Presença, data da próxima reunião, decisões, informações e ações ----------
  app.put('/api/reunioes-equipe/:id/presenca', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const lista = req.body?.presentes;
    if (!Array.isArray(lista)) throw falha(400, 'Informe quem está presente.');
    const presentes = new Set(lista.map(Number));
    const participantes = await participantesDe(r.id);
    for (const p of participantes) await run('update reuniao_equipe_participantes set presente = ? where reuniao_id = ? and usuario_id = ?', presentes.has(p.usuario_id) ? 1 : 0, r.id, p.usuario_id);
    return { ok: true };
  })));

  app.patch('/api/reunioes-equipe/:id', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    if (r.status === 'enviada') throw falha(409, 'A ata já foi enviada.');
    const b = req.body || {};
    if (!('proxima_em' in b)) throw falha(400, 'Informe a data da próxima reunião.');
    const d = b.proxima_em === '' ? null : b.proxima_em;
    if (d !== null && (!ehISO(d) || d < r.data)) throw falha(400, 'A próxima reunião não pode ser anterior a esta.');
    await run('update reunioes_equipe set proxima_em = ? where id = ? and empresa_id = ?', d, r.id, empresaAtual());
    return fmt(await reuniaoDe(r.id));
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

  app.post('/api/reunioes-equipe/:id/informacoes', soChefe, h(async (req, res) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const t = texto(req.body?.texto, 2000);
    if (!t) throw falha(400, 'Escreva a informação.');
    await run('insert into reuniao_equipe_informacoes (reuniao_id, texto, criada_em, criada_por) values (?,?,?,?)', r.id, t, agoraISO(), req.user.id);
    res.status(201);
    return { ok: true };
  })));
  app.patch('/api/reunioes-equipe/:id/informacoes/:infoId', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const i = await q1('select id from reuniao_equipe_informacoes where id = ? and reuniao_id = ?', Number(req.params.infoId), r.id);
    if (!i) throw falha(404, 'Informação não encontrada.');
    const t = texto(req.body?.texto, 2000);
    if (!t) throw falha(400, 'Escreva a informação.');
    await run('update reuniao_equipe_informacoes set texto = ? where id = ?', t, i.id);
    return { ok: true };
  })));
  app.delete('/api/reunioes-equipe/:id/informacoes/:infoId', soChefe, h(async (req) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    await run('delete from reuniao_equipe_informacoes where id = ? and reuniao_id = ?', Number(req.params.infoId), r.id);
    return { ok: true };
  })));

  // Liga à reunião uma ação criada nela (a tela cria a ação por POST /api/acoes e informa o id): a ata lista as novas ações.
  app.post('/api/reunioes-equipe/:id/acoes', soChefe, h(async (req, res) => comReuniao(req.params.id, req.user, async (r) => {
    emAndamento(r);
    const ids = await subarvore(db, r.secao_id);
    const a = await q1(`select id, criado_por from acoes where id = ? and empresa_id = ? and secao_id in (${marks(ids)})`, Number(req.body?.acao_id), empresaAtual(), ...ids);
    if (!a || a.criado_por !== req.user.id) throw falha(404, 'Ação não encontrada entre as que você criou na sua seção.');
    if (!(await q1('select 1 as ok from reuniao_equipe_acoes where reuniao_id = ? and acao_id = ?', r.id, a.id))) await run('insert into reuniao_equipe_acoes (reuniao_id, acao_id) values (?,?)', r.id, a.id);
    res.status(201);
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
    const cartoes = await pauta(r, participantes);
    const comAcoes = cartoes.filter((c) => c.abertas > 0);
    linhas.push('Situação das ações em aberto:');
    if (comAcoes.length) {
      comAcoes.forEach((c) => linhas.push(`- ${c.nome}: ${c.abertas} em aberto, ${c.atrasadas} atrasada(s), ${c.vencem} vencendo em até 2 dias, ${c.paradas} sem atualização há ${DIAS_SEM_MOVIMENTO}+ dias.`));
    } else linhas.push('- Nenhuma ação em aberto.');
    linhas.push('');
    const decisoes = await decisoesDe(r.id);
    linhas.push('Decisões:');
    if (decisoes.length) decisoes.forEach((x) => linhas.push(`- ${x.texto}${x.responsavel_nome ? ` (responsável: ${x.responsavel_nome})` : ''}`));
    else linhas.push('- Nenhuma decisão registrada.');
    linhas.push('');
    const novas = await novasAcoesDe(r.id);
    linhas.push('Novas ações:');
    if (novas.length) novas.forEach((a) => linhas.push(`- ${a.titulo}${a.responsavel_nome ? ` [${a.responsavel_nome}]` : ''} — prazo ${br(a.prazo)} — prioridade ${PRIO[a.prioridade] || a.prioridade}`));
    else linhas.push('- Nenhuma ação nova.');
    linhas.push('');
    const infos = await informacoesDe(r.id);
    linhas.push('Informações:');
    if (infos.length) infos.forEach((i) => linhas.push(`- ${i.texto}`));
    else linhas.push('- Nenhuma informação registrada.');
    linhas.push('');
    // Impedimentos críticos ainda abertos ficam registrados para a próxima reunião.
    const criticos = cartoes.flatMap((c) => c.impedimentos.filter((i) => i.critico));
    if (criticos.length) {
      linhas.push('Impedimentos críticos em aberto:');
      criticos.forEach((i) => linhas.push(`- "${i.acao_titulo}": ${i.descricao}${i.apoio ? ` (apoio solicitado: ${i.apoio})` : ''}`));
      linhas.push('');
    }
    if (r.proxima_em) linhas.push(`Próxima reunião: ${DIAS[parseISO(r.proxima_em).getUTCDay()]}, ${br(r.proxima_em)}.`);
    return linhas.join('\n').trimEnd();
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
    for (const tabela of ['reuniao_equipe_decisoes', 'reuniao_equipe_informacoes', 'reuniao_equipe_acoes', 'reuniao_equipe_participantes']) await run(`delete from ${tabela} where reuniao_id = ?`, r.id);
    await run('delete from reunioes_equipe where id = ? and empresa_id = ?', r.id, empresaAtual());
    return { ok: true, id: r.id };
  })));
}
