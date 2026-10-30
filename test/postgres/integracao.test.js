import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { clusterTemporario } from './cluster.js';
import { aplicarMigracoes, verificarMigracoes } from '../../server/migrations.js';
import { seed } from '../../server/seed.js';
import { createApp } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { conferirIntegridade, semearLegado } from '../integridade-cenarios.js';
import { cadastrarChefe } from '../../server/cadastro-chefes.js';

process.env.SGC_NOW = '2026-09-19T10:00:00';

async function servir(t, db) {
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  return async (method, caminho, body, usuario = 1) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(usuario), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    return { status: response.status, data: await response.json() };
  };
}

test('PostgreSQL real em cluster descartável', { timeout: 120000 }, async t => {
  const cluster = await clusterTemporario(t);
  t.diagnostic(cluster.versao);

  await t.test('limpeza piloto remove apenas ações e dependências explícitas', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    const preservadas = ['usuarios','secoes','diretrizes','reunioes','atualizacoes','decisoes','combinados','config','schema_migrations','auth_contas'];
    const antes = await Promise.all(preservadas.map(tabela=>db.prepare(`select * from ${tabela}`).all()));
    assert.ok((await db.prepare('select count(*) n from acoes').get()).n > 0);
    const primeira = await db.prepare('select id from acoes order by id limit 1').get();
    await db.prepare('update acoes set acao_pai_id=? where id!=?').run(primeira.id,primeira.id);
    await db.exec(await readFile(new URL('../../scripts/limpar-acoes-piloto.sql',import.meta.url),'utf8'));
    for (const tabela of ['acoes','acao_comentarios','tempo','pedidos_prazo']) assert.equal((await db.prepare(`select count(*) n from ${tabela}`).get()).n,0);
    assert.deepEqual(await Promise.all(preservadas.map(tabela=>db.prepare(`select * from ${tabela}`).all())),antes);
  });

  await t.test('gestão exclui ações de autoria do Diretor e Apoio', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    const call = await servir(t,db);
    for (const autor of [1,2]) {
      const a = await call('POST','/acoes',{titulo:'Gestão',secao_id:1,prazo:'2030-01-01'},autor);
      assert.equal(a.status,201);
      assert.equal((await call('DELETE',`/acoes/${a.data.id}`,undefined,autor===1?2:1)).status,200);
    }
    const chefe = await call('POST','/acoes',{titulo:'Seção',prazo:'2030-01-01'},3);
    assert.equal((await call('DELETE',`/acoes/${chefe.data.id}`,undefined,2)).status,403);
  });

  await t.test('CRUD: transações, edição de hierarquia e exclusão respeitam vínculos', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    const call = await servir(t,db);
    const s = await call('POST','/secoes',{nome:'Nova CRUD',tipo:'centro'});
    assert.equal(s.status,201);
    const u = await call('POST','/usuarios',{nome:'Novo CRUD',perfil:'chefe'});
    assert.equal((await call('PATCH',`/usuarios/${u.data.id}`,{secao_id:s.data.id})).status,200);
       assert.equal((await call('DELETE',`/secoes/${s.data.id}`)).status,409);
    assert.equal((await call('PATCH',`/secoes/${s.data.id}`,{tipo:'subsecao',pai_id:s.data.id})).status,400);
    assert.equal((await call('DELETE',`/usuarios/${u.data.id}`)).status,200);
    assert.equal((await call('DELETE',`/secoes/${s.data.id}`)).status,200);
  });

  await t.test('cadastro: concorrência de chefes mantém uma atribuição e um vínculo', async t => {
    const [db, outro] = await cluster.banco(t);
    await seed(db);
    await db.prepare('update secoes set chefe_id=null where id=1').run();
    let criadas=0, liberar;
    const barreira=new Promise(resolve=>{liberar=resolve;});
    const removidas=[];
    const resultados=await Promise.allSettled([db,outro].map((b,i)=>cadastrarChefe(b,{supabaseUrl:'https://projeto.supabase.co'},{
      criar:async()=>{ if(++criadas===2) liberar(); await barreira; return `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`; },
      remover:async id=>{removidas.push(id);},
    },{nome:`Novo ${i}`,email:`novo${i}@example.org`,senha:'Senha inicial longa',secao_id:1})));
    assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(removidas.length,1);
    assert.equal((await db.prepare('select count(*) as n from auth_contas').get()).n,1);
    assert.equal((await db.prepare("select count(*) as n from usuarios where email like 'novo%@example.org'").get()).n,1);
    const anterior = (await db.prepare('select chefe_id from secoes where id=1').get()).chefe_id;
    const novo = await cadastrarChefe(db,{supabaseUrl:'https://projeto.supabase.co'}, {
      criar:async()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    },{nome:'Substituto',email:'substituto@example.org',senha:'Senha inicial longa',secao_id:1,substituir_chefe_id:anterior});
    assert.equal((await db.prepare('select chefe_id from secoes where id=1').get()).chefe_id,novo.id);
    assert.equal((await db.prepare('select secao_id from usuarios where id=?').get(anterior)).secao_id,null);
  });

  await t.test('integridade: chefes e históricos têm a mesma proteção do SQLite', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    await conferirIntegridade(db);
  });

  await t.test('catálogos: todas as FKs possuem os mesmos destinos e regras de exclusão/atualização', async t => {
    const [db] = await cluster.banco(t);
    await aplicarMigracoes(db);
    const sqlite = openDb(':memory:');
    t.after(() => sqlite.close());
    await aplicarMigracoes(sqlite);
    const tabelas = await sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all();
    const regras = { 'NO ACTION': 'a', RESTRICT: 'r', CASCADE: 'c', 'SET NULL': 'n', 'SET DEFAULT': 'd' };
    const locais = [];
    for (const { name } of tabelas) {
      for (const fk of await sqlite.prepare(`pragma foreign_key_list(${name})`).all()) {
        locais.push([name, fk.from, fk.table, fk.to, regras[fk.on_delete], regras[fk.on_update]].join(':'));
      }
    }
    const pg = await db.prepare(`select t.relname as tabela, a.attname as coluna, p.relname as pai,
      pa.attname as destino, c.confdeltype, c.confupdtype from pg_constraint c
      join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
      join pg_attribute a on a.attrelid = t.oid and a.attnum = c.conkey[1]
      join pg_class p on p.oid = c.confrelid
      join pg_attribute pa on pa.attrelid = p.oid and pa.attnum = c.confkey[1]
      where c.contype = 'f' and n.nspname = current_schema()`).all();
    assert.deepEqual(pg.map(c => [c.tabela, c.coluna, c.pai, c.destino, c.confdeltype, c.confupdtype].join(':')).sort(), locais.sort());
  });

  await t.test('migração de cascatas antigas preserva dados e reverte DDL parcial em caso de falha', async t => {
    const [db] = await cluster.banco(t);
    const relacoes = [['acao_comentarios', 'acao_id', 'acoes'], ['tempo', 'acao_id', 'acoes'],
      ['pedidos_prazo', 'acao_id', 'acoes'], ['decisoes', 'reuniao_id', 'reunioes']];
    for (const [tabela, coluna, pai] of relacoes) {
      await db.exec(`alter table ${tabela} drop constraint ${tabela}_${coluna}_fkey,
        add constraint ${tabela}_${coluna}_fkey foreign key (${coluna}) references ${pai}(id) on delete cascade`);
    }
    await semearLegado(db);
    const antes = await Promise.all(relacoes.map(([nome]) => db.prepare(`select * from ${nome} order by id`).all()));
    // Divergência inesperada no último vínculo: os três ALTER anteriores devem ser desfeitos.
    await db.exec(`alter table decisoes drop constraint decisoes_reuniao_id_fkey,
      add constraint decisoes_reuniao_id_fkey foreign key (reuniao_id) references reunioes(id) on delete set null`);
    await assert.rejects(aplicarMigracoes(db), /chave estrangeira inesperada em decisoes/);
    assert.equal((await db.prepare("select confdeltype from pg_constraint where conname = 'tempo_acao_id_fkey'").get()).confdeltype, 'c');
    assert.equal((await db.prepare('select count(*) n from schema_migrations').get()).n, 2);
    await db.exec(`alter table decisoes drop constraint decisoes_reuniao_id_fkey,
      add constraint decisoes_reuniao_id_fkey foreign key (reuniao_id) references reunioes(id) on delete cascade`);
    assert.deepEqual(await aplicarMigracoes(db), [3, 4, 5, 6]);
    assert.deepEqual(await Promise.all(relacoes.map(([nome]) => db.prepare(`select * from ${nome} order by id`).all())), antes);
    await conferirIntegridade(db);
  });

  await t.test('migrações simultâneas em pools independentes são idempotentes', async () => {
    const [a, b] = await cluster.banco();
    await assert.rejects(verificarMigracoes(a), /Migrações pendentes/);
    const resultados = await Promise.all([aplicarMigracoes(a), aplicarMigracoes(b)]);
    assert.deepEqual(resultados.flat().sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    await verificarMigracoes(b);
    assert.deepEqual(await aplicarMigracoes(a), []);
  });

  await t.test('falha de DDL desfaz coluna, índice e registro de versões', async () => {
    const [db] = await cluster.banco();
    await db.exec('alter table acoes drop column arquivada');
    // Nome ocupado força falha real depois de a primeira migração e o primeiro índice serem criados.
    await db.exec('create table uq_reuniao_em_andamento (id integer)');
    await assert.rejects(aplicarMigracoes(db), { code: '42P07' });
    assert.equal((await db.prepare("select to_regclass('schema_migrations') as nome").get()).nome, null);
    assert.equal((await db.prepare("select to_regclass('uq_pedido_pendente_acao') as nome").get()).nome, null);
    assert.equal((await db.prepare("select count(*) n from information_schema.columns where table_name = 'acoes' and column_name = 'arquivada'").get()).n, 0);
    await db.exec('drop table uq_reuniao_em_andamento');
    assert.deepEqual(await aplicarMigracoes(db), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
  });

  await t.test('versão 11 recria a restrição de tipo e aceita a Diretoria Adjunta sem perder seções', async () => {
    const [db] = await cluster.banco();
    await aplicarMigracoes(db);
    await db.prepare("insert into secoes (nome, tipo, criada_em) values ('Centro', 'centro', 'x')").run();
    // Reproduz o banco anterior: restrição sem diretoria_adjunta e versão 11 ainda não aplicada.
    await db.exec(`alter table secoes drop constraint secoes_tipo_check;
      alter table secoes add constraint secoes_tipo_antigo check (tipo in ('centro','coordenacao','subsecao'));
      delete from schema_migrations where id = 11`);
    const antes = await db.prepare('select * from secoes order by id').all();
    await assert.rejects(db.prepare("insert into secoes (nome, tipo, criada_em) values ('DA', 'diretoria_adjunta', 'x')").run(), { code: '23514' });
    assert.deepEqual(await aplicarMigracoes(db), [11]);
    assert.deepEqual(await db.prepare('select * from secoes order by id').all(), antes);
    await db.prepare("insert into secoes (nome, tipo, criada_em) values ('DA', 'diretoria_adjunta', 'x')").run();
    await assert.rejects(db.prepare("insert into secoes (nome, tipo, criada_em) values ('X', 'outro', 'x')").run(), { code: '23514' });
    assert.deepEqual(await aplicarMigracoes(db), []);
  });

  await t.test('rollback não desfaz outra conexão nem expõe dados sem commit', async () => {
    const [a, b] = await cluster.banco();
    let liberar, avisar;
    const espera = new Promise(r => { liberar = r; });
    const iniciou = new Promise(r => { avisar = r; });
    const operacao = a.transaction(async () => {
      await a.prepare('insert into config values (?, ?)').run('perdida', '1');
      avisar();
      await espera;
      await a.exec('select 1/0');
    });
    const rejeicao = assert.rejects(operacao, { code: '22012' });
    await iniciou;
    try {
      assert.equal(await b.prepare('select * from config where chave = ?').get('perdida'), null);
      await b.transaction(() => b.prepare('insert into config values (?, ?)').run('mantida', '2'));
    } finally { liberar(); }
    await rejeicao;
    assert.deepEqual(await a.prepare('select * from config').all(), [{ chave: 'mantida', valor: '2' }]);
  });

  async function api(t) {
    const [a, b] = await cluster.banco(t);
    await seed(a);
    return { db: a, chamadas: [await servir(t, a), await servir(t, b)] };
  }

  await t.test('API continua excluindo ação própria e dependentes explicitamente', async t => {
    const { db, chamadas: [call] } = await api(t);
    const criada = await call('POST', '/acoes', { titulo: 'Exclusão permitida', prazo: '2026-09-30' }, 3);
    assert.equal(criada.status, 201);
    const id = criada.data.id;
    await db.prepare("insert into tempo (acao_id, data, minutos, criado_em) values (?, '2026-09-19', 10, '2026-09-19')").run(id);
    assert.equal((await call('POST', `/acoes/${id}/pedido-prazo`, { novo_prazo: '2026-10-30', justificativa: 'Teste' }, 3)).status, 201);
    assert.equal((await call('DELETE', `/acoes/${id}`, undefined, 3)).status, 200);
    assert.equal(await db.prepare('select id from acoes where id = ?').get(id), null);
    for (const nome of ['acao_comentarios', 'tempo', 'pedidos_prazo']) {
      assert.equal((await db.prepare(`select count(*) n from ${nome} where acao_id = ?`).get(id)).n, 0);
    }
  });

  await t.test('duas APIs: pedidos e decisões concorrentes têm um vencedor', async t => {
    const { db, chamadas: c } = await api(t);
    const pedidos = await Promise.all(Array.from({ length: 8 }, (_, i) => c[i % 2]('POST', '/acoes/1/pedido-prazo', {
      novo_prazo: '2026-11-30', justificativa: 'Replanejamento',
    }, 3)));
    assert.equal(pedidos.filter(r => r.status === 201).length, 1);
    assert.equal(pedidos.filter(r => r.status === 409).length, 7);
    const pedido = await db.prepare('select * from pedidos_prazo where acao_id = 1').get();
    const decisoes = await Promise.all(c.map((call, i) => call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: i === 0 })));
    assert.deepEqual(decisoes.map(r => r.status).sort(), [200, 409]);
    const status = decisoes.find(r => r.status === 200).data.status;
    assert.equal((await db.prepare('select prazo from acoes where id = 1').get()).prazo,
      status === 'aprovado' ? pedido.novo_prazo : pedido.prazo_atual);
  });

  await t.test('duas APIs: versões semanais são únicas e preservam cada envio', async t => {
    const { db, chamadas: c } = await api(t);
    const respostas = await Promise.all(Array.from({ length: 8 }, (_, i) => c[i % 2]('PUT', '/atualizacao', {
      semana: '2026-09-22', proximo: [`Entrega ${i}`],
    }, 4)));
    assert.ok(respostas.every(r => r.status === 200), JSON.stringify(respostas));
    assert.deepEqual(respostas.map(r => r.data.versao).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
    respostas.forEach((r, i) => assert.deepEqual(r.data.proximo, [`Entrega ${i}`]));
    assert.equal((await db.prepare("select count(*) n from atualizacoes where secao_id = 2 and semana = '2026-09-22'").get()).n, 8);
  });

  await t.test('duas APIs: abertura, encerramento e reabertura serializam reuniões', async t => {
    const { db, chamadas: c } = await api(t);
    const inicios = await Promise.all(Array.from({ length: 8 }, (_, i) => c[i % 2]('POST', '/reunioes/iniciar')));
    assert.equal(inicios.filter(r => r.status === 201).length, 1);
    assert.equal(inicios.filter(r => r.status === 200 && r.data.retomada).length, 7);
    assert.equal(new Set(inicios.map(r => r.data.reuniao.id)).size, 1);
    const id = inicios[0].data.reuniao.id;
    const finais = await Promise.all(c.map(call => call('POST', `/reunioes/${id}/encerrar`)));
    assert.deepEqual(finais.map(r => r.status).sort(), [200, 409]);
    const outro = (await c[0]('POST', '/reunioes/iniciar')).data.reuniao.id;
    assert.equal((await c[0]('POST', `/reunioes/${outro}/encerrar`)).status, 200);
    const reaberturas = await Promise.all([c[0]('POST', `/reunioes/${id}/reabrir`), c[1]('POST', `/reunioes/${outro}/reabrir`)]);
    assert.deepEqual(reaberturas.map(r => r.status).sort(), [200, 409]);
    assert.equal((await db.prepare("select count(*) n from reunioes where status = 'em_andamento'").get()).n, 1);
  });

  await t.test('erro real ao gravar prazo desfaz a decisão na API', async t => {
    const { db, chamadas: [call] } = await api(t);
    const pedido = await db.prepare("select * from pedidos_prazo where status = 'pendente'").get();
    await db.exec(`create function impedir_prazo() returns trigger language plpgsql as $$
      begin raise exception 'Falha de escrita para teste'; end $$;
      create trigger impedir_prazo before update of prazo on acoes for each row execute function impedir_prazo()`);
    t.mock.method(console, 'error', () => {});
    assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 500);
    assert.deepEqual(await db.prepare('select * from pedidos_prazo where id = ?').get(pedido.id), pedido);
    assert.equal((await db.prepare('select prazo from acoes where id = ?').get(pedido.acao_id)).prazo, pedido.prazo_atual);
    await db.exec('drop trigger impedir_prazo on acoes');
    assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 200);
  });

  await t.test('carga de demonstração permite criar seções após IDs explícitos', async t => {
    const { db, chamadas: [call] } = await api(t);
    const resposta = await call('POST', '/secoes', { nome: 'Novo centro', tipo: 'centro' });
    assert.equal(resposta.status, 201, JSON.stringify(resposta));
    assert.ok(resposta.data.id > 9);
    const usuario = await db.prepare("insert into usuarios (nome, perfil) values ('Novo apoio', 'apoio')").run();
    assert.ok(usuario.lastInsertRowid > 9);
  });

  await t.test('índices impedem duplicidades também fora da API', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    const pedido = await db.prepare("select * from pedidos_prazo where status = 'pendente'").get();
    await assert.rejects(db.prepare(`insert into pedidos_prazo (acao_id, prazo_atual, novo_prazo, justificativa, criado_em)
      values (?, ?, ?, 'Duplicado', '2026-09-19')`).run(pedido.acao_id, pedido.prazo_atual, pedido.novo_prazo),
    { code: '23505', constraint: 'uq_pedido_pendente_acao' });
    const inserir = db.prepare("insert into reunioes (data, semana, iniciada_em) values ('2026-09-22', '2026-09-22', '2026-09-22T10:00:00')");
    await inserir.run();
    await assert.rejects(inserir.run(), { code: '23505', constraint: 'uq_reuniao_em_andamento' });
  });

  await t.test('duplicidades legadas interrompem migração sem remover registros', async t => {
    const [db] = await cluster.banco(t);
    await db.exec(`insert into reunioes (data, semana, iniciada_em)
      values ('2026-09-22', '2026-09-22', '2026-09-22'), ('2026-09-22', '2026-09-22', '2026-09-22')`);
    await assert.rejects(aplicarMigracoes(db), /reuniões simultâneas/);
    assert.equal((await db.prepare('select count(*) n from reunioes').get()).n, 2);
    assert.equal((await db.prepare("select to_regclass('schema_migrations') as nome").get()).nome, null);
  });

  await t.test('ações e decisões concorrentes ao encerramento entram na ata ou são recusadas', async t => {
    const { chamadas: c } = await api(t);
    const id = (await c[0]('POST', '/reunioes/iniciar')).data.reuniao.id;
    const [acao, decisao, encerrada] = await Promise.all([
      c[0]('POST', `/reunioes/${id}/acoes`, { titulo: 'Ação concorrente', destino: 'todos', prazo: '2026-12-31' }),
      c[1]('POST', `/reunioes/${id}/decisoes`, { texto: 'Decisão concorrente' }),
      c[1]('POST', `/reunioes/${id}/encerrar`),
    ]);
    assert.equal(encerrada.status, 200);
    for (const [r, texto] of [[acao, 'Ação concorrente'], [decisao, 'Decisão concorrente']]) {
      assert.ok([201, 409].includes(r.status), JSON.stringify(r));
      assert.equal(encerrada.data.ata_texto.includes(texto), r.status === 201);
    }
    const [envio, edicao] = await Promise.all([
      c[0]('POST', `/reunioes/${id}/enviar-ata`),
      c[1]('PUT', `/reunioes/${id}/ata`, { ata_texto: 'Revisão concorrente' }),
    ]);
    assert.equal(envio.status, 200);
    assert.ok([200, 409].includes(edicao.status));
    assert.ok([envio.data.ata_texto, 'Revisão concorrente'].includes((await c[1]('GET', `/reunioes/${id}`)).data.ata_texto));
  });
  await t.test('membro da equipe: atribuição, execução e validação do chefe, e demanda externa, no PostgreSQL', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    await db.prepare("insert into usuarios (nome, email, perfil, secao_id) values ('Marta Lima', 'marta@exemplo.invalid', 'membro', 1)").run();
    const marta = (await db.prepare("select id from usuarios where perfil = 'membro'").get()).id;
    await assert.rejects(db.prepare("insert into usuarios (nome, perfil) values ('Fora', 'outro')").run(), { code: '23514' }, 'a restrição de perfil continua valendo');
    const call = await servir(t, db);
    const ANA = 3, DIRETOR = 1;

    const acao = (await call('POST', '/acoes', { titulo: 'Mapear convênios', prazo: '2026-12-31', responsavel_id: marta }, ANA)).data;
    assert.equal(acao.responsavel_id, marta);
    assert.equal((await call('GET', '/bootstrap', undefined, marta)).data.acoes_novas, 1);
    assert.equal((await call('GET', `/acoes/${acao.id}`, undefined, marta)).data.pode_executar, true);
    assert.equal((await call('PATCH', `/acoes/${acao.id}`, { titulo: 'Outro' }, marta)).status, 403);
    assert.equal((await call('PATCH', `/acoes/${acao.id}`, { status: 'em_andamento' }, marta)).status, 200);
    assert.equal((await call('POST', `/acoes/${acao.id}/tempo`, { minutos: 30 }, marta)).status, 201);
    const tarefa = (await call('POST', `/acoes/${acao.id}/checklist`, { texto: 'Levantar dados', data: '2026-10-01', responsavel_id: marta }, marta)).data;
    assert.equal((await call('GET', '/tarefas', undefined, marta)).data.find(x => x.id === tarefa.id).pode_marcar, true);
    assert.equal((await call('PATCH', `/acoes/${acao.id}`, { status: 'concluida' }, marta)).status, 200);

    assert.equal((await call('GET', `/acoes/${acao.id}`, undefined, ANA)).data.aguardando_validacao, 'chefe');
    assert.equal((await call('GET', '/bootstrap', undefined, ANA)).data.acoes_a_validar, 1);
    assert.equal((await call('POST', `/acoes/${acao.id}/encerrar`, undefined, DIRETOR)).status, 409, 'não é demanda do Diretor');
    assert.equal((await call('POST', `/acoes/${acao.id}/validar`, undefined, ANA)).status, 200);
    assert.equal((await call('GET', `/acoes/${acao.id}`, undefined, ANA)).data.aguardando_validacao, null);
    assert.equal((await call('GET', '/equipe', undefined, ANA)).data.length, 1);
    assert.equal((await call('GET', '/reunioes', undefined, marta)).status, 403);

    const externa = (await call('POST', '/acoes', { titulo: 'Responder ofício', prazo: '2026-12-31', demandante_externo: 'Tribunal de Contas' }, ANA)).data;
    assert.ok((await call('GET', '/acoes?origem=externa', undefined, DIRETOR)).data.some(a => a.id === externa.id));
  });
  await t.test('multi-empresa: Empresa 1 com todos os dados, padrão 1 para a versão anterior e próxima empresa com o número 2', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    assert.equal((await db.prepare('select count(*) n from empresas').get()).n, 1);
    for (const tabela of ['secoes', 'usuarios', 'diretrizes', 'acoes', 'combinados', 'avisos', 'reunioes', 'atualizacoes', 'config']) {
      assert.equal((await db.prepare(`select count(*) n from ${tabela} where empresa_id <> 1`).get()).n, 0, tabela);
    }
    // O código anterior insere sem empresa e faz upsert por chave: os dois continuam valendo.
    await db.prepare("insert into config (chave, valor) values ('reuniao_hora', '10:00') on conflict(chave) do update set valor = excluded.valor").run();
    await db.prepare("insert into config (chave, valor) values ('reuniao_hora', '09:00') on conflict(chave) do update set valor = excluded.valor").run();
    assert.equal((await db.prepare("select valor, empresa_id from config where chave = 'reuniao_hora'").get()).empresa_id, 1);
    await db.prepare("insert into empresas (nome, slug, criada_em) values ('Empresa B', 'empresa-b', '2026-02-01')").run();
    assert.equal(Number((await db.prepare("select id from empresas where slug = 'empresa-b'").get()).id), 2);
    await assert.rejects(db.prepare("insert into secoes (nome, sigla, tipo, ordem, criada_em, empresa_id) values ('X', 'X', 'centro', 1, '2026-02-01', 99)").run(), { code: '23503' });
    await assert.rejects(db.prepare("insert into empresas (nome, slug, criada_em) values ('Repetida', 'empresa-b', '2026-02-01')").run(), { code: '23505' });
  });
  await t.test('multi-empresa: duas empresas no PostgreSQL não se enxergam e cada uma tem a sua reunião, configuração e acesso por número', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    // Esquema da fase de contração (ainda não publicada): sem as chaves únicas globais de config e de reunião em andamento.
    await db.exec('drop index if exists uq_reuniao_em_andamento');
    await db.exec('alter table config drop constraint config_pkey');
    await db.exec('alter table config add primary key (empresa_id, chave)');
    await db.prepare("insert into empresas (nome, slug, criada_em) values ('Empresa ZB', 'zb', '2026-09-01')").run();
    await db.prepare("insert into secoes (nome, sigla, tipo, ordem, criada_em, empresa_id) values ('Centro Alfa ZB', 'ZBA', 'centro', 1, '2026-09-01', 2)").run();
    const alfa = (await db.prepare("select id from secoes where empresa_id = 2").get()).id;
    await db.prepare("insert into usuarios (nome, email, perfil, empresa_id) values ('Diretor ZB', 'diretor@zb.invalid', 'diretor', 2)").run();
    await db.prepare("insert into usuarios (nome, email, perfil, secao_id, empresa_id) values ('Chefe ZB', 'chefe@zb.invalid', 'chefe', ?, 2)").run(alfa);
    const dirB = (await db.prepare("select id from usuarios where email = 'diretor@zb.invalid'").get()).id;
    const chefeB = (await db.prepare("select id from usuarios where email = 'chefe@zb.invalid'").get()).id;
    await db.prepare('update secoes set chefe_id = ? where id = ?').run(chefeB, alfa);
    const call = await servir(t, db);
    const DIRETOR_A = 1, acaoA = (await db.prepare('select id from acoes where empresa_id = 1 order by id limit 1').get()).id;

    assert.equal((await call('POST', '/diretrizes', { titulo: 'Diretriz ZB', prazo: '2026-12-31', destino: 'todos' }, dirB)).data.acoes_criadas, 1);
    const acaoB = (await db.prepare('select id from acoes where empresa_id = 2').get()).id;
    // Configuração: o upsert por (empresa, chave) funciona e cada empresa tem o seu valor.
    assert.equal((await call('PUT', '/config', { combinados_frequencia: 'sempre', reuniao_hora: '15:00' }, dirB)).status, 200);
    assert.equal((await call('PUT', '/config', { combinados_frequencia: 'sempre', reuniao_hora: '09:30' }, DIRETOR_A)).status, 200);
    assert.equal((await call('PUT', '/config', { combinados_frequencia: 'sempre', reuniao_hora: '09:45' }, DIRETOR_A)).status, 200);
    assert.equal((await call('GET', '/config', undefined, dirB)).data.reuniao_hora, '15:00');
    assert.equal((await call('GET', '/config', undefined, DIRETOR_A)).data.reuniao_hora, '09:45');
    assert.equal((await call('PUT', '/config/ata', { ata_cabecalho: 'Cabeçalho ZB', ata_brasao: '' }, dirB)).status, 200);
    assert.notEqual((await call('GET', '/config', undefined, DIRETOR_A)).data.ata_cabecalho, 'Cabeçalho ZB');
    // Uma reunião em andamento por empresa.
    const reuniaoB = (await call('POST', '/reunioes/iniciar', undefined, dirB)).data.reuniao.id;
    const reuniaoA = (await call('POST', '/reunioes/iniciar', undefined, DIRETOR_A)).data.reuniao.id;
    assert.notEqual(reuniaoA, reuniaoB);
    assert.equal((await call('POST', '/reunioes/iniciar', undefined, dirB)).data.retomada, true);
    // Leituras e acesso por número.
    const acaoAntes = await db.prepare('select * from acoes where id = ?').get(acaoA);
    const listaA = (await call('GET', '/acoes?escopo=todos&situacao=abertas', undefined, DIRETOR_A)).data;
    const listaB = (await call('GET', '/acoes?escopo=todos&situacao=abertas', undefined, dirB)).data;
    assert.ok(listaA.length > 3 && listaB.length === 1);
    assert.ok(listaA.every((a) => a.id !== acaoB) && listaB.every((a) => a.id !== acaoA));
    assert.equal((await call('GET', `/acoes/${acaoA}`, undefined, dirB)).status, 404);
    assert.equal((await call('PATCH', `/acoes/${acaoA}`, { prioridade: 'alta' }, chefeB)).status, 404);
    assert.equal((await call('GET', `/reunioes/${reuniaoA}`, undefined, dirB)).status, 404);
    assert.equal((await call('POST', `/reunioes/${reuniaoA}/encerrar`, {}, dirB)).status, 404);
    assert.equal((await call('GET', `/acoes/${acaoB}`, undefined, DIRETOR_A)).status, 404);
    assert.equal((await call('GET', '/usuarios', undefined, dirB)).data.length, 2);
    assert.deepEqual((await call('GET', '/secoes', undefined, dirB)).data.map((x) => x.id), [alfa]);
    assert.equal((await db.prepare('select status from reunioes where id = ?').get(reuniaoA)).status, 'em_andamento');
    assert.deepEqual(await db.prepare('select * from acoes where id = ?').get(acaoA), acaoAntes, 'a ação da A não foi alterada');
  });
  await t.test('empresa:criar reconhece no PostgreSQL se o esquema já passou pela contração', async t => {
    const [db] = await cluster.banco(t);
    await seed(db);
    const { esquemaContraido } = await import('../../server/criar-empresa.js');
    assert.equal(await esquemaContraido(db), false);
    await db.exec('drop index if exists uq_reuniao_em_andamento');
    assert.equal(await esquemaContraido(db), false, 'a chave única de config.chave ainda existe');
    await db.exec('alter table config drop constraint config_pkey');
    await db.exec('alter table config add primary key (empresa_id, chave)');
    assert.equal(await esquemaContraido(db), true);
  });
});
