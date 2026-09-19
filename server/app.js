import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subarvore, nivel } from './db.js';
import {
  DIA_PADRAO, HORA_PADRAO, HORA_CORTE_PADRAO, LIMITE_NIVEIS, PRIORIDADES, TRANSICOES,
  agora, ehISO, ehDiaReuniao, fechamentoDe, hojeISO, refDiaReuniao,
} from './logic.js';
import { atualizacaoDe, cartoesReuniao, falha, h, marks, painelSemana, permit, texto, ultimaAtualizacao } from './helpers.js';
import { rotasReunioes } from './reunioes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(path.join(raiz, 'public')));

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const q1 = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const agoraISO = () => agora().toISOString();

  // ---------- Entrada simulada (protótipo): escolhe o usuário; não há senha ----------
  app.get('/api/usuarios-demo', h(() =>
    q(`select u.id, u.nome, u.perfil, u.secao_id, s.nome as secao_nome, s.sigla as secao_sigla
       from usuarios u left join secoes s on s.id = u.secao_id where u.ativo = 1
       order by case u.perfil when 'diretor' then 0 when 'apoio' then 1 else 2 end, u.nome`)));

  app.use('/api', (req, res, next) => {
    if (req.path === '/usuarios-demo') return next();
    const id = Number(req.get('x-user-id'));
    const u = id ? q1('select * from usuarios where id = ? and ativo = 1', id) : null;
    if (!u) return next(falha(401, 'Escolha um usuário para entrar.'));
    req.user = u;
    next();
  });

  const hoje = () => hojeISO();
  /** Lê dia e hora da reunião a partir da config, com fallback para os padrões. */
  const cfgReuniao = () => {
    const c = Object.fromEntries(q('select chave, valor from config').map((r) => [r.chave, r.valor]));
    const dia = c.reuniao_dia != null ? Number(c.reuniao_dia) : DIA_PADRAO;
    const hora = c.reuniao_hora || HORA_PADRAO;
    return { dia, hora };
  };
  const semanaDe = (req) => {
    const { dia } = cfgReuniao();
    const s = req.query.semana || refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    if (!ehDiaReuniao(s, dia)) throw falha(400, `A semana deve ser informada como a data do dia da reunião (AAAA-MM-DD).`);
    return s;
  };
  const cfg = () => Object.fromEntries(q('select chave, valor from config').map((r) => [r.chave, r.valor]));
  const visiveisAcoes = (user) =>
    user.perfil === 'chefe'
      ? (() => {
          const ids = user.secao_id ? subarvore(db, user.secao_id) : [-1];
          return { where: `a.secao_id in (${marks(ids)})`, params: ids };
        })()
      : { where: '(a.interna = 0 or a.compartilhada = 1)', params: [] };

  const SELECT_ACAO = `select a.*, s.nome as secao_nome, s.sigla as secao_sigla,
      d.criado_por as demandado_por_id,
      ud.nome as demandado_por_nome,
      ud.perfil as demandado_por_perfil,
      coalesce(d.criado_em, a.criada_em) as demandado_em,
      d.reuniao_id,
      r.semana as reuniao_semana,
      coalesce((select sum(minutos) from tempo where acao_id = a.id), 0) as tempo_total,
      exists(select 1 from pedidos_prazo p where p.acao_id = a.id and p.status = 'pendente') as pedido_pendente
    from acoes a
    join secoes s on s.id = a.secao_id
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
    atrasada: a.status !== 'concluida' && !a.encerrada && !a.arquivada && a.prazo < hoje(),
    demandada_diretor: !!a.diretriz_id || a.demandado_por_perfil === 'diretor',
    demandado_em: a.demandado_em || a.criada_em,
    demandado_por_nome: a.demandado_por_nome,
    reuniao_semana: a.reuniao_semana,
  });
  const acaoVisivel = (user, id) => {
    const v = visiveisAcoes(user);
    const a = q1(`${SELECT_ACAO} where a.id = ? and ${v.where}`, id, ...v.params);
    if (!a) throw falha(404, 'Ação não encontrada.');
    return a;
  };
  const chefeGere = (user, acao) => {
    if (user.perfil !== 'chefe' || !user.secao_id || !subarvore(db, user.secao_id).includes(acao.secao_id)) {
      throw falha(403, 'Somente o chefe da seção responsável pode alterar esta ação.');
    }
  };

  // ---------- Bootstrap ----------
  app.get('/api/bootstrap', h((req) => {
    const { dia, hora } = cfgReuniao();
    const semana = refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    const secao = req.user.secao_id ? q1('select id, nome, sigla, tipo from secoes where id = ?', req.user.secao_id) : null;
    return {
      user: req.user,
      secao,
      agora: agoraISO(),
      hoje: hoje(),
      semana,
      fechamento: fechamentoDe(semana),
      config: cfg(),
      reuniao_dia: dia,
      reuniao_hora: hora,
    };
  }));

  // ---------- Seções (estrutura em árvore) ----------
  const listaSecoes = (user) => {
    let rows = q(`select s.*, u.nome as chefe_nome from secoes s left join usuarios u on u.id = s.chefe_id order by s.ordem, s.id`);
    if (user.perfil === 'chefe') {
      const ids = new Set(user.secao_id ? subarvore(db, user.secao_id) : []);
      rows = rows.filter((r) => ids.has(r.id));
    }
    const porId = new Map(rows.map((r) => [r.id, r]));
    const nv = (r) => (r.pai_id && porId.has(r.pai_id) ? nv(porId.get(r.pai_id)) + 1 : 1);
    return rows.map((r) => ({ ...r, ativa: !!r.ativa, nivel: nv(r) }));
  };
  app.get('/api/secoes', h((req) => listaSecoes(req.user)));

  const validarChefe = (chefeId) => {
    if (chefeId == null || chefeId === '') return null;
    const u = q1('select * from usuarios where id = ? and ativo = 1 and perfil = ?', Number(chefeId), 'chefe');
    if (!u) throw falha(400, 'O chefe escolhido não existe ou não tem o perfil de chefe.');
    return u.id;
  };
  const atribuirChefe = (secaoId, chefeId) => {
    const atual = q1('select chefe_id from secoes where id = ?', secaoId)?.chefe_id;
    if (atual && atual !== chefeId) run('update usuarios set secao_id = null where id = ? and secao_id = ?', atual, secaoId);
    if (chefeId) {
      run('update secoes set chefe_id = null where chefe_id = ? and id != ?', chefeId, secaoId);
      run('update usuarios set secao_id = ? where id = ?', secaoId, chefeId);
    }
    run('update secoes set chefe_id = ? where id = ?', chefeId, secaoId);
  };

  app.post('/api/secoes', permit('diretor'), h((req, res) => {
    const b = req.body || {};
    const nome = texto(b.nome, 120);
    if (!nome) throw falha(400, 'Informe o nome da seção.');
    if (!['centro', 'coordenacao', 'subsecao'].includes(b.tipo)) throw falha(400, 'Escolha o tipo: Centro, Coordenação ou Subseção.');
    let pai = null;
    if (b.tipo === 'subsecao') {
      pai = q1('select * from secoes where id = ? and ativa = 1', Number(b.pai_id));
      if (!pai) throw falha(400, 'Escolha a seção à qual a subseção ficará ligada.');
      if (nivel(db, pai.id) + 1 > LIMITE_NIVEIS) throw falha(400, `A estrutura aceita até ${LIMITE_NIVEIS} níveis abaixo do Departamento.`);
    } else if (b.pai_id) {
      throw falha(400, 'Centros e Coordenação ficam no primeiro nível.');
    }
    const chefe = validarChefe(b.chefe_id);
    const ordem = (q1('select coalesce(max(ordem), 0) + 1 o from secoes where pai_id is ?', pai?.id ?? null).o);
    const id = run(
      'insert into secoes (nome, sigla, tipo, pai_id, ordem, criada_em) values (?,?,?,?,?,?)',
      nome, texto(b.sigla, 12).toUpperCase() || null, b.tipo, pai?.id ?? null, ordem, agoraISO(),
    ).lastInsertRowid;
    if (chefe) atribuirChefe(id, chefe);
    res.status(201);
    return listaSecoes(req.user).find((s) => s.id === id);
  }));

  app.patch('/api/secoes/:id', permit('diretor'), h((req) => {
    const id = Number(req.params.id);
    const s = q1('select * from secoes where id = ?', id);
    if (!s) throw falha(404, 'Seção não encontrada.');
    const b = req.body || {};
    if ('nome' in b) {
      const nome = texto(b.nome, 120);
      if (!nome) throw falha(400, 'O nome da seção não pode ficar vazio.');
      run('update secoes set nome = ? where id = ?', nome, id);
    }
    if ('sigla' in b) run('update secoes set sigla = ? where id = ?', texto(b.sigla, 12).toUpperCase() || null, id);
    if ('chefe_id' in b) atribuirChefe(id, validarChefe(b.chefe_id));
    if (b.mover === 'cima' || b.mover === 'baixo') {
      const irmas = q('select id from secoes where pai_id is ? order by ordem, id', s.pai_id);
      irmas.forEach((r, i) => run('update secoes set ordem = ? where id = ?', i + 1, r.id));
      const i = irmas.findIndex((r) => r.id === id);
      const j = b.mover === 'cima' ? i - 1 : i + 1;
      if (j >= 0 && j < irmas.length) {
        run('update secoes set ordem = ? where id = ?', j + 1, id);
        run('update secoes set ordem = ? where id = ?', i + 1, irmas[j].id);
      }
    }
    if ('ativa' in b) {
      if (b.ativa) {
        if (s.pai_id && !q1('select 1 from secoes where id = ? and ativa = 1', s.pai_id)) throw falha(409, 'Reative primeiro a seção acima desta.');
        run('update secoes set ativa = 1 where id = ?', id);
      } else {
        if (q1('select 1 from secoes where pai_id = ? and ativa = 1', id)) throw falha(409, 'Desative antes as subseções que ficam abaixo desta seção.');
        const abertas = q1(`select count(*) n from acoes where secao_id = ? and status != 'concluida' and encerrada = 0`, id).n;
        if (abertas > 0) {
          if (b.reatribuir && s.pai_id) {
            run(`update acoes set secao_id = ? where secao_id = ? and status != 'concluida' and encerrada = 0`, s.pai_id, id);
          } else {
            const e = falha(409, s.pai_id
              ? `Esta seção tem ${abertas} ação(ões) aberta(s). Reatribua-as à seção acima para desativar.`
              : `Esta seção tem ${abertas} ação(ões) aberta(s). Conclua ou encerre antes de desativar.`);
            e.extra = { acoes_abertas: abertas, pode_reatribuir: !!s.pai_id };
            throw e;
          }
        }
        run('update secoes set ativa = 0 where id = ?', id);
      }
    }
    return listaSecoes(req.user).find((x) => x.id === id);
  }));

  // ---------- Usuários (cadastro mínimo) ----------
  app.get('/api/usuarios', permit('diretor', 'apoio'), h(() =>
    q(`select u.*, s.nome as secao_nome from usuarios u left join secoes s on s.id = u.secao_id order by u.ativo desc, u.perfil, u.nome`)));
  app.post('/api/usuarios', permit('diretor'), h((req, res) => {
    const b = req.body || {};
    const nome = texto(b.nome, 120);
    if (!nome) throw falha(400, 'Informe o nome.');
    if (!['chefe', 'apoio'].includes(b.perfil)) throw falha(400, 'Escolha o perfil: Chefe ou Apoio.');
    const id = run('insert into usuarios (nome, email, perfil) values (?,?,?)', nome, texto(b.email, 160) || null, b.perfil).lastInsertRowid;
    res.status(201);
    return q1('select * from usuarios where id = ?', id);
  }));
  app.patch('/api/usuarios/:id', permit('diretor'), h((req) => {
    const id = Number(req.params.id);
    const u = q1('select * from usuarios where id = ?', id);
    if (!u) throw falha(404, 'Usuário não encontrado.');
    if (u.perfil === 'diretor') throw falha(400, 'O perfil de Diretor não pode ser alterado aqui.');
    if ('ativo' in (req.body || {})) run('update usuarios set ativo = ? where id = ?', req.body.ativo ? 1 : 0, id);
    return q1('select * from usuarios where id = ?', id);
  }));

  // ---------- Diretrizes e ações ----------
  function criarDiretriz(user, b, reuniaoId = null) {
    const titulo = texto(b.titulo, 160);
    if (!titulo) throw falha(400, 'Informe o título da ação.');
    if (!ehISO(b.prazo)) throw falha(400, 'Informe o prazo da ação.');
    if (b.prazo < hoje()) throw falha(400, 'O prazo não pode ser anterior a hoje.');
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
    const destino = b.destino === 'todos' ? 'todos' : 'especificos';
    let alvos;
    if (destino === 'todos') {
      alvos = q('select id from secoes where pai_id is null and ativa = 1').map((r) => r.id);
    } else {
      const ids = [...new Set((b.secoes || []).map(Number))];
      alvos = ids.filter((i) => q1('select 1 from secoes where id = ? and pai_id is null and ativa = 1', i));
      if (alvos.length !== ids.length) throw falha(400, 'Só Centros e Coordenação ativos podem receber ações do Diretor.');
    }
    if (!alvos.length) throw falha(400, 'Escolha ao menos uma seção para receber a ação.');
    const detalhe = texto(b.detalhe, 2000) || null;
    return db.transaction(() => {
      const d = run(
        'insert into diretrizes (titulo, detalhe, destino, prazo, prioridade, criado_por, criado_em, reuniao_id) values (?,?,?,?,?,?,?,?)',
        titulo, detalhe, destino, b.prazo, prioridade, user.id, agoraISO(), reuniaoId,
      ).lastInsertRowid;
      for (const s of alvos) {
        const aId = run(
          `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, criada_em) values (?,?,?,?,?,?,?,?)`,
          d, s, titulo, detalhe, b.prazo, b.prazo, prioridade, agoraISO(),
        ).lastInsertRowid;
        run(
          `insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)`,
          aId, user.id, reuniaoId ? 'Ação demandada pelo Diretor na reunião de acompanhamento.' : 'Ação demandada pelo Diretor.', agoraISO(),
        );
      }
      return { id: d, destino, acoes_criadas: alvos.length };
    })();
  }

  app.post('/api/diretrizes', permit('diretor', 'apoio'), h((req, res) => {
    res.status(201);
    return criarDiretriz(req.user, req.body || {});
  }));
  app.get('/api/diretrizes', permit('diretor', 'apoio'), h(() =>
    q(`select d.*, u.nome as criado_por_nome,
         (select count(*) from acoes a where a.diretriz_id = d.id) total,
         (select count(*) from acoes a where a.diretriz_id = d.id and a.status = 'concluida') concluidas
       from diretrizes d left join usuarios u on u.id = d.criado_por order by d.criado_em desc, d.id desc limit 30`)));

  app.get('/api/acoes', h((req) => {
    const v = visiveisAcoes(req.user);
    const where = [v.where];
    const params = [...v.params];
    const f = req.query;
    if (f.secao) {
      const ids = subarvore(db, Number(f.secao));
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
    return q(`${SELECT_ACAO} where ${where.join(' and ')}
              order by a.encerrada, case a.status when 'concluida' then 1 else 0 end,
                       case when a.status != 'concluida' and a.prazo < '${hoje()}' then 0 else 1 end, a.prazo, a.id`, ...params).map(acaoOut);
  }));
  const STATUS_OK = new Set(['a_fazer', 'em_andamento', 'bloqueada', 'concluida']);

  app.post('/api/acoes', permit('chefe', 'diretor', 'apoio'), h((req, res) => {
    const b = req.body || {};
    const titulo = texto(b.titulo, 140);
    if (!titulo) throw falha(400, 'Informe o título da ação.');
    if (!ehISO(b.prazo)) throw falha(400, 'Informe o prazo da ação.');
    const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : 'media';
    const secaoId = req.user.perfil === 'chefe' ? req.user.secao_id : Number(b.secao_id);
    if (!secaoId) throw falha(400, 'Seção não informada.');
    const detalhe = texto(b.detalhe, 2000) || null;
    const interna = b.interna !== undefined ? (b.interna ? 1 : 0) : 0;
    res.status(201);
    const id = run(
      `insert into acoes (diretriz_id, secao_id, titulo, detalhe, prazo, prazo_original, prioridade, interna, criada_em)
       values (null, ?, ?, ?, ?, ?, ?, ?, ?)`,
      secaoId, titulo, detalhe, b.prazo, b.prazo, prioridade, interna, agoraISO(),
    ).lastInsertRowid;
    run(
      'insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      id, req.user.id, `Ação criada pela seção (${req.user.nome}).`, agoraISO(),
    );
    return acaoOut(q1(`${SELECT_ACAO} where a.id = ?`, id));
  }));

  app.delete('/api/acoes/:id', h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    chefeGere(req.user, a);
    if (a.diretriz_id) {
      throw falha(403, 'Ações demandadas pelo Diretor não podem ser excluídas pela seção.');
    }
    db.transaction(() => {
      run('delete from tempo where acao_id = ?', a.id);
      run('delete from acao_comentarios where acao_id = ?', a.id);
      run('delete from pedidos_prazo where acao_id = ?', a.id);
      run('delete from acoes where id = ?', a.id);
    })();
    return { ok: true, id: a.id };
  }));

  app.post('/api/acoes/:id/arquivar', h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    chefeGere(req.user, a);
    if (a.diretriz_id) {
      throw falha(403, 'Ações demandadas pelo Diretor não podem ser arquivadas pela seção.');
    }
    run('update acoes set arquivada = 1 where id = ?', a.id);
    run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      a.id, req.user.id, 'Ação arquivada.', agoraISO());
    return acaoOut(q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.post('/api/acoes/:id/desarquivar', h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    chefeGere(req.user, a);
    run('update acoes set arquivada = 0 where id = ?', a.id);
    run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)',
      a.id, req.user.id, 'Ação desarquivada.', agoraISO());
    return acaoOut(q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.get('/api/acoes/:id', h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    return {
      ...acaoOut(a),
      comentarios: q(`select c.*, u.nome as usuario_nome from acao_comentarios c left join usuarios u on u.id = c.usuario_id where c.acao_id = ? order by c.id`, a.id),
      lancamentos: q(`select t.*, u.nome as usuario_nome from tempo t left join usuarios u on u.id = t.usuario_id where t.acao_id = ? order by t.data desc, t.id desc`, a.id),
      pedidos: q('select * from pedidos_prazo where acao_id = ? order by id desc', a.id),
    };
  }));

  app.patch('/api/acoes/:id', h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');

    const p = req.body?.prioridade;
    if (p !== undefined) {
      if (!PRIORIDADES.includes(p)) throw falha(400, 'Prioridade inválida (use alta, media ou baixa).');
      run('update acoes set prioridade = ? where id = ?', p, a.id);
    }

    const novo = req.body?.status;
    if (novo !== undefined) {
      if (!STATUS_OK.has(novo)) throw falha(400, 'Status inválido.');
      if (novo !== a.status) {
        if (!TRANSICOES[a.status].includes(novo)) throw falha(409, 'Essa mudança de status não é permitida a partir do status atual.');
        if (novo === 'concluida' && a.tempo_total <= 0) throw falha(422, 'Informe o tempo gasto, em minutos, antes de concluir a ação.');
        run('update acoes set status = ?, concluida_em = ? where id = ?', novo, novo === 'concluida' ? agoraISO() : null, a.id);
      }
    }
    return acaoOut(q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.post('/api/acoes/:id/tempo', h((req, res) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    chefeGere(req.user, a);
    if (a.encerrada) throw falha(409, 'Esta ação já foi encerrada pelo Diretor.');
    const minutos = Number(req.body?.minutos);
    if (!Number.isInteger(minutos) || minutos <= 0 || minutos > 1440) throw falha(400, 'Informe o tempo em minutos inteiros, entre 1 e 1440.');
    const data = req.body?.data || hoje();
    if (!ehISO(data) || data > hoje()) throw falha(400, 'A data do lançamento não pode ser futura.');
    run('insert into tempo (acao_id, usuario_id, data, minutos, criado_em) values (?,?,?,?,?)', a.id, req.user.id, data, minutos, agoraISO());
    res.status(201);
    return acaoOut(q1(`${SELECT_ACAO} where a.id = ?`, a.id));
  }));

  app.post('/api/acoes/:id/comentarios', h((req, res) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.texto, 1000);
    if (!t) throw falha(400, 'Escreva o comentário.');
    run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, t, agoraISO());
    res.status(201);
    return { ok: true };
  }));

  app.post('/api/acoes/:id/pedido-prazo', h((req, res) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    chefeGere(req.user, a);
    const novo = req.body?.novo_prazo;
    const just = texto(req.body?.justificativa, 600);
    if (!ehISO(novo) || novo <= a.prazo) throw falha(400, 'O novo prazo deve ser posterior ao prazo atual.');
    if (!just) throw falha(400, 'Explique o motivo do novo prazo.');
    if (a.pedido_pendente) throw falha(409, 'Já existe um pedido de novo prazo aguardando decisão.');
    run('insert into pedidos_prazo (acao_id, usuario_id, prazo_atual, novo_prazo, justificativa, criado_em) values (?,?,?,?,?,?)',
      a.id, req.user.id, a.prazo, novo, just, agoraISO());
    res.status(201);
    return { ok: true };
  }));

  app.post('/api/acoes/:id/encerrar', permit('diretor'), h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    if (a.status !== 'concluida') throw falha(409, 'Só é possível encerrar uma ação concluída.');
    run('update acoes set encerrada = 1 where id = ?', a.id);
    return { ok: true };
  }));
  app.post('/api/acoes/:id/devolver', permit('diretor'), h((req) => {
    const a = acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.comentario, 1000);
    if (!t) throw falha(400, 'Explique o que falta para a ação ser aceita.');
    if (a.status !== 'concluida') throw falha(409, 'Só é possível devolver uma ação concluída.');
    run(`update acoes set status = 'em_andamento', concluida_em = null, encerrada = 0 where id = ?`, a.id);
    run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, `Devolvida pelo Diretor: ${t}`, agoraISO());
    return { ok: true };
  }));

  // ---------- Pedidos de novo prazo ----------
  app.get('/api/pedidos-prazo', permit('diretor', 'apoio'), h((req) => {
    const st = req.query.status === 'todos' ? null : 'pendente';
    return q(`select p.*, a.titulo as acao_titulo, a.secao_id, s.nome as secao_nome, s.sigla as secao_sigla, u.nome as usuario_nome
              from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id
              left join usuarios u on u.id = p.usuario_id
              where (a.interna = 0 or a.compartilhada = 1) ${st ? `and p.status = '${st}'` : ''}
              order by p.criado_em desc`);
  }));
  app.post('/api/pedidos-prazo/:id/decidir', permit('diretor', 'apoio'), h((req) => {
    const p = q1('select * from pedidos_prazo where id = ?', Number(req.params.id));
    if (!p) throw falha(404, 'Pedido não encontrado.');
    if (p.status !== 'pendente') throw falha(409, 'Este pedido já foi decidido.');
    let reuniaoId = null;
    if (req.user.perfil === 'apoio') {
      // O Apoio só decide por delegação do Diretor, durante uma reunião em andamento.
      const r = q1(`select id from reunioes where id = ? and status = 'em_andamento'`, Number(req.body?.reuniao_id));
      if (!r) throw falha(403, 'Somente o Diretor decide pedidos de prazo; o Apoio pode registrar a decisão durante a reunião.');
      reuniaoId = r.id;
    } else if (req.body?.reuniao_id) {
      reuniaoId = q1(`select id from reunioes where id = ? and status = 'em_andamento'`, Number(req.body.reuniao_id))?.id ?? null;
    }
    const aprovar = !!req.body?.aprovar;
    db.transaction(() => {
      run('update pedidos_prazo set status = ?, decidido_em = ?, decidido_por = ?, reuniao_id = ? where id = ?',
        aprovar ? 'aprovado' : 'recusado', agoraISO(), req.user.id, reuniaoId, p.id);
      if (aprovar) run('update acoes set prazo = ? where id = ?', p.novo_prazo, p.acao_id);
    })();
    return { ok: true, status: aprovar ? 'aprovado' : 'recusado' };
  }));

  // ---------- Atualização semanal do chefe ----------
  app.get('/api/atualizacao', permit('chefe'), h((req) => {
    if (!req.user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção. Peça ao Diretor para atribuí-lo.');
    const semana = semanaDe(req);
    const anterior = q1(`select semana from atualizacoes where secao_id = ? and semana < ? order by semana desc limit 1`, req.user.secao_id, semana)?.semana;
    const prev = anterior ? ultimaAtualizacao(db, req.user.secao_id, anterior) : null;
    return {
      semana,
      fechamento: fechamentoDe(semana),
      atual: ultimaAtualizacao(db, req.user.secao_id, semana),
      anterior: prev ? { semana: anterior, proximo: prev.proximo } : null,
    };
  }));
  app.put('/api/atualizacao', permit('chefe'), h((req) => {
    if (!req.user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção.');
    const b = req.body || {};
    const { dia } = cfgReuniao();
    const semana = b.semana || refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    if (!ehDiaReuniao(semana, dia)) throw falha(400, 'Semana inválida.');
    const lista = (v) => (Array.isArray(v) ? v.map((x) => texto(x, 400)).filter(Boolean).slice(0, 30) : []);
    const previstos = (Array.isArray(b.feito?.previstos) ? b.feito.previstos : [])
      .map((p) => ({ texto: texto(p?.texto, 400), cumprido: !!p?.cumprido })).filter((p) => p.texto);
    const feito = { previstos, extras: lista(b.feito?.extras) };
    const proximo = lista(b.proximo);
    const impedimentos = lista(b.impedimentos);
    if (!previstos.length && !feito.extras.length && !proximo.length) throw falha(400, 'Registre ao menos o que foi feito ou o que será feito.');
    const versao = (q1('select coalesce(max(versao), 0) v from atualizacoes where secao_id = ? and semana = ?', req.user.secao_id, semana).v) + 1;
    run(`insert into atualizacoes (secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (?,?,?,?,?,?,?,?,?,?)`,
      req.user.secao_id, semana, versao, JSON.stringify(feito), JSON.stringify(proximo), JSON.stringify(impedimentos),
      b.critico && impedimentos.length ? 1 : 0, texto(b.apoio, 600), req.user.id, agoraISO());
    return ultimaAtualizacao(db, req.user.secao_id, semana);
  }));

  const historicoDe = (secaoId, limite = 12) =>
    q(`select a.* from atualizacoes a where a.secao_id = ?
       and a.versao = (select max(b.versao) from atualizacoes b where b.secao_id = a.secao_id and b.semana = a.semana)
       order by a.semana desc limit ?`, secaoId, limite).map(atualizacaoDe);
  app.get('/api/historico', permit('chefe'), h((req) => (req.user.secao_id ? historicoDe(req.user.secao_id) : [])));

  // ---------- Painel do Diretor ----------
  app.get('/api/painel', permit('diretor', 'apoio'), h((req) => {
    const semana = semanaDe(req);
    const itens = painelSemana(db, semana, hoje());
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
  app.get('/api/pauta', permit('diretor', 'apoio'), h((req) => {
    const semana = semanaDe(req);
    return { semana, cartoes: cartoesReuniao(db, semana, hoje()) };
  }));
  app.get('/api/secoes/:id/detalhe', permit('diretor', 'apoio'), h((req) => {
    const id = Number(req.params.id);
    const s = q1('select * from secoes where id = ? and pai_id is null', id);
    if (!s) throw falha(404, 'Centro não encontrado.');
    const semana = semanaDe(req);
    const item = painelSemana(db, semana, hoje()).find((i) => i.secao.id === id);
    const ids = subarvore(db, id);
    const acoes = q(`${SELECT_ACAO} where a.secao_id in (${marks(ids)}) and (a.interna = 0 or a.compartilhada = 1) and a.encerrada = 0
                     order by case a.status when 'concluida' then 1 else 0 end, a.prazo`, ...ids).map(acaoOut);
    const tempoTotal = q1(`select coalesce(sum(t.minutos), 0) m from tempo t join acoes a on a.id = t.acao_id where a.secao_id in (${marks(ids)})`, ...ids).m;
    return { semana, item, historico: historicoDe(id), acoes, tempo_total: tempoTotal };
  }));

  rotasReunioes(app, { db, q, q1, run, hoje, agoraISO, criarDiretriz, cfg });

  // ---------- Erros ----------
  app.use('/api', (req, res, next) => next(falha(404, 'Rota não encontrada.')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ erro: status >= 500 ? 'Erro interno. Tente novamente.' : err.message, ...(err.extra || {}) });
  });

  return app;
}
