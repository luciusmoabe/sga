process.env.SGC_NOW = '2026-09-21T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { aplicarMigracoes } from '../server/migrations.js';
import { readFile } from 'node:fs/promises';

async function ambiente(t) {
  const db = openDb(':memory:');
  await seed(db);
  const suplente = (await db.prepare("insert into usuarios (nome, perfil, secao_id) values ('Suplente CPE', 'chefe', 1)").run()).lastInsertRowid;
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const api = async (uid, method, caminho, corpo) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { status: r.status, data: await r.json() };
  };
  const iniciar = async () => {
    const r = await api(1, 'POST', '/reunioes/iniciar', {});
    assert.equal(r.status, 201);
    return r.data.reuniao;
  };
  return { db, api, iniciar, suplente };
}

test('participantes seguem a ordem enviada e registros atualizam a ata sem perder decisões ou edições', async t => {
  const { api, iniciar } = await ambiente(t);
  const r = await iniciar();
  await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [4, 3, 1] });
  await api(1, 'POST', `/reunioes/${r.id}/decisoes`, { texto: 'Decisão preservada' });
  let ata = (await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {})).data.ata_texto;
  assert.ok(ata.indexOf('Bruno Carvalho') < ata.indexOf('Ana Ribeiro'));
  await api(1, 'POST', `/reunioes/${r.id}/enviar-ata`, {});
  const antes = (await api(1, 'GET', `/reunioes/${r.id}`)).data;
  assert.equal((await api(2, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Primeiro informe', ata_base: ata, ata_texto: ata + '\nNota manual preservada.' })).status, 201);
  const nova = (await api(1, 'GET', `/reunioes/${r.id}`)).data;
  assert.match(nova.ata_texto, /Nota manual preservada/);
  assert.match(nova.ata_texto, /Decisão preservada/);
  assert.ok(nova.ata_texto.indexOf('Informações:') > nova.ata_texto.indexOf('Novas ações:'));
  assert.equal((await api(1, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Base antiga', ata_base: ata, ata_texto: ata })).status, 409);
  assert.equal((await api(1, 'GET', `/reunioes/${r.id}`)).data.informacoes.length, 1, 'rollback da inclusão com base antiga');
  assert.equal((await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [1, 4, 3], ata_base: nova.ata_texto, ata_texto: nova.ata_texto })).status, 200);
  const final = (await api(1, 'GET', `/reunioes/${r.id}`)).data;
  assert.deepEqual(final.participantes.map(p => p.usuario_id), [1, 4, 3]);
  assert.ok(final.ata_texto.indexOf('Bruno Carvalho') < final.ata_texto.indexOf('Ana Ribeiro'));
  assert.ok(final.revisoes.some(v => v.ata_texto === antes.ata_texto));
  const info = final.informacoes[0];
  assert.equal((await api(1, 'DELETE', `/reunioes/${r.id}/informacoes/${info.id}`, { ata_base: final.ata_texto, ata_texto: final.ata_texto })).status, 200);
  assert.doesNotMatch((await api(1, 'GET', `/reunioes/${r.id}`)).data.ata_texto, /Primeiro informe/);
});

test('cabeçalho e brasão são persistidos, restritos à gestão e validados', async t => {
  const { api } = await ambiente(t);
  const png = await readFile(new URL('../public/imagens/brasao_PMBA.png', import.meta.url));
  const dados = { ata_cabecalho: 'POLÍCIA MILITAR DA BAHIA\nUnidade', ata_brasao: `data:image/png;base64,${png.toString('base64')}` };
  assert.equal((await api(3, 'PUT', '/config/ata', dados)).status, 403);
  assert.equal((await api(2, 'PUT', '/config/ata', dados)).status, 200);
  assert.equal((await api(3, 'GET', '/config')).data.ata_brasao, dados.ata_brasao);
  assert.equal((await api(1, 'PUT', '/config/ata', { ...dados, ata_brasao: 'data:image/svg+xml;base64,PHN2Zz4=' })).status, 400);
  assert.equal((await api(1, 'PUT', '/config/ata', { ...dados, ata_cabecalho: 'x'.repeat(1501) })).status, 400);
  assert.equal((await api(1, 'PUT', '/config/ata', { ...dados, ata_cabecalho: 'x\n'.repeat(13) })).status, 400);
  assert.equal((await api(1, 'GET', '/config')).data.ata_cabecalho, dados.ata_cabecalho);
  assert.equal((await api(1, 'PUT', '/config/ata', { ata_cabecalho: '', ata_brasao: '' })).status, 200);
});

test('gestão exclui reunião de teste vazia e pode iniciar outra; chefes não excluem', async t => {
  const { api, iniciar } = await ambiente(t);
  for (const uid of [1, 2, 10]) {
    const r = await iniciar();
    assert.equal((await api(3, 'DELETE', `/reunioes/${r.id}`, { excluir_teste: true })).status, 403);
    assert.equal((await api(uid, 'DELETE', `/reunioes/${r.id}`)).status, 409);
    assert.equal((await api(uid, 'DELETE', `/reunioes/${r.id}`, { excluir_teste: true })).status, 200);
    assert.equal((await api(1, 'GET', `/reunioes/${r.id}`)).status, 404);
  }
  assert.ok((await iniciar()).id);
});

test('exclusão de teste recusa presença, informação, decisão e pedido vinculado sem apagar registros', async t => {
  const { db, api, iniciar } = await ambiente(t);
  const r = await iniciar();
  const tentar = async () => assert.equal((await api(2, 'DELETE', `/reunioes/${r.id}`, { excluir_teste: true })).status, 409);
  await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3] }); await tentar();
  await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [] });
  await api(1, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Informação real' }); await tentar();
  const info = await db.prepare('select id from reuniao_informacoes where reuniao_id=?').get(r.id);
  await api(1, 'DELETE', `/reunioes/${r.id}/informacoes/${info.id}`);
  await api(1, 'POST', `/reunioes/${r.id}/decisoes`, { texto: 'Decisão real' }); await tentar();
  const decisao = await db.prepare('select id from decisoes where reuniao_id=?').get(r.id);
  await api(1, 'DELETE', `/reunioes/${r.id}/decisoes/${decisao.id}`);
  const pedido = await db.prepare('select id from pedidos_prazo limit 1').get();
  await db.prepare('update pedidos_prazo set reuniao_id=? where id=?').run(r.id, pedido.id); await tentar();
  assert.equal((await api(1, 'GET', `/reunioes/${r.id}`)).status, 200);
  assert.equal((await db.prepare('select reuniao_id from pedidos_prazo where id=?').get(pedido.id)).reuniao_id, r.id);
});

