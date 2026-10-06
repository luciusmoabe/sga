import { falha, h, permit, texto } from './helpers.js';
import { integrarRegistrosAta } from './ata-registros.js';

// Todas as alterações usam a mesma transação e trava do ciclo da reunião.
export function registrosReuniao(app, { q, q1, run, agoraISO, comReuniao }) {
  const gestao = permit('diretor', 'apoio', 'administrador');
  const publicada = (r) => { if (r.status !== 'enviada') throw falha(409, 'A ata ainda não foi publicada.'); };
  const participantes = (id) => q('select usuario_id, nome, secao_nome from reuniao_participantes where reuniao_id = ? order by ordem, usuario_id', id);
  const informacoes = (id) => q('select * from reuniao_informacoes where reuniao_id = ? order by id', id);
  const sugestoes = (id) => q(`select a.*, u.nome usuario_nome, v.nome respondida_por_nome from ata_sugestoes a
    join usuarios u on u.id = a.usuario_id left join usuarios v on v.id = a.respondida_por where a.reuniao_id = ? order by a.id`, id);
  const podeSugerir = async (user, r) => r.status === 'enviada' && user.perfil === 'chefe'
    && !!(await q1('select 1 from reuniao_participantes where reuniao_id = ? and usuario_id = ?', r.id, user.id));
  const complemento = async (user, r) => ({
    participantes: await participantes(r.id), informacoes: await informacoes(r.id),
    sugestoes: r.status === 'enviada' ? await sugestoes(r.id) : [],
    pode_sugerir: await podeSugerir(user, r),
    revisoes: r.status === 'enviada' ? await q(`select a.id, a.ata_texto, a.criada_em, u.nome criado_por_nome from ata_revisoes a
      left join usuarios u on u.id = a.criado_por where a.reuniao_id = ? order by a.id desc`, r.id) : [],
  });
  const registrarVersao = (r, user, t) => run('insert into ata_revisoes (reuniao_id, ata_texto, criado_por, criada_em) values (?,?,?,?)', r.id, t, user.id, agoraISO());
  const integrarAta = async (r, req) => {
    if (r.status === 'em_andamento') return;
    if (req.body?.ata_texto !== undefined && req.body.ata_base === undefined) throw falha(400, 'Informe a versão da ata antes de salvar as edições.');
    if (req.body?.ata_base !== undefined && req.body.ata_base !== r.ata_texto) throw falha(409, 'A ata foi alterada por outra pessoa. Recarregue antes de salvar os registros.');
    const base = req.body?.ata_texto === undefined ? r.ata_texto : texto(req.body.ata_texto, 20000);
    if (!base) throw falha(400, 'A ata não pode ficar vazia.');
    const nova = integrarRegistrosAta(base, await participantes(r.id), await informacoes(r.id));
    if (nova.length > 20000) throw falha(400, 'A ata ultrapassou o limite de 20.000 caracteres. Reduza o texto antes de salvar.');
    if (nova === r.ata_texto) return;
    if (r.status === 'enviada') {
      if (!(await q1('select id from ata_revisoes where reuniao_id = ? limit 1', r.id))) await registrarVersao(r, req.user, r.ata_texto);
      await registrarVersao(r, req.user, nova);
    }
    await run('update reunioes set ata_texto = ? where id = ?', nova, r.id);
  };

  app.get('/api/reunioes/:id/candidatos', gestao, h(async (req) => {
    if (!(await q1('select id from reunioes where id = ?', Number(req.params.id)))) throw falha(404, 'Reunião não encontrada.');
    return q(`select u.id, u.nome, s.nome secao_nome from usuarios u
      left join secoes s on s.id = u.secao_id where u.ativo = 1 order by u.nome`);
  }));
  app.put('/api/reunioes/:id/participantes', gestao, h(async (req) => comReuniao(req.params.id, async (r) => {
    const ids = req.body?.usuarios;
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw falha(400, 'Selecione os participantes.');
    const pessoas = [];
    const registrados = await participantes(r.id);
    for (const id of new Set(ids)) {
      const anterior = registrados.find(p => p.usuario_id === id);
      if (anterior) { pessoas.push({ ...anterior, id }); continue; }
      const u = await q1(`select u.id, u.nome, s.nome secao_nome from usuarios u left join secoes s on s.id = u.secao_id where u.id = ? and u.ativo = 1`, id);
      if (!u) throw falha(400, 'Participante inválido.');
      pessoas.push(u);
    }
    await run('delete from reuniao_participantes where reuniao_id = ?', r.id);
    for (let i = 0; i < pessoas.length; i++) {
      const u = pessoas[i];
      await run('insert into reuniao_participantes (reuniao_id, usuario_id, nome, secao_nome, ordem) values (?,?,?,?,?)', r.id, u.id, u.nome, u.secao_nome, i);
    }
    await integrarAta(r, req);
    return { participantes: await participantes(r.id) };
  })));
  app.post('/api/reunioes/:id/informacoes', gestao, h(async (req, res) => comReuniao(req.params.id, async (r) => {
    const t = texto(req.body?.texto, 2000);
    if (!t) throw falha(400, 'Escreva a informação.');
    await run('insert into reuniao_informacoes (reuniao_id, texto, criado_por, criado_em) values (?,?,?,?)', r.id, t, req.user.id, agoraISO());
    await integrarAta(r, req);
    res.status(201);
    return { ok: true };
  })));
  app.patch('/api/reunioes/:id/informacoes/:infoId', gestao, h(async (req) => comReuniao(req.params.id, async (r) => {
    const t = texto(req.body?.texto, 2000);
    if (!t) throw falha(400, 'Escreva a informação.');
    if (!(await q1('select id from reuniao_informacoes where id = ? and reuniao_id = ?', Number(req.params.infoId), r.id))) throw falha(404, 'Informação não encontrada.');
    await run('update reuniao_informacoes set texto = ? where id = ? and reuniao_id = ?', t, Number(req.params.infoId), r.id);
    await integrarAta(r, req);
    return { ok: true };
  })));
  app.delete('/api/reunioes/:id/informacoes/:infoId', gestao, h(async (req) => comReuniao(req.params.id, async (r) => {
    await run('delete from reuniao_informacoes where id = ? and reuniao_id = ?', Number(req.params.infoId), r.id);
    await integrarAta(r, req);
    return { ok: true };
  })));
  app.post('/api/reunioes/:id/sugestoes', permit('chefe'), h(async (req, res) => comReuniao(req.params.id, async (r) => {
    publicada(r);
    if (!(await podeSugerir(req.user, r))) throw falha(403, 'Somente participantes registrados podem sugerir revisões da ata.');
    const tipo = req.body?.tipo;
    const t = texto(req.body?.texto, 2000);
    if (!['correcao', 'inclusao', 'supressao'].includes(tipo) || !t) throw falha(400, 'Informe o tipo e descreva a revisão solicitada.');
    await run('insert into ata_sugestoes (reuniao_id, usuario_id, tipo, texto, criada_em) values (?,?,?,?,?)', r.id, req.user.id, tipo, t, agoraISO());
    res.status(201);
    return { ok: true };
  })));
  app.post('/api/reunioes/:id/sugestoes/:sugestaoId/responder', gestao, h(async (req) => comReuniao(req.params.id, async (r) => {
    publicada(r);
    const s = await q1('select * from ata_sugestoes where id = ? and reuniao_id = ?', Number(req.params.sugestaoId), r.id);
    if (!s) throw falha(404, 'Sugestão não encontrada.');
    if (s.status !== 'pendente') throw falha(409, 'Esta sugestão já foi respondida.');
    const status = req.body?.status;
    const resposta = texto(req.body?.resposta, 2000);
    if (!['acolhida', 'nao_acolhida'].includes(status) || !resposta) throw falha(400, 'Informe o resultado e a resposta ao participante.');
    if (status === 'acolhida' && req.body.ata_texto !== undefined) {
      const t = texto(req.body.ata_texto, 20000);
      if (!t) throw falha(400, 'A ata não pode ficar vazia.');
      if (req.body.ata_base !== r.ata_texto) throw falha(409, 'A ata foi alterada por outra pessoa. Recarregue antes de responder.');
      if (t !== r.ata_texto) {
        if (!(await q1('select id from ata_revisoes where reuniao_id = ? limit 1', r.id))) await registrarVersao(r, req.user, r.ata_texto);
        await registrarVersao(r, req.user, t);
        await run('update reunioes set ata_texto = ? where id = ?', t, r.id);
      }
    }
    await run('update ata_sugestoes set status = ?, resposta = ?, respondida_por = ?, respondida_em = ? where id = ?', status, resposta, req.user.id, agoraISO(), s.id);
    return { ok: true };
  })));
  return { complemento, registrarVersao };
}
