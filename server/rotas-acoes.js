// Rotas de diretrizes, ações e pedidos de novo prazo.
import { subarvore } from './db.js';
import { PRIORIDADES, STATUS, TRANSICOES, ehISO } from './logic.js';
import { falha, h, marks, permit, texto } from './helpers.js';

export function rotasAcoes(app, { db, q, q1, run, agoraISO, hoje }) {
  const visiveisAcoes = async (user) => {
    if (user.perfil === 'administrador') return { where: '1 = 1', params: [] }; // o Administrador consulta tudo, inclusive ações internas
    if (user.perfil !== 'chefe') return { where: '(a.interna = 0 or a.compartilhada = 1)', params: [] };
    const ids = user.secao_id ? await subarvore(db, user.secao_id) : [-1];
    return { where: `a.secao_id in (${marks(ids)})`, params: ids };
  };

  const SELECT_ACAO = `select a.*, s.nome as secao_nome, s.sigla as secao_sigla,
      ua.perfil as autor_perfil,
      d.criado_por as demandado_por_id,
      ud.nome as demandado_por_nome,
      ud.perfil as demandado_por_perfil,
      coalesce(d.criado_em, a.criada_em) as demandado_em,
      d.reuniao_id,
      r.semana as reuniao_semana,
      coalesce((select sum(minutos) from tempo where acao_id = a.id), 0) as tempo_total,
      exists(select 1 from pedidos_prazo p where p.acao_id = a.id and p.status = 'pendente') as pedido_pendente,
      (select count(*) from impedimentos i where i.acao_id = a.id and i.resolvido_em is null) as impedimentos_abertos,
      exists(select 1 from impedimentos i where i.acao_id = a.id and i.resolvido_em is null and i.critico = 1) as impedimento_critico
    from acoes a
    join secoes s on s.id = a.secao_id
    left join usuarios ua on ua.id = a.criado_por
    left join diretrizes d on d.id = a.diretriz_id
    left join usuarios ud on ud.id = d.criado_por
    left join reunioes r on r.id = d.reuniao_id`;
  const acaoOut = (a) => ({
    ...a,
    interna: !!a.interna,
    compartilhada: !!a.compartilhada,
    encerrada: !!a.encerrada,
    arquivada: !!a.arquivada,
    pedido_pendente: !!a.pedido_pendente,
    impedimentos_abertos: Number(a.impedimentos_abertos || 0),
    impedimento_critico: !!a.impedimento_critico,
    atrasada: a.status !== 'concluida' && !a.encerrada && !a.arquivada && a.prazo < hoje(),
    demandada_diretor: !!a.diretriz_id || a.demandado_por_perfil === 'diretor',
    demandado_em: a.demandado_em || a.criada_em,
    demandado_por_nome: a.demandado_por_nome,
    reuniao_semana: a.reuniao_semana,
  });
  const impedimentoOut = (i) => ({ ...i, critico: !!i.critico, aberto: !i.resolvido_em });
  const acaoVisivel = async (user, id) => {
    const v = await visiveisAcoes(user);
    const a = await q1(`${SELECT_ACAO} where a.id = ? and ${v.where}`, id, ...v.params);
    if (!a) throw falha(404, 'Ação não encontrada.');
    return a;
  };
  const podeExcluirAcao = async (user, a) => {
    if (user.perfil === 'administrador') return true;
    if (['diretor','apoio'].includes(user.perfil)) return a.criado_por === user.id || ['diretor','apoio'].includes(a.autor_perfil);
    return user.perfil === 'chefe' && !a.diretriz_id && !!user.secao_id
      && (await subarvore(db,user.secao_id)).includes(a.secao_id);
  };
  const chefeGere = async (user, acao) => {
    if (user.perfil === 'administrador') return; // o Administrador age em qualquer seção
    if (user.perfil !== 'chefe' || !user.secao_id || !(await subarvore(db, user.secao_id)).includes(acao.secao_id)) {
      throw falha(403, 'Somente o chefe da seção responsável pode alterar esta ação.');
    }
  };


  // ---------- Diretrizes e ações ----------
  async function criarDiretriz(user, b, reuniaoId = null) {
    const titulo = texto(b.titulo, 160);
    if (!titulo) throw falha(400, 'Informe o título da ação.');
    if (!ehISO(b.prazo)) throw falha(400, 'Informe o prazo da ação.');
    if (b.prazo < hoje()) throw falha(400, 'O prazo não pode ser anterior a hoje.');
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
    const destino = b.destino === 'todos' ? 'todos' : 'especificos';
    let alvos;
    if (destino === 'todos') {
      alvos = (await q('select id from secoes where pai_id is null and ativa = 1')).map((r) => r.id);
    } else {
      const ids = [...new Set((b.secoes || []).map(Number))];
      const validados = [];
      for (const i of ids) {
        if (await q1('select 1 from secoes where id = ? and pai_id is null and ativa = 1', i)) validados.push(i);
      }
      alvos = validados;
      if (alvos.length !== ids.length) throw falha(400, 'Só Centros e Coordenação ativos podem receber ações do Diretor.');
    }
    if (!alvos.length) throw falha(400, 'Escolha ao menos uma seção para receber a ação.');
    const detalhe = texto(b.detalhe, 2000) || null;
    return await db.transaction(async () => {
      if (reuniaoId !== null) {
        const r = await q1(`select status from reunioes where id = ?${db.isPg ? ' for update' : ''}`, reuniaoId);
        if (!r) throw falha(404, 'Reunião não encontrada.');
        if (r.status !== 'em_andamento') throw falha(409, 'Esta reunião já foi encerrada.');
      }

      const d = (await run(
        'insert into diretrizes (titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (?,?,?,?,?,?,?,?)',
        titulo, detalhe, destino, b.prazo, prioridade, user.id, agoraISO(), reuniaoId,
      )).lastInsertRowid;
      for (const s of alvos) {
        const aId = (await run(
          `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, criada_em, criado_por) values (?,?,?,?,?,?,?,?,?)`,
          d, s, titulo, detalhe, b.prazo, b.prazo, prioridade, agoraISO(), user.id,
        )).lastInsertRowid;
        await run(
          `insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)`,
          aId, user.id, reuniaoId ? 'Ação demandada pelo Diretor na reunião de acompanhamento.' : 'Ação demandada pelo Diretor.', agoraISO(),
        );
      }
      return { id: d, destino, acoes_criadas: alvos.length };
    });
  }

  app.post('/api/diretrizes', permit('diretor', 'apoio', 'administrador'), h(async (req, res) => {
    res.status(201);
    return await criarDiretriz(req.user, req.body || {});
  }));
  app.get('/api/diretrizes', permit('diretor', 'apoio', 'administrador'), h(async () =>
    await q(`select d.*, u.nome as criado_por_nome,
         (select count(*) from acoes a where a.diretriz_id = d.id) total,
         (select count(*) from acoes a where a.diretriz_id = d.id and a.status = 'concluida') concluidas
       from diretrizes d left join usuarios u on u.id = d.criado_por order by d.criado_em desc, d.id desc limit 30`)));

  const STATUS_OK = new Set(STATUS);

  app.get('/api/acoes', h(async (req) => {
    const v = await visiveisAcoes(req.user);
    const where = [v.where];
    const params = [...v.params];
    const f = req.query;
    if (f.secao) {
      const ids = await subarvore(db, Number(f.secao));
      where.push(`a.secao_id in (${marks(ids)})`);
      params.push(...ids);
    }
    if (STATUS_OK.has(f.status)) { where.push('a.status = ?'); params.push(f.status); }
    const sit = f.situacao || 'abertas';
    if (sit === 'arquivadas') {
      where.push('a.arquivada = 1');
    } else {
      where.push('a.arquivada = 0');
      if (sit === 'abertas') where.push(`a.status != 'concluida' and a.encerrada = 0`);
      else if (sit === 'atrasadas') { where.push(`a.status != 'concluida' and a.encerrada = 0 and a.prazo < ?`); params.push(hoje()); }
      else if (sit === 'concluidas') where.push(`a.status = 'concluida' and a.encerrada = 0`);
      else if (sit === 'encerradas') where.push('a.encerrada = 1');
    }
    if (f.q) { where.push('(a.titulo like ? or a.detalhe like ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
    return (await q(`${SELECT_ACAO} where ${where.join(' and ')}
              order by a.encerrada, case a.status when 'concluida' then 1 else 0 end,
                       case when a.status != 'concluida' and a.prazo < '${hoje()}' then 0 else 1 end, a.prazo, a.id`, ...params)).map(acaoOut);
  }));

  app.post('/api/acoes', permit('chefe', 'diretor', 'apoio', 'administrador'), h(async (req, res) => {
    const b = req.body || {};
    const titulo = texto(b.titulo, 140);
    if (!titulo) throw falha(400, 'Informe o título da ação.');
    if (!ehISO(b.prazo)) throw falha(400, 'Informe o prazo da ação.');
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
    const secaoId = req.user.perfil === 'chefe' ? req.user.secao_id : Number(b.secao_id);
    if (!secaoId) throw falha(400, 'Seção não informada.');
    if (!(await q1('select id from secoes where id = ? and ativa = 1', secaoId))) {
      throw falha(409, 'A seção precisa estar ativa para receber ações.');
    }
    const detalhe = texto(b.detalhe, 2000) || null;
    const interna = b.interna !== undefined ? (b.interna ? 1 : 0) : 0;
    res.status(201);
    const id = (await run(
      `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, interna, criada_em, criado_por)
       values (null, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      secaoId, titulo, detalhe, b.prazo, b.prazo, prioridade, interna, agoraISO(), req.user.id,
    )).lastInsertRowid;
    await run(
      'insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      id, req.user.id, `Ação criada pela seção (${req.user.nome}).`, agoraISO(),
    );
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, id));
  }));

  app.delete('/api/acoes/:id', h(async (req) => {
    try {
      return await db.transaction(async () => {
        const a = await acaoVisivel(req.user, Number(req.params.id));
        if (!(await podeExcluirAcao(req.user,a))) throw falha(403,'Diretor e Apoio só podem excluir ações criadas pela gestão. Chefes não podem excluir demandas da direção.');
        if (await q1('select id from acoes where acao_pai_id=?',a.id)) throw falha(409,'Exclua primeiro as ações derivadas desta ação.');
        await run('delete from tempo where acao_id = ?', a.id);
        await run('delete from acao_comentarios where acao_id = ?', a.id);
        await run('delete from impedimentos where acao_id = ?', a.id);
        await run('delete from pedidos_prazo where acao_id = ?', a.id);
        await run('delete from acoes where id = ?', a.id);
        return { ok: true, id: a.id };
      });
    } catch(e) {
      if(e.code==='23503' || String(e.code).startsWith('SQLITE_CONSTRAINT')) throw falha(409,'A ação possui vínculos que impedem a exclusão.');
      throw e;
    }
  }));

  app.post('/api/acoes/:id/arquivar', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (a.diretriz_id && req.user.perfil !== 'administrador') {
      throw falha(403, 'Ações demandadas pelo Diretor não podem ser arquivadas pela seção.');
    }
    await run('update acoes set arquivada = 1 where id = ?', a.id);
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      a.id, req.user.id, 'Ação arquivada.', agoraISO());
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.post('/api/acoes/:id/desarquivar', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (!(await q1('select id from secoes where id = ? and ativa = 1', a.secao_id))) {
      throw falha(409, 'Reative a seção antes de desarquivar a ação.');
    }
    await run('update acoes set arquivada = 0 where id = ?', a.id);
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      a.id, req.user.id, 'Ação desarquivada.', agoraISO());
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.get('/api/acoes/:id', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    return {
      ...acaoOut(a),
      pode_excluir: await podeExcluirAcao(req.user,a),
      comentarios: await q(`select c.*, u.nome as usuario_nome from acao_comentarios c left join usuarios u on u.id = c.usuario_id where c.acao_id = ? order by c.id`, a.id),
      lancamentos: await q(`select t.*, u.nome as usuario_nome from tempo t left join usuarios u on u.id = t.usuario_id where t.acao_id = ? order by t.data desc, t.id desc`, a.id),
      pedidos: await q('select * from pedidos_prazo where acao_id = ? order by id desc', a.id),
      impedimentos: (await q(`select i.*, uc.nome as criado_por_nome, ur.nome as resolvido_por_nome from impedimentos i
        left join usuarios uc on uc.id = i.criado_por left join usuarios ur on ur.id = i.resolvido_por
        where i.acao_id = ? order by i.id desc`, a.id)).map(impedimentoOut),
    };
  }));

  app.patch('/api/acoes/:id', h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');

    const p = req.body?.prioridade;
    if (p !== undefined) {
      if (!PRIORIDADES.includes(p)) throw falha(400, 'Prioridade inválida (use alta, media ou baixa).');
      await run('update acoes set prioridade = ? where id = ?', p, a.id);
    }

    const novo = req.body?.status;
    if (novo !== undefined) {
      if (!STATUS_OK.has(novo)) throw falha(400, 'Status inválido.');
      if (novo !== a.status) {
        if (!TRANSICOES[a.status].includes(novo)) throw falha(409, 'Essa mudança de status não é permitida a partir do status atual.');
        if (novo === 'concluida' && a.tempo_total <= 0) throw falha(422, 'Informe o tempo gasto, em minutos, antes de concluir a ação.');
        await db.transaction(async () => {
          await run('update acoes set status = ?, concluida_em = ? where id = ?', novo, novo === 'concluida' ? agoraISO() : null, a.id);
          // Ação concluída não tem mais o que travar: os impedimentos abertos são encerrados, e o histórico fica.
          if (novo === 'concluida') {
            await run('update impedimentos set resolvido_em = ?, resolvido_por = ?, resolucao = ? where acao_id = ? and resolvido_em is null',
              agoraISO(), req.user.id, 'Ação concluída.', a.id);
          }
          // Voltar para "a fazer" reabre o trabalho do zero: o tempo já registrado não descreve mais o que falta.
          if (novo === 'a_fazer' && a.tempo_total > 0) {
            await run('delete from tempo where acao_id = ?', a.id);
            const h = Math.floor(a.tempo_total / 60), min = a.tempo_total % 60;
            const tempoFmt = h ? `${h} h${min ? ` ${min} min` : ''}` : `${min} min`;
            await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
              a.id, req.user.id, `Status voltou para "a fazer": ${tempoFmt} de tempo registrado foram excluídos.`, agoraISO());
          }
        });
      }
    }
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.post('/api/acoes/:id/tempo', h(async (req, res) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    await chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');
    const minutos = Number(req.body?.minutos);
    if (!Number.isInteger(minutos) || minutos <= 0 || minutos > 1440) throw falha(400, 'Informe o tempo em minutos inteiros, entre 1 e 1440.');
    const data = req.body?.data || hoje();
    if (!ehISO(data) || data > hoje()) throw falha(400, 'A data do lançamento não pode ser futura.');
    await run('insert into tempo (acao_id, usuario_id, data, minutos, criado_em) values (?,?,?,?,?)', a.id, req.user.id, data, minutos, agoraISO());
    res.status(201);
    return acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.post('/api/acoes/:id/comentarios', h(async (req, res) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.texto, 1000);
    if (!t) throw falha(400, 'Escreva o comentário.');
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, t, agoraISO());
    res.status(201);
    return { ok: true };
  }));

  app.post('/api/acoes/:id/pedido-prazo', h(async (req, res) => {
    const id = Number(req.params.id);
    await chefeGere(req.user, await acaoVisivel(req.user, id));
    await db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? for update', id);
      const a = await acaoVisivel(req.user, id);
      await chefeGere(req.user, a);
      if (a.arquivada || a.encerrada) throw falha(409, 'Não é possível pedir prazo para uma ação arquivada ou encerrada.');
      const novo = req.body?.novo_prazo;
      const just = texto(req.body?.justificativa, 600);
      if (!ehISO(novo) || novo <= a.prazo) throw falha(400, 'O novo prazo deve ser posterior ao prazo atual.');
      if (!just) throw falha(400, 'Explique o motivo do novo prazo.');
      if (a.pedido_pendente) throw falha(409, 'Já existe um pedido de novo prazo aguardando decisão.');
      await run('insert into pedidos_prazo (acao_id, usuario_id, prazo_atual, novo_prazo, justificativa, criado_em) values (?,?,?,?,?,?)',
        a.id, req.user.id, a.prazo, novo, just, agoraISO());
    });
    res.status(201);
    return { ok: true };
  }));

  // ---------- Impedimentos da ação ----------
  // Histórico com ciclo aberto → resolvido; nunca editado nem excluído (correção = resolver e registrar outro).
  // O chefe age na própria árvore; Diretor, Apoio e Administrador, em qualquer ação que possam ver.
  const perfisImpedimento = permit('chefe', 'diretor', 'apoio', 'administrador');
  const podeAgirNoImpedimento = async (user, acao) => { if (user.perfil === 'chefe') await chefeGere(user, acao); };

  app.post('/api/acoes/:id/impedimentos', perfisImpedimento, h(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const descricao = texto(b.descricao, 600);
    if (!descricao) throw falha(400, 'Descreva o impedimento.');
    const apoio = texto(b.apoio, 600) || null;
    const critico = b.critico ? 1 : 0;
    const out = await db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? for update', id);
      const a = await acaoVisivel(req.user, id);
      await podeAgirNoImpedimento(req.user, a);
      if (a.encerrada || a.arquivada) throw falha(409, 'Ação arquivada ou encerrada não recebe impedimentos.');
      if (a.status === 'concluida') throw falha(409, 'Uma ação concluída não recebe impedimentos.');
      if (b.bloquear && a.status !== 'bloqueada') {
        if (!TRANSICOES[a.status].includes('bloqueada')) {
          throw falha(409, 'Para bloquear, a ação precisa estar em andamento. Inicie a ação ou registre o impedimento sem bloquear.');
        }
        await run("update acoes set status = 'bloqueada' where id = ?", a.id);
      }
      const iid = (await run(
        'insert into impedimentos (acao_id, descricao, critico, apoio, criado_em, criado_por) values (?,?,?,?,?,?)',
        a.id, descricao, critico, apoio, agoraISO(), req.user.id,
      )).lastInsertRowid;
      await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id,
        `Impedimento registrado${critico ? ' (crítico)' : ''}${b.bloquear ? ', ação bloqueada' : ''}: ${descricao}`, agoraISO());
      return {
        impedimento: impedimentoOut(await q1('select * from impedimentos where id = ?', iid)),
        acao: acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, a.id)),
      };
    });
    res.status(201);
    return out;
  }));

  app.post('/api/acoes/:id/impedimentos/:iid/resolver', perfisImpedimento, h(async (req) => {
    const id = Number(req.params.id);
    const iid = Number(req.params.iid);
    const resolucao = texto(req.body?.resolucao, 600) || null;
    return db.transaction(async () => {
      if (db.isPg) await q1('select id from acoes where id = ? for update', id);
      const a = await acaoVisivel(req.user, id);
      await podeAgirNoImpedimento(req.user, a);
      const imp = await q1('select * from impedimentos where id = ? and acao_id = ?', iid, a.id);
      if (!imp) throw falha(404, 'Impedimento não encontrado.');
      if (imp.resolvido_em) throw falha(409, 'Este impedimento já foi resolvido.');
      const r = await run('update impedimentos set resolvido_em = ?, resolvido_por = ?, resolucao = ? where id = ? and resolvido_em is null',
        agoraISO(), req.user.id, resolucao, imp.id);
      if (!r.changes) throw falha(409, 'Este impedimento já foi resolvido. Atualize a tela.');
      const retomar = !!req.body?.retomar && a.status === 'bloqueada' && !a.encerrada && !a.arquivada;
      if (retomar) await run("update acoes set status = 'em_andamento' where id = ?", a.id);
      await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id,
        `Impedimento resolvido${resolucao ? `: ${resolucao}` : ''}${retomar ? '. Ação retomada (em andamento).' : ''}`, agoraISO());
      return {
        impedimento: impedimentoOut(await q1('select * from impedimentos where id = ?', imp.id)),
        acao: acaoOut(await q1(`${SELECT_ACAO} where a.id = ?`, a.id)),
      };
    });
  }));

  app.post('/api/acoes/:id/encerrar', permit('diretor', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    if (a.status !== 'concluida') throw falha(409, 'Só é possível encerrar uma ação concluída.');
    await run('update acoes set encerrada = 1 where id = ?', a.id);
    return { ok: true };
  }));
  app.post('/api/acoes/:id/devolver', permit('diretor', 'administrador'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.comentario, 1000);
    if (!t) throw falha(400, 'Explique o que falta para a ação ser aceita.');
    if (a.status !== 'concluida') throw falha(409, 'Só é possível devolver uma ação concluída.');
    await run(`update acoes set status = 'em_andamento', concluida_em = null, encerrada = 0 where id = ?`, a.id);
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, `Devolvida pel${req.user.perfil === 'administrador' ? 'o Administrador' : 'o Diretor'}: ${t}`, agoraISO());
    return { ok: true };
  }));

  // ---------- Pedidos de novo prazo ----------
  app.get('/api/pedidos-prazo', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
    const st = req.query.status === 'todos' ? null : 'pendente';
    return await q(`select p.*, a.titulo as acao_titulo, a.secao_id, s.nome as secao_nome, s.sigla as secao_sigla, u.nome as usuario_nome
              from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id
              left join usuarios u on u.id = p.usuario_id
              where (${req.user.perfil === 'administrador' ? '1 = 1' : 'a.interna = 0 or a.compartilhada = 1'}) ${st ? `and p.status = '${st}' and a.arquivada = 0 and a.encerrada = 0` : ''}
              order by p.criado_em desc`);
  }));
  app.post('/api/pedidos-prazo/:id/decidir', permit('diretor', 'apoio', 'administrador'), h(async (req) => {
    const id = Number(req.params.id);
    const todas = req.user.perfil === 'administrador'; // vê também as ações internas das subseções
    const filtro = todas ? '1 = 1' : 'a.interna = 0 or a.compartilhada = 1';
    const visivel = await q1(`select p.acao_id from pedidos_prazo p join acoes a on a.id = p.acao_id
      where p.id = ? and (${filtro})`, id);
    if (!visivel) throw falha(404, 'Pedido não encontrado.');
    return db.transaction(async () => {
      // Criar pedido e decidir pedido adquirem a mesma trava, sempre na ação.
      if (db.isPg) await q1('select id from acoes where id = ? for update', visivel.acao_id);
      const p = await q1(`select p.*, a.arquivada, a.encerrada, a.prazo from pedidos_prazo p join acoes a on a.id = p.acao_id
        where p.id = ? and (${filtro})`, id);
      if (!p) throw falha(404, 'Pedido não encontrado.');
      if (p.arquivada || p.encerrada) throw falha(409, 'Não é possível decidir prazo de uma ação arquivada ou encerrada.');
      if (p.status !== 'pendente') throw falha(409, 'Este pedido já foi decidido.');
      let reuniaoId = null;
      if (req.body?.reuniao_id) {
        const r = await q1(`select id from reunioes where id = ? and status = 'em_andamento'${db.isPg ? ' for update' : ''}`, Number(req.body.reuniao_id));
        if (!r) throw falha(409, 'A reunião informada não está em andamento.');
        reuniaoId = r.id;
      }
      if (req.user.perfil === 'apoio' && !reuniaoId) {
        throw falha(403, 'Somente o Diretor decide pedidos de prazo; o Apoio pode registrar a decisão durante a reunião.');
      }
      const aprovar = req.body?.aprovar;
      if (typeof aprovar !== 'boolean') throw falha(400, 'Informe se o pedido deve ser aprovado ou recusado.');
      if (aprovar && p.prazo !== p.prazo_atual) throw falha(409, 'O prazo da ação mudou. Recuse este pedido e solicite um novo.');
      const alterado = await run(`update pedidos_prazo set status = ?, decidido_em = ?, decidido_por = ?, reuniao_id = ?
        where id = ? and status = 'pendente'`,
        aprovar ? 'aprovado' : 'recusado', agoraISO(), req.user.id, reuniaoId, p.id);
      if (!alterado.changes) throw falha(409, 'Este pedido já foi decidido. Atualize a tela.');
      if (aprovar) await run('update acoes set prazo = ? where id = ?', p.novo_prazo, p.acao_id);
      return { ok: true, status: aprovar ? 'aprovado' : 'recusado' };
    });
  }));

  return { criarDiretriz, SELECT_ACAO, acaoOut };
}