test('a seção sinaliza demanda do Diretor sem atribuir autoria ao Diretor', async (t) => {
  const { db, api } = await ambiente(t);
  const corpo = { titulo: 'Demanda recebida verbalmente', prazo: '2026-10-30', demanda_diretor: true, secao_id: 2 };
  const r = await api(3, 'POST', '/acoes', corpo);
  assert.equal(r.status, 201);
  assert.equal(r.data.demandada_diretor, true);
  assert.equal(r.data.criado_por, 3);
  assert.equal(r.data.secao_id, 1, 'o cliente não escolhe outra seção para o chefe');
  assert.equal(r.data.diretriz_id, null);
  const id = r.data.id;
  assert.equal((await api(1, 'GET', `/acoes/${id}`)).data.demandada_diretor, true);
  assert.match((await db.prepare('select texto from acao_comentarios where acao_id = ?').get(id)).texto, /informada pela seção/);
  assert.equal((await api(3, 'POST', '/acoes', { ...corpo, interna: true })).status, 400);
  assert.equal((await api(3, 'POST', '/acoes', { ...corpo, demanda_diretor: 'false' })).status, 400);
  assert.equal((await api(3, 'POST', `/acoes/${id}/arquivar`, {})).status, 200, 'marcar a origem não altera autoria nem os poderes da seção');
});

