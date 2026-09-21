import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';

process.env.SGC_NOW = '2026-09-19T10:00:00';

async function servir(t, db) {
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  }));
  return async (method, caminho, body, usuario = 1) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method,
      headers: { 'x-user-id': String(usuario), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return { status: response.status, data: await response.json() };
  };
}

test('API: falha assíncrona de identificação retorna 500 sem expor detalhes do banco', async (t) => {
  t.mock.method(console, 'error', () => {});
  const db = { prepare: () => ({ get: async () => { throw new Error('Detalhe privado da conexão'); } }) };
  const call = await servir(t, db);
  const resposta = await call('GET', '/bootstrap');
  assert.equal(resposta.status, 500);
  assert.deepEqual(resposta.data, { erro: 'Erro interno. Tente novamente.' });
});

test('API: pedidos internos não aparecem na pauta nem podem ser decididos pela gestão', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const acao = await db.prepare('select * from acoes where interna = 1 and secao_id = 7').get();
  const novoPrazo = '2099-12-31';
  assert.equal((await call('POST', `/acoes/${acao.id}/pedido-prazo`, {
    novo_prazo: novoPrazo, justificativa: 'Informação interna da seção',
  }, 9)).status, 201);
  const pedido = await db.prepare('select * from pedidos_prazo where acao_id = ?').get(acao.id);
  const reuniao = (await call('POST', '/reunioes/iniciar')).data.reuniao;
  for (const usuario of [1, 2]) {
    const pauta = await call('GET', '/pauta', undefined, usuario);
    const cartoes = await call('GET', `/reunioes/${reuniao.id}/cartoes`, undefined, usuario);
    const pedidos = await call('GET', '/pedidos-prazo', undefined, usuario);
    assert.ok(pauta.data.cartoes.every(c => c.pedidos.every(p => p.id !== pedido.id)));
    assert.ok(cartoes.data.cartoes.every(c => c.pedidos.every(p => p.id !== pedido.id)));
    assert.ok(pedidos.data.every(p => p.id !== pedido.id));
    assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, {
      aprovar: true, reuniao_id: reuniao.id,
    }, usuario)).status, 404);
  }
  assert.equal((await db.prepare('select prazo from acoes where id = ?').get(acao.id)).prazo, acao.prazo);
  assert.equal((await call('GET', `/acoes/${acao.id}`, undefined, 9)).data.pedidos[0].id, pedido.id);

  // Registros legados indevidamente decididos também não expõem conteúdo na reunião/ata nova.
  await db.prepare("update pedidos_prazo set status = 'aprovado', reuniao_id = ? where id = ?").run(reuniao.id, pedido.id);
  assert.ok((await call('GET', `/reunioes/${reuniao.id}`)).data.pedidos_decididos.every(p => p.id !== pedido.id));
  const encerrada = await call('POST', `/reunioes/${reuniao.id}/encerrar`);
  assert.ok(!encerrada.data.ata_texto.includes(acao.titulo));

  // A exceção explícita de compartilhamento permanece permitida.
  await db.prepare("update pedidos_prazo set status = 'pendente' where id = ?").run(pedido.id);
  await db.prepare('update acoes set compartilhada = 1 where id = ?').run(acao.id);
  assert.ok((await call('GET', '/pedidos-prazo')).data.some(p => p.id === pedido.id));
  assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 200);
});

