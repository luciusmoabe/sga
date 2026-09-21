import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { subarvore, nivel } from './db.js';
import {
  DIA_PADRAO, FUSO_NEGOCIO, HORA_PADRAO, HORA_CORTE_PADRAO, LIMITE_NIVEIS, PRIORIDADES, TRANSICOES,
  agora, ehISO, ehDiaReuniao, fechamentoDe, hojeISO, refDiaReuniao,
} from './logic.js';
import { atualizacaoDe, cartoesReuniao, falha, h, marks, painelSemana, permit, texto, ultimaAtualizacao } from './helpers.js';
import { rotasReunioes } from './reunioes.js';
import { configurarAuth, instalarAuth } from './auth.js';
import { editarHierarquia, excluirCadastro } from './crud-cadastros.js';
import { administradorAuth, cadastrarChefe } from './cadastro-chefes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(db, { auth = configurarAuth(), provedor, adminAuth } = {}) {
  const app = express();
  app.use(compression({ threshold: 512 })); // gzip/brotli: reduz JSON em ~70-80%
  app.use(express.json({ limit: '200kb' }));
  app.use(express.static(path.join(raiz, 'public')));

  const q = async (sql, ...p) => await db.prepare(sql).all(...p);
  const q1 = async (sql, ...p) => await db.prepare(sql).get(...p);
  const run = async (sql, ...p) => await db.prepare(sql).run(...p);
  const agoraISO = () => agora().toISOString();

  instalarAuth(app, db, auth, provedor);

  const hoje = () => hojeISO();
  /** Lê dia e hora da reunião a partir da config, com fallback para os padrões. */
  const cfgReuniao = async () => {
    const rows = await q('select chave, valor from config');
    const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
    const dia = c.reuniao_dia != null ? Number(c.reuniao_dia) : DIA_PADRAO;
    const hora = c.reuniao_hora || HORA_PADRAO;
    return { dia, hora, config: c };
  };
  const semanaDe = async (req) => {
    const { dia } = await cfgReuniao();
    const s = req.query.semana || refDiaReuniao(agora(), dia, HORA_CORTE_PADRAO);
    if (!ehISO(s)) throw falha(400, 'Informe uma data válida para a semana (AAAA-MM-DD).');
    if (!ehDiaReuniao(s, dia)) {
      const historica = await q1('select semana from atualizacoes where semana = ? union select semana from reunioes where semana = ?', s, s);
      if (!historica) throw falha(400, 'A semana deve corresponder ao dia configurado ou a uma semana já registrada.');
    }
    return s;
  };
  const cfg = async () => Object.fromEntries((await q('select chave, valor from config')).map((r) => [r.chave, r.valor]));
  const visiveisAcoes = async (user) => {
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
      exists(select 1 from pedidos_prazo p where p.acao_id = a.id and p.status = 'pendente') as pedido_pendente
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
    atrasada: a.status !== 'concluida' && !a.encerrada && !a.arquivada && a.prazo < hoje(),
    demandada_diretor: !!a.diretriz_id || a.demandado_por_perfil === 'diretor',
    demandado_em: a.demandado_em || a.criada_em,
    demandado_por_nome: a.demandado_por_nome,
    reuniao_semana: a.reuniao_semana,
  });
  const acaoVisivel = async (user, id) => {
    const v = await visiveisAcoes(user);
    const a = await q1(`${SELECT_ACAO} where a.id = ? and ${v.where}`, id, ...v.params);
    if (!a) throw falha(404, 'Ação não encontrada.');
    return a;
  };
  const podeExcluirAcao = async (user, a) => {
    if (['diretor','apoio'].includes(user.perfil)) return a.criado_por === user.id || ['diretor','apoio'].includes(a.autor_perfil);
    return user.perfil === 'chefe' && !a.diretriz_id && !!user.secao_id
      && (await subarvore(db,user.secao_id)).includes(a.secao_id);
  };
  const chefeGere = async (user, acao) => {
    if (user.perfil !== 'chefe' || !user.secao_id || !(await subarvore(db, user.secao_id)).includes(acao.secao_id)) {
      throw falha(403, 'Somente o chefe da seção responsável pode alterar esta ação.');
    }
  };

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

  // ---------- Seções (estrutura em árvore) ----------
  const listaSecoes = async (user) => {
    let rows = await q(`select s.*, u.nome as chefe_nome from secoes s left join usuarios u on u.id = s.chefe_id order by s.ordem, s.id`);
    if (user.perfil === 'chefe') {
      const ids = new Set(user.secao_id ? await subarvore(db, user.secao_id) : []);
      rows = rows.filter((r) => ids.has(r.id));
    }
    const porId = new Map(rows.map((r) => [r.id, r]));
    const nv = (r) => (r.pai_id && porId.has(r.pai_id) ? nv(porId.get(r.pai_id)) + 1 : 1);
    return rows.map((r) => ({ ...r, ativa: !!r.ativa, nivel: nv(r) }));
  };
  app.get('/api/secoes', h(async (req) => await listaSecoes(req.user)));

  const validarChefe = async (chefeId) => {
    if (chefeId == null || chefeId === '') return null;
    const u = await q1('select * from usuarios where id = ? and ativo = 1 and perfil = ?', Number(chefeId), 'chefe');
    if (!u) throw falha(400, 'O chefe escolhido não existe ou não tem o perfil de chefe.');
    return u.id;
  };
  const atribuirChefe = async (secaoId, chefeId) => {
    const atual = (await q1('select chefe_id from secoes where id = ?', secaoId))?.chefe_id;
    if (atual && atual !== chefeId) await run('update usuarios set secao_id = null where id = ? and secao_id = ?', atual, secaoId);
    if (chefeId) {
      await run('update secoes set chefe_id = null where chefe_id = ? and id != ?', chefeId, secaoId);
      await run('update usuarios set secao_id = ? where id = ?', secaoId, chefeId);
    }
    await run('update secoes set chefe_id = ? where id = ?', chefeId, secaoId);
  };

  app.post('/api/secoes', permit('diretor'), h(async (req, res) => db.transaction(async () => {
    if (db.isPg) await db.prepare('select pg_advisory_xact_lock(7319, 2)').get();
    const b = req.body || {};
    const nome = texto(b.nome, 120);
    if (!nome) throw falha(400, 'Informe o nome da seção.');
    if (!['centro', 'coordenacao', 'subsecao'].includes(b.tipo)) throw falha(400, 'Escolha o tipo: Centro, Coordenação ou Subseção.');
    let pai = null;
    if (b.tipo === 'subsecao') {
      pai = await q1('select * from secoes where id = ? and ativa = 1', Number(b.pai_id));
      if (!pai) throw falha(400, 'Escolha a seção à qual a subseção ficará ligada.');
      if (await nivel(db, pai.id) + 1 > LIMITE_NIVEIS) throw falha(400, `A estrutura aceita até ${LIMITE_NIVEIS} níveis abaixo do Departamento.`);
    } else if (b.pai_id) {
      throw falha(400, 'Centros e Coordenação ficam no primeiro nível.');
    }
    const chefe = await validarChefe(b.chefe_id);
    const ordemRow = pai
      ? await q1('select coalesce(max(ordem), 0) + 1 o from secoes where pai_id = ?', pai.id)
      : await q1('select coalesce(max(ordem), 0) + 1 o from secoes where pai_id is null');
    const ordem = ordemRow?.o ?? 1;
    const id = (await run(
      'insert into secoes (nome, sigla, tipo, pai_id, ordem, criada_em) values (?,?,?,?,?,?)',
      nome, texto(b.sigla, 12).toUpperCase() || null, b.tipo, pai?.id ?? null, ordem, agoraISO(),
    )).lastInsertRowid;
    if (chefe) await atribuirChefe(id, chefe);
    res.status(201);
    return (await listaSecoes(req.user)).find((s) => s.id === id);
  })));

  app.patch('/api/secoes/:id', permit('diretor'), h(async (req) => db.transaction(async () => {
    if (db.isPg) await db.prepare('select pg_advisory_xact_lock(7319, 2)').get();
    const id = Number(req.params.id);
    const s = await q1('select * from secoes where id = ?', id);
    if (!s) throw falha(404, 'Seção não encontrada.');
    const b = req.body || {};
    if ('tipo' in b || 'pai_id' in b) {
      await editarHierarquia(db,id,b);
      Object.assign(s, await q1('select * from secoes where id=?',id));
    }
    if ('nome' in b) {
      const nome = texto(b.nome, 120);
      if (!nome) throw falha(400, 'O nome da seção não pode ficar vazio.');
      await run('update secoes set nome = ? where id = ?', nome, id);
    }
    if ('sigla' in b) await run('update secoes set sigla = ? where id = ?', texto(b.sigla, 12).toUpperCase() || null, id);
    if ('chefe_id' in b) await atribuirChefe(id, await validarChefe(b.chefe_id));
    if (b.mover === 'cima' || b.mover === 'baixo') {
      const irmas = s.pai_id == null
        ? await q('select id from secoes where pai_id is null order by ordem, id')
        : await q('select id from secoes where pai_id = ? order by ordem, id', s.pai_id);
      for (let i = 0; i < irmas.length; i++) {
        await run('update secoes set ordem = ? where id = ?', i + 1, irmas[i].id);
      }
      const i = irmas.findIndex((r) => r.id === id);
      const j = b.mover === 'cima' ? i - 1 : i + 1;
      if (j >= 0 && j < irmas.length) {
        await run('update secoes set ordem = ? where id = ?', j + 1, id);
        await run('update secoes set ordem = ? where id = ?', i + 1, irmas[j].id);
      }
    }
    if ('ativa' in b) {
      if (b.ativa) {
        if (s.pai_id && !(await q1('select 1 from secoes where id = ? and ativa = 1', s.pai_id))) throw falha(409, 'Reative primeiro a seção acima desta.');
        await run('update secoes set ativa = 1 where id = ?', id);
      } else {
        if (await q1('select 1 from secoes where pai_id = ? and ativa = 1', id)) throw falha(409, 'Desative antes as subseções que ficam abaixo desta seção.');
        const abertas = (await q1(`select count(*) n from acoes where secao_id = ? and status != 'concluida' and encerrada = 0 and arquivada = 0`, id))?.n ?? 0;
        if (abertas > 0) {
          if (b.reatribuir && s.pai_id) {
            await run(`update acoes set secao_id = ? where secao_id = ? and status != 'concluida' and encerrada = 0 and arquivada = 0`, s.pai_id, id);
          } else {
            const e = falha(409, s.pai_id
              ? `Esta seção tem ${abertas} ação(ões) aberta(s). Reatribua-as à seção acima para desativar.`
              : `Esta seção tem ${abertas} ação(ões) aberta(s). Conclua ou encerre antes de desativar.`);
            e.extra = { acoes_abertas: abertas, pode_reatribuir: !!s.pai_id };
            throw e;
          }
        }
        await run('update secoes set ativa = 0 where id = ?', id);
      }
    }
    return (await listaSecoes(req.user)).find((x) => x.id === id);
  })));

  // ---------- Usuários (cadastro mínimo) ----------
  app.post('/api/usuarios/chefes', permit('diretor'), h(async (req, res) => {
    if (auth.mode !== 'supabase') throw falha(400, 'Criação de login disponível somente com Supabase Auth.');
    const usuario = await cadastrarChefe(db, auth, adminAuth || administradorAuth(auth), req.body || {});
    res.status(201);
    return usuario;
  }));
  app.post('/api/usuarios/acesso', permit('diretor'), h(async(req,res)=>{
    if(auth.mode!=='supabase') throw falha(400,'Login requer Supabase Auth.');
    const u=await cadastrarChefe(db,auth,adminAuth || administradorAuth(auth),req.body || {},req.body?.perfil);
    res.status(201); return u;
  }));
  app.patch('/api/usuarios/:id/login', permit('diretor'), h(async(req)=>{
    if(auth.mode!=='supabase') throw falha(400,'Login requer Supabase Auth.');
    const id=Number(req.params.id), b=req.body || {};
    const conta=await q1('select * from auth_contas where usuario_id=? and projeto=?',id,auth.supabaseUrl);
    if(!conta) throw falha(404,'Usuário sem login vinculado.');
    const dados={};
    if(b.email) {
      const email=String(b.email).trim().toLowerCase();
      if(email.length>160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha(400,'E-mail inválido.');
      if(await q1('select id from usuarios where lower(email)=? and id!=?',email,id)) throw falha(409,'E-mail já cadastrado.');
      dados.email=email; dados.email_confirm=true;
    }
    if(b.senha) {
      if(typeof b.senha!=='string' || b.senha.length<12 || b.senha.length>128) throw falha(400,'Senha deve ter entre 12 e 128 caracteres.');
      dados.password=b.senha;
    }
    if(!Object.keys(dados).length) throw falha(400,'Informe novo e-mail ou senha.');
    await (adminAuth || administradorAuth(auth)).atualizar(conta.subject,dados);
    await db.transaction(async()=>{
      if(dados.email) await run('update usuarios set email=? where id=?',dados.email,id);
      await run('delete from auth_sessoes_senha where conta_id=?',conta.id);
    });
    return {ok:true};
  }));
  app.get('/api/usuarios', permit('diretor', 'apoio'), h(async () =>
    await q(`select u.*, s.nome as secao_nome, (select count(*) from auth_contas c where c.usuario_id=u.id) as tem_login from usuarios u left join secoes s on s.id = u.secao_id order by u.ativo desc, u.perfil, u.nome`)));
  app.post('/api/usuarios', permit('diretor'), h(async (req, res) => {
    const b = req.body || {};
    const nome = texto(b.nome, 120);
    if (!nome) throw falha(400, 'Informe o nome.');
    if (!['chefe', 'apoio'].includes(b.perfil)) throw falha(400, 'Escolha o perfil: Chefe ou Apoio.');
    const id = (await run('insert into usuarios (nome, email, perfil) values (?,?,?)', nome, texto(b.email, 160) || null, b.perfil)).lastInsertRowid;
    res.status(201);
    return await q1('select * from usuarios where id = ?', id);
  }));
  app.patch('/api/usuarios/:id', permit('diretor'), h(async (req) => db.transaction(async () => {
    const id = Number(req.params.id), b=req.body || {};
    const u = await q1('select * from usuarios where id = ?' + (db.isPg ? ' for update' : ''), id);
    if (!u) throw falha(404, 'Usuário não encontrado.');
    if (u.perfil === 'diretor' && ('perfil' in b || 'ativo' in b || 'secao_id' in b)) throw falha(400, 'Perfil e acesso do Diretor são protegidos.');
    const perfil=b.perfil ?? u.perfil;
    if (!['diretor','chefe','apoio'].includes(perfil) || (u.perfil !== 'diretor' && perfil === 'diretor')) throw falha(400,'Escolha Chefe ou Apoio.');
    if ('nome' in b) {
      const nome=texto(b.nome,120);
      if(!nome) throw falha(400,'Informe o nome.');
      await run('update usuarios set nome=? where id=?',nome,id);
    }
    if ('email' in b) {
      const email=texto(b.email,160).toLowerCase();
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha(400,'E-mail inválido.');
      if(email && await q1('select id from usuarios where lower(email)=? and id!=?',email,id)) throw falha(409,'E-mail já cadastrado.');
      const conta=await q1('select id from auth_contas where usuario_id=?',id);
      if(conta && email !== u.email) throw falha(409,'Para uma conta vinculada, altere o e-mail pelo botão Login.');
      await run('update usuarios set email=? where id=?',email || null,id);
    }
    if ('ativo' in b && typeof b.ativo !== 'boolean') throw falha(400,'Estado inválido.');
    const ativo='ativo' in b ? Number(b.ativo) : u.ativo;
    const secao='secao_id' in b ? (b.secao_id ? Number(b.secao_id) : null) : u.secao_id;
    if(perfil==='chefe' && ativo && secao) {
      const s=await q1('select * from secoes where id=?',secao);
      if(!s?.ativa) throw falha(400,'Escolha uma seção ativa.');
      if(s.chefe_id && s.chefe_id!==id) throw falha(409,'A seção já possui outro chefe. Use o botão Chefe para substituir.');
    }
    await run('update secoes set chefe_id=null where chefe_id=?',id);
    await run('update usuarios set perfil=?,ativo=?,secao_id=? where id=?',perfil,ativo,perfil==='chefe' && ativo ? secao : null,id);
    if(perfil==='chefe' && ativo && secao) {
      const r=await run('update secoes set chefe_id=? where id=? and chefe_id is null and ativa=1',id,secao);
      if(r.changes!==1) throw falha(409,'Seção alterada por outra operação. Atualize a página.');
    }
    return await q1('select * from usuarios where id = ?', id);
  })));
  app.delete('/api/usuarios/:id', permit('diretor'), h(req => excluirCadastro(db,'usuarios',Number(req.params.id))));
  app.delete('/api/secoes/:id', permit('diretor'), h(req => excluirCadastro(db,'secoes',Number(req.params.id))));

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

  app.post('/api/diretrizes', permit('diretor', 'apoio'), h(async (req, res) => {
    res.status(201);
    return await criarDiretriz(req.user, req.body || {});
  }));
  app.get('/api/diretrizes', permit('diretor', 'apoio'), h(async () =>
    await q(`select d.*, u.nome as criado_por_nome,
         (select count(*) from acoes a where a.diretriz_id = d.id) total,
         (select count(*) from acoes a where a.diretriz_id = d.id and a.status = 'concluida') concluidas
       from diretrizes d left join usuarios u on u.id = d.criado_por order by d.criado_em desc, d.id desc limit 30`)));

  const STATUS_OK = new Set(['a_fazer', 'em_andamento', 'bloqueada', 'concluida']);

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

  app.post('/api/acoes', permit('chefe', 'diretor', 'apoio'), h(async (req, res) => {
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
    if (a.diretriz_id) {
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
        await run('update acoes set status = ?, concluida_em = ? where id = ?', novo, novo === 'concluida' ? agoraISO() : null, a.id);
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

  app.post('/api/acoes/:id/encerrar', permit('diretor'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    if (a.status !== 'concluida') throw falha(409, 'Só é possível encerrar uma ação concluída.');
    await run('update acoes set encerrada = 1 where id = ?', a.id);
    return { ok: true };
  }));
  app.post('/api/acoes/:id/devolver', permit('diretor'), h(async (req) => {
    const a = await acaoVisivel(req.user, Number(req.params.id));
    const t = texto(req.body?.comentario, 1000);
    if (!t) throw falha(400, 'Explique o que falta para a ação ser aceita.');
    if (a.status !== 'concluida') throw falha(409, 'Só é possível devolver uma ação concluída.');
    await run(`update acoes set status = 'em_andamento', concluida_em = null, encerrada = 0 where id = ?`, a.id);
    await run('insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?,?,?,?)', a.id, req.user.id, `Devolvida pelo Diretor: ${t}`, agoraISO());
    return { ok: true };
  }));

  // ---------- Pedidos de novo prazo ----------
  app.get('/api/pedidos-prazo', permit('diretor', 'apoio'), h(async (req) => {
    const st = req.query.status === 'todos' ? null : 'pendente';
    return await q(`select p.*, a.titulo as acao_titulo, a.secao_id, s.nome as secao_nome, s.sigla as secao_sigla, u.nome as usuario_nome
              from pedidos_prazo p join acoes a on a.id = p.acao_id join secoes s on s.id = a.secao_id
              left join usuarios u on u.id = p.usuario_id
              where (a.interna = 0 or a.compartilhada = 1) ${st ? `and p.status = '${st}' and a.arquivada = 0 and a.encerrada = 0` : ''}
              order by p.criado_em desc`);
  }));
  app.post('/api/pedidos-prazo/:id/decidir', permit('diretor', 'apoio'), h(async (req) => {
    const id = Number(req.params.id);
    const visivel = await q1(`select p.acao_id from pedidos_prazo p join acoes a on a.id = p.acao_id
      where p.id = ? and (a.interna = 0 or a.compartilhada = 1)`, id);
    if (!visivel) throw falha(404, 'Pedido não encontrado.');
    return db.transaction(async () => {
      // Criar pedido e decidir pedido adquirem a mesma trava, sempre na ação.
      if (db.isPg) await q1('select id from acoes where id = ? for update', visivel.acao_id);
      const p = await q1(`select p.*, a.arquivada, a.encerrada, a.prazo from pedidos_prazo p join acoes a on a.id = p.acao_id
        where p.id = ? and (a.interna = 0 or a.compartilhada = 1)`, id);
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