test('informações têm CRUD restrito à gestão e atualizam sua seção na ata após o encerramento', async (t) => {
  const { db, api, iniciar } = await ambiente(t);
  const r = await iniciar();
  assert.equal((await api(3, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Tentativa' })).status, 403);
  assert.equal((await api(2, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Comunicado' })).status, 201);
  const info = await db.prepare('select id from reuniao_informacoes where reuniao_id = ?').get(r.id);
  assert.equal((await api(10, 'PATCH', `/reunioes/${r.id}/informacoes/${info.id}`, { texto: 'Visita técnica na sexta.' })).status, 200);
  assert.equal((await api(3, 'PATCH', `/reunioes/${r.id}/informacoes/${info.id}`, { texto: 'Alteração' })).status, 403);
  assert.equal((await api(3, 'DELETE', `/reunioes/${r.id}/informacoes/${info.id}`)).status, 403);
  assert.equal((await api(1, 'POST', `/reunioes/${r.id}/informacoes`, { texto: '' })).status, 400);
  await api(1, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Apagar' });
  const excluir = await db.prepare('select max(id) id from reuniao_informacoes').get();
  assert.equal((await api(1, 'DELETE', `/reunioes/${r.id}/informacoes/${excluir.id}`)).status, 200);
  const encerrada = await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {});
  assert.match(encerrada.data.ata_texto, /Informações:\n- Visita técnica na sexta\./);
  assert.doesNotMatch(encerrada.data.ata_texto, /Apagar/);
  for (const metodo of ['POST', 'PATCH', 'DELETE']) {
    const caminho = `/reunioes/${r.id}/informacoes${metodo === 'POST' ? '' : `/${info.id}`}`;
    assert.equal((await api(1, metodo, caminho, { texto: 'Após encerramento' })).status, metodo === 'POST' ? 201 : 200);
  }
  assert.match((await api(1, 'GET', `/reunioes/${r.id}`)).data.ata_texto, /Informações:\n- Após encerramento/);
  const outra = await iniciar();
  assert.equal((await api(1, 'PATCH', `/reunioes/${outra.id}/informacoes/${info.id}`, { texto: 'Outra reunião' })).status, 404);
  await api(1, 'DELETE', `/reunioes/${outra.id}/informacoes/${info.id}`);
  assert.equal(await db.prepare('select texto from reuniao_informacoes where id = ?').get(info.id), undefined);
});

test('presença identifica titular e suplente; só participantes sugerem revisões após publicar', async (t) => {
  const { db, api, iniciar, suplente } = await ambiente(t);
  const r = await iniciar();
  assert.equal((await api(3, 'GET', `/reunioes/${r.id}/candidatos`)).status, 403);
  assert.equal((await api(1, 'GET', '/reunioes/999999/candidatos')).status, 404);
  assert.ok((await api(2, 'GET', `/reunioes/${r.id}/candidatos`)).data.some((u) => u.id === suplente));
  assert.equal((await api(3, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3] })).status, 403);
  assert.equal((await api(10, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [1, 3, suplente, 3] })).status, 200);
  assert.equal((await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3, 99999] })).status, 400);
  assert.equal((await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: ['3'] })).status, 400);
  assert.equal((await db.prepare('select count(*) n from reuniao_participantes where reuniao_id = ?').get(r.id)).n, 3);
  await db.prepare("update usuarios set nome = 'Nome atualizado' where id = 3").run();
  assert.equal((await api(3, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'correcao', texto: 'Antes de publicar' })).status, 409);
  const encerrada = await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {});
  assert.match(encerrada.data.ata_texto, /Ana Ribeiro/);
  assert.match(encerrada.data.ata_texto, /Suplente CPE/);
  assert.equal((await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [1, 3, suplente] })).status, 200);
  assert.equal((await api(3, 'GET', `/reunioes/${r.id}`)).status, 404);
  await api(2, 'POST', `/reunioes/${r.id}/enviar-ata`, {});
  for (const uid of [3, suplente]) {
    assert.equal((await api(uid, 'GET', `/reunioes/${r.id}`)).data.pode_sugerir, true);
    assert.equal((await api(uid, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'inclusao', texto: 'Incluir o informe', usuario_id: 4 })).status, 201);
  }
  assert.equal((await api(4, 'GET', `/reunioes/${r.id}`)).data.pode_sugerir, false);
  assert.equal((await api(4, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'correcao', texto: 'Não participei' })).status, 403);
  assert.equal((await api(3, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'outro', texto: 'Inválida' })).status, 400);
  const sugestoes = (await api(1, 'GET', `/reunioes/${r.id}`)).data.sugestoes;
  assert.deepEqual(sugestoes.map((s) => s.usuario_id), [3, suplente]);
  assert.equal((await api(3, 'POST', `/reunioes/${r.id}/sugestoes/${sugestoes[0].id}/responder`, { status: 'acolhida', resposta: 'Sim' })).status, 403);
});

