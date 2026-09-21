// Perfil Administrador: consulta tudo, gerencia contas e estrutura, não decide nem registra.
// Troca obrigatória da senha inicial e comando do primeiro Administrador.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { vincularIdentidade } from '../server/vincular-identidade.js';
import { criarAdministrador } from '../server/criar-administrador.js';

const DIRETOR = 1, APOIO = 2, CPE = 3, COF = 4, ADMIN = 10;

// ---------- permissões (modo demonstração) ----------
async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { db, call };
}

test('Administrador consulta painel, pauta, ações (inclusive internas), pedidos, reuniões e cadastros', async (t) => {
  const { db, call } = await demo(t);
  for (const caminho of ['/painel', '/pauta', '/pedidos-prazo', '/diretrizes', '/reunioes', '/combinados', '/usuarios', '/secoes', '/config', '/bootstrap']) {
    assert.equal((await call(ADMIN, 'GET', caminho)).status, 200, caminho);
  }
  const doAdmin = (await call(ADMIN, 'GET', '/acoes?situacao=abertas')).data;
  const doDiretor = (await call(DIRETOR, 'GET', '/acoes?situacao=abertas')).data;
  const internas = (await db.prepare(`select count(*) n from acoes where interna = 1 and compartilhada = 0 and status != 'concluida' and encerrada = 0 and arquivada = 0`).get()).n;
  assert.ok(internas > 0, 'a demonstração tem ações internas');
  assert.equal(doAdmin.length, doDiretor.length + internas, 'o Administrador vê as ações internas que o Diretor não vê');
  const interna = doAdmin.find((a) => a.interna && !a.compartilhada);
  assert.equal((await call(ADMIN, 'GET', `/acoes/${interna.id}`)).status, 200);
  assert.equal((await call(DIRETOR, 'GET', `/acoes/${interna.id}`)).status, 404);
  const centro = await call(ADMIN, 'GET', '/secoes/1/detalhe'); // Centro com subseções
  assert.equal(centro.status, 200);
  assert.equal(centro.data.acoes_internas_visiveis, true);
  const doDiretorNoCentro = (await call(DIRETOR, 'GET', '/secoes/1/detalhe')).data;
  assert.equal(doDiretorNoCentro.acoes_internas_visiveis, false);
  assert.ok(centro.data.acoes.length >= doDiretorNoCentro.acoes.length);
});

test('Administrador não registra nem decide nada do acompanhamento', async (t) => {
  const { db, call } = await demo(t);
  const acao = await db.prepare('select id from acoes where interna = 0 limit 1').get();
  const bloqueadas = [
    ['POST', '/diretrizes', { titulo: 'X', prazo: '2026-12-31', destino: 'todos' }],
    ['POST', '/acoes', { titulo: 'X', prazo: '2026-12-31', secao_id: 1 }],
    ['PATCH', `/acoes/${acao.id}`, { status: 'em_andamento' }],
    ['POST', `/acoes/${acao.id}/comentarios`, { texto: 'oi' }],
    ['POST', `/acoes/${acao.id}/tempo`, { minutos: 5 }],
    ['POST', `/acoes/${acao.id}/encerrar`, {}],
    ['PUT', '/atualizacao', { proximo: ['x'] }],
    ['POST', '/combinados', { texto: 'x' }],
    ['PUT', '/config', { combinados_frequencia: 'sempre' }],
    ['POST', '/reunioes/iniciar', {}],
    ['POST', '/pedidos-prazo/1/decidir', { aprovar: true }],
  ];
  for (const [metodo, caminho, corpo] of bloqueadas) {
    const r = await call(ADMIN, metodo, caminho, corpo);
    assert.equal(r.status, 403, `${metodo} ${caminho}`);
  }
  assert.equal((await db.prepare('select count(*) n from reunioes where status = ?').get('em_andamento')).n, 0);
});