test('API: criação e reordenação tratam pais nulos e não nulos com SQL portátil', async (t) => {
  const db = openDb(':memory:');
  await seed(db);
  t.after(() => db.close());
  const preparar = db.prepare.bind(db);
  db.prepare = (sql) => {
    assert.doesNotMatch(sql, /\bis\s+\?/i, 'IS com parâmetro não é compatível com PostgreSQL');
    return preparar(sql);
  };
  const call = await servir(t, db);
  const primeiro = await call('POST', '/secoes', { nome: 'Primeiro centro', tipo: 'centro' });
  const segundo = await call('POST', '/secoes', { nome: 'Segundo centro', tipo: 'centro' });
  assert.equal(primeiro.status, 201);
  assert.equal(segundo.status, 201);
  assert.ok(segundo.data.ordem > primeiro.data.ordem);
  assert.equal((await call('PATCH', `/secoes/${segundo.data.id}`, { mover: 'cima' })).status, 200);

  const sub1 = await call('POST', '/secoes', { nome: 'Primeira subseção', tipo: 'subsecao', pai_id: primeiro.data.id });
  const sub2 = await call('POST', '/secoes', { nome: 'Segunda subseção', tipo: 'subsecao', pai_id: primeiro.data.id });
  assert.equal(sub1.status, 201);
  assert.equal(sub2.status, 201);
  assert.equal(sub1.data.ordem, 1);
  assert.equal(sub2.data.ordem, 2);
  assert.equal((await call('PATCH', `/secoes/${sub2.data.id}`, { mover: 'cima' })).status, 200);
  const lista = (await call('GET', '/secoes')).data;
  const centros = lista.filter(s => s.id === primeiro.data.id || s.id === segundo.data.id);
  assert.deepEqual(centros.map(s => s.id), [segundo.data.id, primeiro.data.id]);
  assert.deepEqual(lista.filter(s => s.pai_id === primeiro.data.id).map(s => s.id), [sub2.data.id, sub1.data.id]);
});

test('API: arquivar retira ação e pedido da operação sem apagar histórico ou tempo', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const id = (await call('POST', '/acoes', { titulo: 'Ação atrasada da seção', prazo: '2026-09-18' }, 3)).data.id;
  assert.ok(id);
  await call('POST', `/acoes/${id}/tempo`, { minutos: 30 }, 3);
  await call('POST', `/acoes/${id}/pedido-prazo`, { novo_prazo: '2026-10-01', justificativa: 'Replanejamento' }, 3);
  const pedido = await db.prepare('select id from pedidos_prazo where acao_id = ?').get(id);
  const painelAntes = (await call('GET', '/painel')).data.itens.find(i => i.secao.id === 1);
  assert.equal(painelAntes.atrasadas, 1);
  assert.equal((await call('POST', `/acoes/${id}/arquivar`, {}, 3)).status, 200);
  const painelDepois = (await call('GET', '/painel')).data.itens.find(i => i.secao.id === 1);
  assert.equal(painelDepois.atrasadas, 0);
  assert.equal(painelDepois.abertas, painelAntes.abertas - 1);
  assert.equal(painelDepois.pedidos_pendentes, painelAntes.pedidos_pendentes - 1);
  assert.equal(painelDepois.tempo_semana, painelAntes.tempo_semana);
  assert.equal(painelDepois.cor, 'amarelo');
  assert.ok((await call('GET', '/pauta')).data.cartoes.every(c => c.acoes.every(a => a.id !== id) && c.pedidos.every(p => p.id !== pedido.id)));
  assert.ok((await call('GET', '/secoes/1/detalhe')).data.acoes.every(a => a.id !== id));
  assert.ok((await call('GET', '/pedidos-prazo')).data.every(p => p.id !== pedido.id));
  assert.ok((await call('GET', '/pedidos-prazo?status=todos')).data.some(p => p.id === pedido.id));
  assert.ok((await call('GET', '/acoes?situacao=arquivadas', undefined, 3)).data.some(a => a.id === id));
  assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 409);
  assert.equal((await call('POST', `/acoes/${id}/pedido-prazo`, { novo_prazo: '2026-10-02', justificativa: 'Teste' }, 3)).status, 409);
  assert.equal((await call('POST', `/acoes/${id}/desarquivar`, {}, 3)).status, 200);
  assert.equal((await call('GET', '/painel')).data.itens.find(i => i.secao.id === 1).atrasadas, 1);
  assert.ok((await call('GET', '/pedidos-prazo')).data.some(p => p.id === pedido.id));
});

test('API: datas inexistentes retornam 400 sem criar ações', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const antes = (await db.prepare('select count(*) n from acoes').get()).n;
  for (const prazo of ['2026-13-01', '2027-02-29', '2026-11-31']) {
    assert.equal((await call('POST', '/acoes', { titulo: 'Data inválida', prazo }, 3)).status, 400);
    assert.equal((await call('POST', '/diretrizes', { titulo: 'Data inválida', prazo, destino: 'todos' })).status, 400);
  }
  assert.equal((await db.prepare('select count(*) n from acoes').get()).n, antes);
});