test('gestão completa registros de reunião publicada, integra a ata e preserva versões anteriores', async (t) => {
  const { db, api, iniciar } = await ambiente(t);
  const r = await iniciar();
  const original = (await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {})).data.ata_texto;
  await api(1, 'POST', `/reunioes/${r.id}/enviar-ata`, {});
  const antes = (await api(1, 'GET', `/reunioes/${r.id}`)).data;
  const resumoAntes = (await api(1, 'GET', '/reunioes')).data.find(item => item.id === r.id);
  assert.equal(resumoAntes.informacoes, 0);
  assert.equal(resumoAntes.participantes, 0);
  assert.equal((await api(3, 'GET', `/reunioes/${r.id}`)).data.pode_sugerir, false);
  assert.equal((await api(3, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3] })).status, 403);
  assert.equal((await api(2, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3] })).status, 200);
  assert.equal((await api(3, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'correcao', texto: 'Corrigir o registro antigo' })).status, 201);
  await db.prepare('update usuarios set ativo = 0 where id = 3').run();
  assert.equal((await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3, 4] })).status, 200);
  assert.equal((await api(1, 'GET', `/reunioes/${r.id}`)).data.participantes.find(p => p.usuario_id === 3).nome, 'Ana Ribeiro');
  assert.equal((await api(2, 'POST', `/reunioes/${r.id}/informacoes`, { texto: 'Comunicado da reunião passada' })).status, 201);
  const info = await db.prepare('select id from reuniao_informacoes where reuniao_id = ?').get(r.id);
  assert.equal((await api(4, 'PATCH', `/reunioes/${r.id}/informacoes/${info.id}`, { texto: 'Tentativa' })).status, 403);
  assert.equal((await api(1, 'PATCH', `/reunioes/${r.id}/informacoes/${info.id}`, { texto: 'Comunicado corrigido' })).status, 200);
  const depois = (await api(1, 'GET', `/reunioes/${r.id}`)).data;
  assert.equal(depois.informacoes[0].texto, 'Comunicado corrigido');
  assert.match(depois.ata_texto, /Participantes:\n- Ana Ribeiro/);
  assert.match(depois.ata_texto, /Informações:\n- Comunicado corrigido/);
  assert.ok(depois.revisoes.length > antes.revisoes.length);
  assert.ok(depois.revisoes.some(v => v.ata_texto === original));
  assert.equal(depois.status, 'enviada');
  const resumo = (await api(4, 'GET', '/reunioes')).data.find(item => item.id === r.id);
  assert.equal(resumo.informacoes, 1);
  assert.equal(resumo.participantes, 2);
  assert.equal((await api(2, 'DELETE', `/reunioes/${r.id}/informacoes/${info.id}`)).status, 200);
  assert.equal((await api(1, 'GET', '/reunioes')).data.find(item => item.id === r.id).informacoes, 0);
});