test('Administrador gerencia estrutura e perfis; Diretor não altera Diretor nem Administrador', async (t) => {
  const { call } = await demo(t);
  assert.equal((await call(ADMIN, 'POST', '/secoes', { nome: 'Centro Novo', tipo: 'centro' })).status, 201);
  // atribui outro perfil a uma conta
  const apoio = await call(ADMIN, 'PATCH', `/usuarios/${COF}`, { perfil: 'apoio' });
  assert.equal(apoio.status, 200);
  assert.equal(apoio.data.perfil, 'apoio');
  // o Administrador não muda o próprio perfil nem cria outro Administrador pela API
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${ADMIN}`, { perfil: 'chefe' })).status, 400);
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${ADMIN}`, { ativo: false })).status, 400);
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${CPE}`, { perfil: 'administrador' })).status, 400);
  assert.equal((await call(ADMIN, 'POST', '/usuarios', { nome: 'Outro', perfil: 'administrador' })).status, 400);
  assert.equal((await call(ADMIN, 'DELETE', `/usuarios/${ADMIN}`)).status, 409);
  // o Diretor continua sem poder promover a Diretor, nem mexer em Diretor ou Administrador
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${APOIO}`, { perfil: 'diretor' })).status, 400);
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${ADMIN}`, { nome: 'Invasor' })).status, 403);
  assert.equal((await call(DIRETOR, 'PATCH', `/usuarios/${DIRETOR}`, { ativo: false })).status, 400);
  // Chefe e Apoio não acessam cadastros
  assert.equal((await call(CPE, 'GET', '/usuarios')).status, 403);
  assert.equal((await call(APOIO, 'PATCH', `/usuarios/${CPE}`, { nome: 'X' })).status, 403);
});

test('o sistema nunca fica sem Diretor ativo', async (t) => {
  const { call } = await demo(t);
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${DIRETOR}`, { ativo: false })).status, 409);
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${DIRETOR}`, { perfil: 'apoio' })).status, 409);
  // com um segundo Diretor, o primeiro pode ser desativado
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${APOIO}`, { perfil: 'diretor' })).data.perfil, 'diretor');
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${DIRETOR}`, { ativo: false })).status, 200);
  assert.equal((await call(ADMIN, 'PATCH', `/usuarios/${APOIO}`, { ativo: false })).status, 409, 'agora é o último');
});

test('Chefe de Seção vê a própria seção e as subordinadas, e só elas', async (t) => {
  const { db, call } = await demo(t);
  const subordinadas = (await db.prepare('select id from secoes where pai_id = 1').all()).map((s) => s.id);
  assert.ok(subordinadas.length > 0);
  const daCPE = (await call(CPE, 'GET', '/acoes?situacao=abertas')).data;
  const secoes = new Set(daCPE.map((a) => a.secao_id));
  assert.ok(subordinadas.some((id) => secoes.has(id)), 'vê ações de subseções');
  assert.ok([...secoes].every((id) => id === 1 || subordinadas.includes(id)), 'não vê outras seções');
  const daCOF = (await call(COF, 'GET', '/acoes?situacao=abertas')).data;
  assert.ok(daCOF.every((a) => a.secao_id === 2 || !subordinadas.includes(a.secao_id)), 'outra seção não enxerga as subordinadas da CPE');
  assert.equal((await call(COF, 'GET', `/acoes/${daCPE[0].id}`)).status, 404);
  assert.equal((await call(CPE, 'GET', '/painel')).status, 403);
});

// ---------- contas e senha inicial (modo institucional, provedor simulado) ----------
const projeto = 'https://projeto.supabase.co';
const config = { mode: 'supabase', supabaseUrl: projeto, key: 'sb_publishable_teste', origin: 'https://agilis.example', secure: true };
const SUBJ = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

async function institucional(t) {
  const db = openDb(':memory:');
  await seed(db);
  const contasRemotas = new Map(); // email -> { senha, subject }
  let proximo = 100;
  const registrar = (email, senha, subject) => contasRemotas.set(email, { senha, subject });
  const provedor = { async autenticar(email, senha) {
    const c = contasRemotas.get(email);
    if (!c || c.senha !== senha) throw Object.assign(new Error('x'), { status: 401 });
    return { subject: c.subject, expires: Math.floor(Date.now() / 1000) + 3600 };
  } };
  const adminAuth = {
    async criar(email, senha) { const subject = SUBJ(proximo++); registrar(email, senha, subject); return subject; },
    async atualizar(subject, dados) {
      for (const c of contasRemotas.values()) if (c.subject === subject && dados.password) c.senha = dados.password;
    },
    async remover() {},
  };
  for (const [uid, email, n] of [[ADMIN, 'admin@orgao.gov.br', 1], [DIRETOR, 'diretor@orgao.gov.br', 2]]) {
    await db.prepare('update usuarios set email = ? where id = ?').run(email, uid);
    registrar(email, `Senha-definitiva-${n}!`, SUBJ(n));
    await vincularIdentidade(db, uid, projeto, SUBJ(n));
  }
  const server = createApp(db, { auth: config, provedor, adminAuth }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const chamar = (caminho, opcoes = {}) => fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, { redirect: 'manual', ...opcoes });
  const entrar = async (email, senha) => {
    const r = await chamar('/auth/entrar', { method: 'POST', headers: { origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, senha }) });
    if (r.status !== 200) return { status: r.status };
    const csrf = (await r.json()).csrf;
    return { status: 200, cookie: r.headers.get('set-cookie').split(';')[0], csrf };
  };
  const api = (sessao) => async (metodo, caminho, corpo) => {
    const r = await chamar(caminho, { method: metodo, headers: { cookie: sessao.cookie, origin: config.origin, 'x-csrf-token': sessao.csrf, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { db, entrar, api, contasRemotas };
}

test('Administrador cria conta com senha inicial; o novo usuário é obrigado a trocá-la no primeiro acesso', async (t) => {
  const { db, entrar, api, contasRemotas } = await institucional(t);
  const adm = api(await entrar('admin@orgao.gov.br', 'Senha-definitiva-1!'));
  const criada = await adm('POST', '/usuarios/acesso', { nome: 'Nova Diretora', email: 'nova@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'diretor' });
  assert.equal(criada.status, 201);
  assert.equal(criada.data.perfil, 'diretor');
  assert.equal(criada.data.trocar_senha, 1);
  // o Administrador só cria Diretor, Apoio e Chefe; nunca outro Administrador
  assert.equal((await adm('POST', '/usuarios/acesso', { nome: 'Outro', email: 'outro@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'administrador' })).status, 400);
  assert.equal((await adm('POST', '/usuarios/acesso', { nome: 'Curta', email: 'curta@orgao.gov.br', senha: 'curta', perfil: 'apoio' })).status, 400);
  assert.equal((await adm('POST', '/usuarios/acesso', { nome: 'Sem perfil', email: 'sp@orgao.gov.br', senha: 'Senha-inicial-123' })).status, 400);

  // primeiro acesso: só bootstrap, troca e saída respondem
  const s1 = await entrar('nova@orgao.gov.br', 'Senha-inicial-123');
  assert.equal(s1.status, 200);
  const nova = api(s1);
  const bloqueada = await nova('GET', '/painel');
  assert.equal(bloqueada.status, 403);
  assert.equal(bloqueada.data.trocar_senha, true);
  assert.match(bloqueada.data.erro, /Troque a senha/);
  const boot = await nova('GET', '/bootstrap');
  assert.equal(boot.status, 200);
  assert.ok(boot.data.user.trocar_senha);

  // a troca exige a senha atual, tamanho mínimo e senha diferente
  assert.equal((await nova('POST', '/auth/trocar-senha', { senha_atual: 'errada-errada-1', senha_nova: 'Senha-definitiva-nova' })).status, 400);
  assert.equal((await nova('POST', '/auth/trocar-senha', { senha_atual: 'Senha-inicial-123', senha_nova: 'curta' })).status, 400);
  assert.equal((await nova('POST', '/auth/trocar-senha', { senha_atual: 'Senha-inicial-123', senha_nova: 'Senha-inicial-123' })).status, 400);
  assert.equal((await nova('GET', '/painel')).status, 403, 'segue bloqueada até trocar');

  const outraSessao = await entrar('nova@orgao.gov.br', 'Senha-inicial-123');
  const outra = api(outraSessao);
  const s1Valida = await nova('POST', '/auth/trocar-senha', { senha_atual: 'Senha-inicial-123', senha_nova: 'Senha-definitiva-nova' });
  assert.equal(s1Valida.status, 200);
  assert.equal((await nova('GET', '/painel')).status, 200, 'liberada depois da troca');
  assert.equal((await outra('GET', '/bootstrap')).status, 401, 'as outras sessões da conta foram encerradas');
  assert.equal((await entrar('nova@orgao.gov.br', 'Senha-inicial-123')).status, 401, 'a senha inicial deixou de valer');
  assert.equal((await entrar('nova@orgao.gov.br', 'Senha-definitiva-nova')).status, 200);
  assert.equal(contasRemotas.get('nova@orgao.gov.br').senha, 'Senha-definitiva-nova');
  assert.equal((await db.prepare("select trocar_senha from usuarios where email = 'nova@orgao.gov.br'").get()).trocar_senha, 0);
});

test('Diretor cria só Chefe e Apoio; redefinir a senha de alguém exige nova troca; ninguém redefine a própria por aí', async (t) => {
  const { db, entrar, api } = await institucional(t);
  const dir = api(await entrar('diretor@orgao.gov.br', 'Senha-definitiva-2!'));
  assert.equal((await dir('POST', '/usuarios/acesso', { nome: 'D2', email: 'd2@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'diretor' })).status, 400);
  const apoio = await dir('POST', '/usuarios/acesso', { nome: 'Apoio Novo', email: 'apoio@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'apoio' });
  assert.equal(apoio.status, 201);
  assert.equal((await dir('POST', '/usuarios/acesso', { nome: 'Chefe Novo', email: 'chefe@orgao.gov.br', senha: 'Senha-inicial-123', perfil: 'chefe', secao_id: 1, substituir_chefe_id: CPE })).status, 201);

  // Diretor não altera o acesso do Administrador; o Administrador altera o de qualquer um
  assert.equal((await dir('PATCH', `/usuarios/${ADMIN}/login`, { senha: 'Outra-senha-forte-1' })).status, 403);
  const adm = api(await entrar('admin@orgao.gov.br', 'Senha-definitiva-1!'));
  assert.equal((await adm('PATCH', `/usuarios/${ADMIN}/login`, { senha: 'Outra-senha-forte-1' })).status, 400, 'a própria senha se troca pelo menu');
  // primeiro a Apoio conclui a troca; depois o Administrador redefine e a exigência volta
  const ap = api(await entrar('apoio@orgao.gov.br', 'Senha-inicial-123'));
  assert.equal((await ap('POST', '/auth/trocar-senha', { senha_atual: 'Senha-inicial-123', senha_nova: 'Senha-da-apoio-nova' })).status, 200);
  assert.equal((await db.prepare('select trocar_senha from usuarios where id = ?').get(apoio.data.id)).trocar_senha, 0);
  assert.equal((await adm('PATCH', `/usuarios/${apoio.data.id}/login`, { senha: 'Senha-redefinida-9' })).status, 200);
  assert.equal((await db.prepare('select trocar_senha from usuarios where id = ?').get(apoio.data.id)).trocar_senha, 1);
  assert.equal((await ap('GET', '/painel')).status, 401, 'a sessão anterior foi encerrada na redefinição');
  const de = api(await entrar('apoio@orgao.gov.br', 'Senha-redefinida-9'));
  assert.equal((await de('GET', '/painel')).status, 403);
});

test('comando do primeiro Administrador: cria conta com senha provisória ou vincula conta existente', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const criadas = [];
  const admin = { async criar(email, senha) { criadas.push([email, senha]); return SUBJ(500); }, async remover() {} };
  const u = await criarAdministrador(db, config, admin, { nome: 'Admin Um', email: 'Admin1@Orgao.gov.br', senha: 'Senha-inicial-123' });
  assert.equal(u.perfil, 'administrador');
  assert.equal(u.email, 'admin1@orgao.gov.br');
  assert.equal(u.trocar_senha, 1);
  assert.deepEqual(criadas, [['admin1@orgao.gov.br', 'Senha-inicial-123']]);
  assert.equal((await db.prepare('select count(*) n from auth_contas where usuario_id = ?').get(u.id)).n, 1);
  await assert.rejects(criarAdministrador(db, config, admin, { nome: 'Dup', email: 'admin1@orgao.gov.br', senha: 'Senha-inicial-123' }), /já cadastrado/);
  await assert.rejects(criarAdministrador(db, config, admin, { nome: 'Curta', email: 'c@orgao.gov.br', senha: 'curta' }), /senha inicial/);

  const vinculado = await criarAdministrador(db, config, admin, { nome: 'Admin Dois', email: 'admin2@orgao.gov.br', subject: SUBJ(600) });
  assert.equal(vinculado.trocar_senha, 0);
  assert.equal(criadas.length, 1, 'não cria conta nova ao vincular');
  await assert.rejects(criarAdministrador(db, config, admin, { nome: 'Outro', email: 'admin3@orgao.gov.br', subject: SUBJ(600) }), /já está vinculada/);
  await assert.rejects(criarAdministrador(db, config, admin, { nome: 'Ruim', email: 'admin4@orgao.gov.br', subject: 'não-é-uuid' }), /válidos/);
});