test('API: seção com ações arquivadas pode desativar, mas precisa reativar antes de restaurá-las', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const secao = (await call('POST', '/secoes', { nome: 'Centro temporário', tipo: 'centro', chefe_id: 3 })).data;
  const acao = (await call('POST', '/acoes', { titulo: 'Atividade temporária', prazo: '2026-09-30' }, 3)).data;
  assert.ok(acao.id);
  assert.equal((await call('POST', `/acoes/${acao.id}/arquivar`, {}, 3)).status, 200);
  assert.equal((await call('PATCH', `/secoes/${secao.id}`, { ativa: false })).status, 200);
  assert.equal((await call('POST', `/acoes/${acao.id}/desarquivar`, {}, 3)).status, 409);
  assert.equal((await call('POST', '/acoes', { titulo: 'Nova atividade', prazo: '2026-09-30' }, 3)).status, 409);
  assert.equal((await call('PATCH', `/secoes/${secao.id}`, { ativa: true })).status, 200);
  assert.equal((await call('POST', `/acoes/${acao.id}/desarquivar`, {}, 3)).status, 200);
});

test('API: pedidos simultâneos geram apenas um pendente e decisões concorrentes têm um vencedor', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const respostas = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/acoes/1/pedido-prazo', {
    novo_prazo: '2026-11-30', justificativa: 'Replanejamento',
  }, 3)));
  assert.equal(respostas.filter(r => r.status === 201).length, 1);
  assert.equal(respostas.filter(r => r.status === 409).length, 7);
  const pedidos = await db.prepare('select * from pedidos_prazo where acao_id = 1').all();
  assert.equal(pedidos.length, 1);
  const pedido = pedidos[0];
  const decisoes = await Promise.all([true, false].map(aprovar => call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar })));
  assert.deepEqual(decisoes.map(r => r.status).sort(), [200, 409]);
  const vencedor = decisoes.find(r => r.status === 200).data.status;
  assert.equal((await db.prepare('select status from pedidos_prazo where id = ?').get(pedido.id)).status, vencedor);
  assert.equal((await db.prepare('select prazo from acoes where id = 1').get()).prazo,
    vencedor === 'aprovado' ? pedido.novo_prazo : pedido.prazo_atual);
});

test('API: falha ao alterar prazo desfaz também a decisão do pedido', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  t.mock.method(console, 'error', () => {});
  await seed(db);
  const call = await servir(t, db);
  const pedido = await db.prepare("select * from pedidos_prazo where status = 'pendente'").get();
  const preparar = db.prepare.bind(db);
  db.prepare = sql => sql.startsWith('update acoes set prazo =')
    ? { run: async () => { throw new Error('Falha simulada de escrita'); } }
    : preparar(sql);
  assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 500);
  db.prepare = preparar;
  const preservado = await db.prepare('select * from pedidos_prazo where id = ?').get(pedido.id);
  assert.equal(preservado.status, 'pendente');
  assert.equal(preservado.decidido_em, null);
  assert.equal((await db.prepare('select prazo from acoes where id = ?').get(pedido.acao_id)).prazo, pedido.prazo_atual);
});

test('API: atualizações simultâneas recebem versões únicas e retornam o próprio conteúdo', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const respostas = await Promise.all(Array.from({ length: 6 }, (_, i) => call('PUT', '/atualizacao', {
    semana: '2026-09-22', proximo: [`Entrega ${i}`],
  }, 4)));
  assert.ok(respostas.every(r => r.status === 200));
  assert.deepEqual(respostas.map(r => r.data.versao).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  respostas.forEach((r, i) => assert.deepEqual(r.data.proximo, [`Entrega ${i}`]));
  assert.equal((await db.prepare('select count(*) n from atualizacoes where secao_id = 2 and semana = ?').get('2026-09-22')).n, 6);
});