test('revisão da ata preserva versões, impede sobrescrita concorrente e responde sugestões atomicamente', async (t) => {
  const { db, api, iniciar } = await ambiente(t);
  const r = await iniciar();
  await api(1, 'PUT', `/reunioes/${r.id}/participantes`, { usuarios: [3] });
  const original = (await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {})).data.ata_texto;
  await api(1, 'POST', `/reunioes/${r.id}/enviar-ata`, {});
  await api(3, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'correcao', texto: 'Corrigir o informe' });
  const s = (await api(1, 'GET', `/reunioes/${r.id}`)).data.sugestoes[0];
  const versao2 = original + '\nInforme corrigido.';
  const concorrentes = await Promise.all([1, 2].map((uid) => api(uid, 'PUT', `/reunioes/${r.id}/ata`, { ata_texto: versao2 + uid, ata_base: original })));
  assert.deepEqual(concorrentes.map((r) => r.status).sort(), [200, 409]);
  const atual = (await api(1, 'GET', `/reunioes/${r.id}`)).data;
  assert.equal(atual.revisoes.length, 2);
  assert.equal(atual.revisoes[1].ata_texto, original);
  const caminho = `/reunioes/${r.id}/sugestoes/${s.id}/responder`;
  assert.equal((await api(1, 'POST', caminho, { status: 'acolhida', resposta: 'Corrigido', ata_texto: 'Texto obsoleto', ata_base: original })).status, 409);
  assert.equal((await db.prepare('select status from ata_sugestoes where id = ?').get(s.id)).status, 'pendente');
  const versao3 = atual.ata_texto + '\nInclusão final.';
  assert.equal((await api(10, 'POST', caminho, { status: 'acolhida', resposta: 'Corrigido e incluído', ata_texto: versao3, ata_base: atual.ata_texto })).status, 200);
  const final = (await api(3, 'GET', `/reunioes/${r.id}`)).data;
  assert.equal(final.ata_texto, versao3);
  assert.equal(final.revisoes.length, 3);
  assert.equal(final.sugestoes[0].status, 'acolhida');
  assert.equal(final.sugestoes[0].respondida_por, 10);
  assert.equal((await api(1, 'POST', caminho, { status: 'nao_acolhida', resposta: 'Outra resposta' })).status, 409);
  assert.equal((await api(3, 'PUT', `/reunioes/${r.id}/ata`, { ata_texto: 'Edição por chefe' })).status, 403);
  await api(3, 'POST', `/reunioes/${r.id}/sugestoes`, { tipo: 'supressao', texto: 'Retirar o trecho' });
  const pendente = (await api(1, 'GET', `/reunioes/${r.id}`)).data.sugestoes[1];
  assert.equal((await api(2, 'POST', `/reunioes/${r.id}/sugestoes/${pendente.id}/responder`, { status: 'nao_acolhida', resposta: 'O registro foi confirmado pelos presentes.' })).status, 200);
  assert.equal((await api(1, 'DELETE', `/reunioes/${r.id}`)).status, 200);
  for (const tabela of ['reuniao_participantes', 'ata_sugestoes', 'ata_revisoes', 'reuniao_informacoes']) {
    assert.equal((await db.prepare(`select count(*) n from ${tabela} where reuniao_id = ?`).get(r.id)).n, 0);
  }
  assert.deepEqual(await db.prepare('pragma foreign_key_check').all(), []);
});

