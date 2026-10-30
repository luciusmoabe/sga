// Plataforma: o perfil que cria e administra as empresas (ver MULTIEMPRESA.md). Não lê dados de negócio: vê só o cadastro da
// empresa (nome, identificador, situação) e quantas contas ativas ela tem. A empresa da própria plataforma não aparece na lista.
import { falha, h, permit, texto } from './helpers.js';
import { administradorAuth } from './cadastro-chefes.js';
import { criarEmpresa } from './criar-empresa.js';

export function rotasPlataforma(app, { db, q, q1, run, auth, adminAuth }) {
  const soPlataforma = permit('plataforma');
  const doCadastro = (e) => ({ ...e, ativa: !!e.ativa, listada_no_login: !!e.listada_no_login, usuarios: Number(e.usuarios ?? 0) });
  const LISTA = `select e.id, e.nome, e.sigla, e.slug, e.ativa, e.listada_no_login, e.criada_em,
      (select count(*) from usuarios u where u.empresa_id = e.id and u.ativo = 1) as usuarios
    from empresas e`;

  app.get('/api/plataforma/empresas', soPlataforma, h(async (req) => (
    await q(`${LISTA} where e.id != ? order by e.nome, e.id`, req.user.empresa_id)).map(doCadastro)));

  // Cria a empresa e o primeiro Diretor, com senha provisória que ele é obrigado a trocar no primeiro acesso.
  app.post('/api/plataforma/empresas', soPlataforma, h(async (req, res) => {
    if (auth.mode !== 'supabase') throw falha(400, 'A criação de empresas com login requer o Supabase Auth.');
    const b = req.body || {};
    const r = await criarEmpresa(db, auth, adminAuth || administradorAuth(auth), {
      nome: b.nome, slug: b.slug, sigla: b.sigla || null, listada: b.listada_no_login !== false,
      diretor: b.diretor, email: b.email, senha: b.senha,
    });
    res.status(201);
    return { empresa: doCadastro({ ...(await q1(`${LISTA} where e.id = ?`, r.empresa.id)) }), diretor: { id: r.diretor.id, nome: r.diretor.nome, email: r.diretor.email } };
  }));

  // Nome, sigla, presença na lista da entrada e situação. O identificador (slug) não muda: ele está nos endereços já distribuídos.
  // Desativar encerra na hora o acesso das contas da empresa (os dados ficam guardados).
  app.patch('/api/plataforma/empresas/:id', soPlataforma, h(async (req) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id === req.user.empresa_id || !(await q1('select id from empresas where id = ?', id))) throw falha(404, 'Empresa não encontrada.');
    const b = req.body || {};
    if ('nome' in b) {
      const nome = texto(b.nome, 160);
      if (!nome) throw falha(400, 'O nome da empresa não pode ficar vazio.');
      await run('update empresas set nome = ? where id = ?', nome, id);
    }
    if ('sigla' in b) await run('update empresas set sigla = ? where id = ?', texto(b.sigla, 12).toUpperCase() || null, id);
    for (const campo of ['ativa', 'listada_no_login']) {
      if (!(campo in b)) continue;
      if (typeof b[campo] !== 'boolean') throw falha(400, 'Informe sim ou não.');
      await run(`update empresas set ${campo} = ? where id = ?`, b[campo] ? 1 : 0, id);
    }
    return doCadastro(await q1(`${LISTA} where e.id = ?`, id));
  }));
}