test('API: semáforo propaga impedimento crítico da subseção e considera apenas a última versão', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  await db.prepare("update acoes set prazo = '2026-12-31' where secao_id in (1,7,9)").run();
  const centro = async () => (await call('GET', '/painel')).data.itens.find(i => i.secao.id === 1);
  assert.equal((await centro()).cor, 'verde');
  await call('PUT', '/atualizacao', {
    semana: '2026-09-22', proximo: ['Continuar trabalho'], impedimentos: ['Impedimento da subseção'], critico: true,
  }, 9);
  assert.equal((await centro()).cor, 'vermelho');
  assert.equal((await centro()).critico, true);
  assert.equal((await centro()).enviada, true, 'envio do Centro continua independente do envio da subseção');
  await call('PUT', '/atualizacao', {
    semana: '2026-09-22', proximo: ['Continuar trabalho'], impedimentos: [], critico: false,
  }, 9);
  assert.equal((await centro()).cor, 'verde');
  assert.equal((await centro()).critico, false);
  assert.equal((await db.prepare('select count(*) n from atualizacoes where secao_id = 7').get()).n, 2);
});

test('API: decisão exige booleano e recusa pedido cujo prazo de origem mudou', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const pedido = await db.prepare("select * from pedidos_prazo where status = 'pendente'").get();
  for (const aprovar of ['false', 1, null]) {
    assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar })).status, 400);
  }
  await db.prepare("update acoes set prazo = '2026-12-31' where id = ?").run(pedido.acao_id);
  assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: true })).status, 409);
  assert.equal((await db.prepare('select status from pedidos_prazo where id = ?').get(pedido.id)).status, 'pendente');
  assert.equal((await call('POST', `/pedidos-prazo/${pedido.id}/decidir`, { aprovar: false })).status, 200);
  assert.equal((await db.prepare('select prazo from acoes where id = ?').get(pedido.acao_id)).prazo, '2026-12-31');
});

test('API: inícios simultâneos retomam uma única reunião e encerramento tem um vencedor', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const inicios = await Promise.all(Array.from({ length: 8 }, () => call('POST', '/reunioes/iniciar')));
  assert.equal(inicios.filter(r => r.status === 201).length, 1);
  assert.equal(inicios.filter(r => r.status === 200 && r.data.retomada).length, 7);
  assert.equal(new Set(inicios.map(r => r.data.reuniao.id)).size, 1);
  const id = inicios[0].data.reuniao.id;
  const finais = await Promise.all([call('POST', `/reunioes/${id}/encerrar`), call('POST', `/reunioes/${id}/encerrar`)]);
  assert.deepEqual(finais.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.prepare("select count(*) n from reunioes where status = 'em_andamento'").get()).n, 0);
});

test('API: reaberturas simultâneas de rascunhos distintos não abrem duas reuniões', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const id = (await call('POST', '/reunioes/iniciar')).data.reuniao.id;
    await call('POST', `/reunioes/${id}/encerrar`);
    ids.push(id);
  }
  const resultados = await Promise.all(ids.map(id => call('POST', `/reunioes/${id}/reabrir`)));
  assert.deepEqual(resultados.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.prepare("select count(*) n from reunioes where status = 'em_andamento'").get()).n, 1);
});

test('API: edição concorrente ao envio não modifica ata já publicada', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const id = (await call('POST', '/reunioes/iniciar')).data.reuniao.id;
  await call('POST', `/reunioes/${id}/encerrar`);
  const [enviada, edicao] = await Promise.all([
    call('POST', `/reunioes/${id}/enviar-ata`),
    call('PUT', `/reunioes/${id}/ata`, { ata_texto: 'Edição concorrente' }),
  ]);
  assert.equal(enviada.status, 200);
  assert.ok([200, 409].includes(edicao.status));
  const atual = (await call('GET', `/reunioes/${id}`)).data;
  assert.equal(atual.status, 'enviada');
  assert.equal(atual.ata_texto, enviada.data.ata_texto);
  assert.equal((await call('PUT', `/reunioes/${id}/ata`, { ata_texto: 'Edição tardia' })).status, 409);
  assert.equal((await call('POST', `/reunioes/${id}/reabrir`)).status, 409);
});