test('cartões incluem conclusões na semana anterior pelo fuso da Bahia, independente do prazo e do arquivamento', async (t) => {
  const { db, api, iniciar } = await ambiente(t);
  const inserir = async (titulo, conclusao, extras = {}) => (await db.prepare(`insert into acoes
    (secao_id, titulo, prazo, prazo_original, criada_em, status, concluida_em, arquivada, encerrada, interna)
    values (1, ?, '2026-12-31', '2026-12-31', '2026-09-10T10:00:00', 'concluida', ?, ?, ?, ?)`)
    .run(titulo, conclusao, extras.arquivada || 0, extras.encerrada || 0, extras.interna || 0)).lastInsertRowid;
  const sim = [await inserir('Antecipada', '2026-09-20T10:00:00'), await inserir('Arquivada', '2026-09-20T11:00:00', { arquivada: 1 }),
    await inserir('Encerrada', '2026-09-20T12:00:00', { encerrada: 1 }), await inserir('Início Bahia', '2026-09-15T03:00:00Z'),
    await inserir('Fim Bahia', '2026-09-22T02:59:59Z')];
  const nao = [await inserir('Antes da janela', '2026-09-15T02:59:59Z'), await inserir('Após a janela', '2026-09-22T03:00:00Z'),
    await inserir('Antiga', '2026-09-01T10:00:00'), await inserir('Interna', '2026-09-20T10:00:00', { interna: 1 })];
  const r = await iniciar();
  const cartoes = (await api(1, 'GET', `/reunioes/${r.id}/cartoes`)).data.cartoes;
  const ids = cartoes.flatMap((c) => c.acoes.map((a) => a.id));
  sim.forEach((id) => assert.ok(ids.includes(id), `ação ${id} deveria aparecer`));
  nao.forEach((id) => assert.ok(!ids.includes(id), `ação ${id} não deveria aparecer`));
  await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {});
  for (const id of sim) assert.equal((await db.prepare('select apresentada_em from acoes where id = ?').get(id)).apresentada_em, '2026-09-21');
});

test('antecipação usa os relatos da data prevista e mantém a próxima reunião no ciclo regular', async (t) => {
  const { db, api, iniciar } = await ambiente(t);
  const r = await iniciar();
  assert.equal(r.data, '2026-09-21');
  assert.equal(r.semana, '2026-09-22');
  const relato = await db.prepare("select * from atualizacoes where secao_id = 1 and semana = '2026-09-22' order by versao desc limit 1").get();
  const cartoes = (await api(1, 'GET', `/reunioes/${r.id}/cartoes`)).data.cartoes;
  assert.equal(cartoes.find((c) => c.secao.id === 1).atualizacao.id, relato.id);
  const encerrada = await api(1, 'POST', `/reunioes/${r.id}/encerrar`, {});
  assert.match(encerrada.data.ata_texto, /referência semanal: 22\/09\/2026/);
  assert.match(encerrada.data.ata_texto, /antecipada para 21\/09\/2026/);
  assert.match(encerrada.data.ata_texto, /Próxima reunião: terça-feira, 29\/09\/2026/);
});

test('migração 16 mantém ações legadas e cria registros com integridade referencial', async (t) => {
  const { db } = await ambiente(t);
  const antes = await db.prepare('select id, titulo, criado_por from acoes order by id').all();
  await db.exec(`drop table ata_sugestoes; drop table ata_revisoes; drop table reuniao_informacoes; drop table reuniao_participantes;
    alter table acoes drop column demanda_diretor; delete from schema_migrations where id >= 16;`);
  assert.deepEqual(await aplicarMigracoes(db), [16, 17]);
  assert.deepEqual(await db.prepare('select id, titulo, criado_por from acoes order by id').all(), antes);
  assert.equal((await db.prepare('select sum(demanda_diretor) n from acoes').get()).n, 0);
  await assert.rejects(db.prepare("insert into reuniao_informacoes (reuniao_id, texto, criado_em) values (999999, 'Órfã', 'x')").run(), /FOREIGN KEY/);
  assert.deepEqual(await aplicarMigracoes(db), []);
});
