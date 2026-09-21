// Estrutura da organização: seções em árvore e cadastro de usuários e acessos.
import { subarvore, nivel } from './db.js';
import { LIMITE_NIVEIS } from './logic.js';
import { falha, h, permit, texto } from './helpers.js';
import { editarHierarquia, excluirCadastro } from './crud-cadastros.js';
import { administradorAuth, cadastrarChefe } from './cadastro-chefes.js';

export function rotasEstrutura(app, { db, q, q1, run, agoraISO, auth, adminAuth }) {
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

  app.post('/api/secoes', permit('diretor', 'administrador'), h(async (req, res) => db.transaction(async () => {
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

  app.patch('/api/secoes/:id', permit('diretor', 'administrador'), h(async (req) => db.transaction(async () => {
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
  app.post('/api/usuarios/chefes', permit('diretor', 'administrador'), h(async (req, res) => {
    if (auth.mode !== 'supabase') throw falha(400, 'Criação de login disponível somente com Supabase Auth.');
    const usuario = await cadastrarChefe(db, auth, adminAuth || administradorAuth(auth), req.body || {});
    res.status(201);
    return usuario;
  }));
  // Cria conta de login com senha inicial provisória. Diretor: Chefe e Apoio. Administrador: também Diretor.
  app.post('/api/usuarios/acesso', permit('diretor', 'administrador'), h(async(req,res)=>{
    if(auth.mode!=='supabase') throw falha(400,'Login requer Supabase Auth.');
    const permitidos = req.user.perfil === 'administrador' ? ['diretor', 'apoio', 'chefe'] : ['chefe', 'apoio'];
    const u=await cadastrarChefe(db,auth,adminAuth || administradorAuth(auth),req.body || {},req.body?.perfil,{ permitidos });
    res.status(201); return u;
  }));
  app.patch('/api/usuarios/:id/login', permit('diretor', 'administrador'), h(async(req)=>{
    if(auth.mode!=='supabase') throw falha(400,'Login requer Supabase Auth.');
    const id=Number(req.params.id), b=req.body || {};
    const conta=await q1('select * from auth_contas where usuario_id=? and projeto=?',id,auth.supabaseUrl);
    if(!conta) throw falha(404,'Usuário sem login vinculado.');
    const alvo=await q1('select perfil from usuarios where id=?',id);
    if(req.user.perfil!=='administrador' && ['diretor','administrador'].includes(alvo?.perfil)) throw falha(403,'Somente o Administrador altera o acesso do Diretor e de outros Administradores.');
    if(b.senha && id===req.user.id) throw falha(400,'Para alterar a sua própria senha, use "Alterar senha" no menu.');
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
      // Quem define a senha a conhece: a pessoa precisa trocá-la no próximo acesso.
      if(dados.password) await run('update usuarios set trocar_senha=1 where id=?',id);
      await run('delete from auth_sessoes_senha where conta_id=?',conta.id);
    });
    return {ok:true};
  }));
  app.get('/api/usuarios', permit('diretor', 'apoio', 'administrador'), h(async () =>
    await q(`select u.*, s.nome as secao_nome, (select count(*) from auth_contas c where c.usuario_id=u.id) as tem_login from usuarios u left join secoes s on s.id = u.secao_id order by u.ativo desc, u.perfil, u.nome`)));
  app.post('/api/usuarios', permit('diretor', 'administrador'), h(async (req, res) => {
    const b = req.body || {};
    const nome = texto(b.nome, 120);
    if (!nome) throw falha(400, 'Informe o nome.');
    if (!['chefe', 'apoio'].includes(b.perfil)) throw falha(400, 'Escolha o perfil: Chefe ou Apoio.');
    const id = (await run('insert into usuarios (nome, email, perfil) values (?,?,?)', nome, texto(b.email, 160) || null, b.perfil)).lastInsertRowid;
    res.status(201);
    return await q1('select * from usuarios where id = ?', id);
  }));
  app.patch('/api/usuarios/:id', permit('diretor', 'administrador'), h(async (req) => db.transaction(async () => {
    const id = Number(req.params.id), b=req.body || {};
    const u = await q1('select * from usuarios where id = ?' + (db.isPg ? ' for update' : ''), id);
    if (!u) throw falha(404, 'Usuário não encontrado.');
    const porAdmin = req.user.perfil === 'administrador';
    const muda = 'perfil' in b || 'ativo' in b || 'secao_id' in b;
    if (u.perfil === 'administrador' && !porAdmin) throw falha(403, 'Somente o Administrador altera esta conta.');
    if (u.perfil === 'administrador' && muda) throw falha(400, 'O perfil e o acesso do Administrador só mudam pelo servidor, para que o sistema nunca fique sem administrador.');
    if (u.perfil === 'diretor' && !porAdmin && muda) throw falha(400, 'Perfil e acesso do Diretor são protegidos: peça ao Administrador.');
    const perfil=b.perfil ?? u.perfil;
    const permitidos = porAdmin ? ['diretor','chefe','apoio'] : ['chefe','apoio'];
    if (perfil !== u.perfil && !permitidos.includes(perfil)) throw falha(400, porAdmin ? 'Escolha Diretor, Apoio do Diretor ou Chefe de seção.' : 'Escolha Chefe ou Apoio.');
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
    if (u.perfil === 'diretor' && (perfil !== 'diretor' || !ativo)) {
      const outros = (await q1(`select count(*) n from usuarios where perfil = 'diretor' and ativo = 1 and id != ?`, id)).n;
      if (!outros) throw falha(409, 'O sistema precisa de ao menos um Diretor ativo. Cadastre outro Diretor antes de trocar ou desativar este.');
    }
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
  app.delete('/api/usuarios/:id', permit('diretor', 'administrador'), h(req => excluirCadastro(db,'usuarios',Number(req.params.id))));
  app.delete('/api/secoes/:id', permit('diretor', 'administrador'), h(req => excluirCadastro(db,'secoes',Number(req.params.id))));
}