test('API: ações e decisões concorrentes ao encerramento entram na ata ou são recusadas', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const id = (await call('POST', '/reunioes/iniciar')).data.reuniao.id;
  const [acao, decisao, encerrada] = await Promise.all([
    call('POST', `/reunioes/${id}/acoes`, { titulo: 'Ação concorrente', destino: 'todos', prazo: '2026-12-31' }),
    call('POST', `/reunioes/${id}/decisoes`, { texto: 'Decisão concorrente' }),
    call('POST', `/reunioes/${id}/encerrar`),
  ]);
  assert.equal(encerrada.status, 200);
  for (const [resposta, texto] of [[acao, 'Ação concorrente'], [decisao, 'Decisão concorrente']]) {
    assert.ok([201, 409].includes(resposta.status));
    assert.equal(encerrada.data.ata_texto.includes(texto), resposta.status === 201);
  }
  assert.equal((await call('POST', `/reunioes/${id}/acoes`, { titulo: 'Ação tardia', destino: 'todos', prazo: '2026-12-31' })).status, 409);
  assert.equal((await db.prepare("select count(*) n from diretrizes where titulo = 'Ação tardia'").get()).n, 0);
});

test('API: configuração inválida ou falha de gravação não deixa alterações parciais', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  t.mock.method(console, 'error', () => {});
  await seed(db);
  const call = await servir(t, db);
  const antes = (await call('GET', '/config')).data;
  for (const invalido of [{ reuniao_dia: 7 }, { reuniao_dia: false }, { reuniao_dia: '' }, { reuniao_dia: 4, reuniao_hora: '25:00' }]) {
    assert.equal((await call('PUT', '/config', { combinados_frequencia: 'quando_mudarem', ...invalido })).status, 400);
    assert.deepEqual((await call('GET', '/config')).data, antes);
  }
  const preparar = db.prepare.bind(db);
  db.prepare = sql => {
    const stmt = preparar(sql);
    if (!sql.startsWith('insert into config')) return stmt;
    return { ...stmt, run: async (...params) => {
      if (params[0] === 'reuniao_hora') throw new Error('Falha de gravação');
      return stmt.run(...params);
    } };
  };
  assert.equal((await call('PUT', '/config', { combinados_frequencia: 'quando_mudarem', reuniao_dia: 4, reuniao_hora: '11:00' })).status, 500);
  db.prepare = preparar;
  assert.deepEqual((await call('GET', '/config')).data, antes);
});

test('API: novo dia atualiza bootstrap e preserva consulta das semanas históricas', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  assert.equal((await call('PUT', '/config', { combinados_frequencia: 'sempre', reuniao_dia: 4, reuniao_hora: '11:30' })).status, 200);
  const boot = (await call('GET', '/bootstrap')).data;
  assert.equal(boot.fuso, 'America/Bahia');
  assert.equal(boot.reuniao_dia, 4);
  assert.equal(boot.reuniao_hora, '11:30');
  assert.equal(boot.semana, '2026-09-24');
  assert.equal(boot.fechamento, '2026-09-23T18:00:00');
  assert.equal(boot.config.reuniao_dia, '4');
  assert.equal((await call('GET', '/painel?semana=2026-09-22')).status, 200);
  assert.equal((await call('GET', '/pauta?semana=2026-09-22')).status, 200);
  assert.equal((await call('GET', '/atualizacao?semana=2026-09-22', undefined, 3)).status, 200);
  assert.equal((await call('GET', '/painel?semana=2026-09-23')).status, 400);
});

test('API: configurações concorrentes retornam conjuntos coerentes', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const call = await servir(t, db);
  const opcoes = [
    { combinados_frequencia: 'sempre', reuniao_dia: 0, reuniao_hora: '09:30' },
    { combinados_frequencia: 'quando_mudarem', reuniao_dia: 4, reuniao_hora: '11:00' },
  ];
  const respostas = await Promise.all(opcoes.map(o => call('PUT', '/config', o)));
  respostas.forEach((r, i) => {
    assert.equal(r.status, 200);
    assert.equal(r.data.combinados_frequencia, opcoes[i].combinados_frequencia);
    assert.equal(r.data.reuniao_dia, String(opcoes[i].reuniao_dia));
    assert.equal(r.data.reuniao_hora, opcoes[i].reuniao_hora);
  });
  const final = (await call('GET', '/config')).data;
  assert.ok(respostas.some(r => JSON.stringify(r.data) === JSON.stringify(final)));
});
