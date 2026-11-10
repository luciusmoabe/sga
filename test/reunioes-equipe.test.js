// Reunião do chefe com a equipe da própria seção: presença, pauta, decisões e ata; só quem esteve presente lê a ata enviada.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';

const DIRETOR = 1, APOIO = 2, ANA_CPE = 3, BRUNO_COF = 4, GABRIELA_IND = 9, ADMIN = 10;
const CPE = 1;

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const novo = async (nome, perfil, secao) => (await db.prepare('insert into usuarios (nome, email, perfil, secao_id) values (?, ?, ?, ?)')
    .run(nome, `${nome.toLowerCase().replace(/ /g, '.')}@exemplo.invalid`, perfil, secao)).lastInsertRowid;
  const marta = await novo('Marta Lima', 'membro', CPE);
  const nuno = await novo('Nuno Reis', 'membro', CPE);
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
  return { db, call, marta, nuno };
}

test('o chefe inicia a reunião da equipe: participantes da árvore, uma só em andamento por seção; gestão e membro não conduzem', async (t) => {
  const { call, marta, nuno } = await demo(t);
  assert.equal((await call(DIRETOR, 'POST', '/reunioes-equipe/iniciar')).status, 403);
  assert.equal((await call(APOIO, 'POST', '/reunioes-equipe/iniciar')).status, 403);
  assert.equal((await call(marta, 'POST', '/reunioes-equipe/iniciar')).status, 403, 'o membro não conduz');

  const ini = await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar');
  assert.equal(ini.status, 201);
  assert.equal(ini.data.retomada, false);
  const id = ini.data.reuniao.id;
  const det = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data;
  assert.equal(det.pode_conduzir, true);
  const nomes = det.participantes.map((p) => p.usuario_id);
  assert.ok(nomes.includes(marta) && nomes.includes(nuno) && nomes.includes(GABRIELA_IND) && nomes.includes(ANA_CPE));
  assert.equal(det.participantes.find((p) => p.usuario_id === ANA_CPE).presente, true, 'quem conduz já está presente');
  assert.equal(det.participantes.find((p) => p.usuario_id === marta).presente, false);
  assert.ok(!nomes.includes(BRUNO_COF), 'chefe de outra seção não entra');

  const outra = await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar');
  assert.equal(outra.status, 200);
  assert.equal(outra.data.retomada, true);
  assert.equal(outra.data.reuniao.id, id);
  // A reunião de outra seção é outra.
  assert.equal((await call(BRUNO_COF, 'GET', `/reunioes-equipe/${id}`)).status, 404);
  assert.equal((await call(BRUNO_COF, 'PUT', `/reunioes-equipe/${id}/presenca`, { presentes: [] })).status, 403);
  assert.equal((await call(DIRETOR, 'GET', `/reunioes-equipe/${id}`)).status, 403);
});

test('quem apresenta são as seções subordinadas (não as pessoas, nem a seção do chefe); presença e decisões ao vivo', async (t) => {
  const { db, call, marta, nuno } = await demo(t);
  const sub = (await db.prepare("select id from secoes where tipo = 'subsecao' and pai_id = ?").get(CPE)).id;
  const neto = (await db.prepare("select id from secoes where tipo = 'subsecao' and pai_id = ?").get(sub)).id;
  const ins = (secao, titulo, prazo, resp) => db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, status, prioridade, criada_em, responsavel_id, criado_por)
    values (?, ?, ?, ?, 'a_fazer', 'media', '2026-09-18T10:00:00', ?, ?)`).run(secao, titulo, prazo, prazo, resp, ANA_CPE);
  await ins(sub, 'Atrasada da subseção', '2026-09-10', null);
  await ins(neto, 'Em dia da sub-subseção', '2026-12-30', null);
  await ins(CPE, 'Da própria seção da chefe', '2026-09-10', marta); // não é apresentada
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;

  assert.equal((await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/presenca`, { presentes: [ANA_CPE, marta] })).status, 200);
  const det = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data;
  assert.ok(det.participantes.find((p) => p.usuario_id === marta).presente);
  assert.ok(!det.participantes.find((p) => p.usuario_id === nuno).presente);
  // Um cartão por seção subordinada direta; as subseções abaixo dela entram na soma.
  assert.deepEqual(det.cartoes.map((c) => c.secao_id), [sub]);
  const c = det.cartoes[0];
  assert.equal(c.cor, 'vermelho');
  assert.equal(c.atrasadas, 1);
  assert.ok(c.acoes.some((a) => a.titulo === 'Em dia da sub-subseção'), 'a sub-subseção soma no cartão da subseção');
  assert.equal(c.acoes[0].titulo, 'Atrasada da subseção', 'as atrasadas vêm primeiro');
  assert.ok(!JSON.stringify(det.cartoes).includes('Da própria seção da chefe'), 'a seção do chefe não é apresentada');
  assert.ok(det.cartoes.every((x) => x.usuario_id === undefined), 'não há cartão por pessoa');

  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: '' })).status, 400);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: 'Fora', secao_id: 2 })).status, 400, 'só seções subordinadas');
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: 'Revisar o fluxo', secao_id: sub })).status, 201);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: 'Decisão geral' })).status, 201);
  const dec = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.decisoes;
  assert.equal(dec.length, 2);
  assert.equal(dec[0].secao_id, sub);
  assert.ok(dec[0].secao_sigla);
  assert.equal(dec[1].secao_id, null);
  assert.equal((await call(ANA_CPE, 'PATCH', `/reunioes-equipe/${id}/decisoes/${dec[0].id}`, { texto: 'Revisar o fluxo até sexta' })).status, 200);
  assert.equal((await call(ANA_CPE, 'DELETE', `/reunioes-equipe/${id}/decisoes/${dec[1].id}`)).status, 200);
});

test('encerrar gera a ata; rascunho só o chefe vê; enviada é lida por quem esteve presente', async (t) => {
  const { call, marta, nuno } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/presenca`, { presentes: [ANA_CPE, marta] });
  await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: 'Fechar o relatório', responsavel_id: marta });

  assert.equal((await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/ata`, { ata_texto: 'x' })).status, 409, 'ainda não há ata');
  const enc = await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`);
  assert.equal(enc.status, 200);
  assert.equal(enc.data.status, 'rascunho');
  assert.match(enc.data.ata_texto, /ATA DA REUNIÃO DA EQUIPE/);
  assert.match(enc.data.ata_texto, /Participantes:\n- Ana Ribeiro[^\n]*\n- Marta Lima/);
  assert.match(enc.data.ata_texto, /Ausentes:[\s\S]*Nuno Reis/);
  assert.match(enc.data.ata_texto, /Fechar o relatório \(responsável: Marta Lima\)/);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: 'Tarde demais' })).status, 409, 'encerrada');

  // Rascunho: o membro presente ainda não lê.
  assert.equal((await call(marta, 'GET', `/reunioes-equipe/${id}`)).status, 404);
  assert.equal((await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/ata`, { ata_texto: 'Ata revisada pela chefe.', ata_base: 'outra' })).status, 409, 'alteração concorrente');
  const salva = await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/ata`, { ata_texto: 'Ata revisada pela chefe.', ata_base: enc.data.ata_texto });
  assert.equal(salva.status, 200);

  // Reabrir só em rascunho; depois de enviada, não.
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/reabrir`)).status, 200);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`)).status, 200);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/enviar-ata`)).status, 200);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/reabrir`)).status, 409);

  // Enviada: lê quem esteve presente; o ausente, a gestão e outra seção não.
  const lida = await call(marta, 'GET', `/reunioes-equipe/${id}`);
  assert.equal(lida.status, 200);
  assert.equal(lida.data.pode_conduzir, false);
  assert.match(lida.data.ata_texto, /ATA DA REUNIÃO DA EQUIPE/);
  assert.equal((await call(nuno, 'GET', `/reunioes-equipe/${id}`)).status, 404, 'ausente');
  assert.equal((await call(BRUNO_COF, 'GET', `/reunioes-equipe/${id}`)).status, 404);
  assert.equal((await call(DIRETOR, 'GET', `/reunioes-equipe/${id}`)).status, 403);
  assert.equal((await call(APOIO, 'GET', '/reunioes-equipe')).status, 403);
  assert.equal((await call(ADMIN, 'GET', `/reunioes-equipe/${id}`)).status, 200);
  assert.equal((await call(marta, 'PUT', `/reunioes-equipe/${id}/ata`, { ata_texto: 'x' })).status, 403);

  // Listas: a chefe vê as suas; a membro presente, só as enviadas de que participou; o ausente, nenhuma.
  assert.equal((await call(ANA_CPE, 'GET', '/reunioes-equipe')).data[0].conduzida, true);
  assert.equal((await call(marta, 'GET', '/reunioes-equipe')).data.length, 1);
  assert.equal((await call(nuno, 'GET', '/reunioes-equipe')).data.length, 0);
  assert.equal((await call(BRUNO_COF, 'GET', '/reunioes-equipe')).data.length, 0);

  assert.equal((await call(ANA_CPE, 'DELETE', `/reunioes-equipe/${id}`)).status, 200);
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).status, 404);
});

test('chefe de subseção conduz a reunião da própria equipe; sem equipe, o servidor orienta', async (t) => {
  const { db, call } = await demo(t);
  const sub = (await db.prepare('select secao_id from usuarios where id = ?').get(GABRIELA_IND)).secao_id;
  const ini = await call(GABRIELA_IND, 'POST', '/reunioes-equipe/iniciar');
  assert.equal(ini.status, 409, 'a subseção ainda não tem equipe');
  assert.match(ini.data.erro, /Minha equipe/);
  await db.prepare("insert into usuarios (nome, email, perfil, secao_id) values ('Rui Lins', 'rui.lins@exemplo.invalid', 'membro', ?)").run(sub);
  const ok = await call(GABRIELA_IND, 'POST', '/reunioes-equipe/iniciar');
  assert.equal(ok.status, 201);
  assert.equal(ok.data.reuniao.secao_id, sub);
  // A chefe do Centro não conduz a reunião da subseção.
  assert.equal((await call(ANA_CPE, 'PUT', `/reunioes-equipe/${ok.data.reuniao.id}/presenca`, { presentes: [] })).status, 403);
});

test('mesma estrutura da reunião do Diretor: cartão por seção, informações, ações da reunião, próxima reunião e ata completa', async (t) => {
  const { db, call, marta } = await demo(t);
  const sub = await db.prepare("select id, sigla from secoes where tipo = 'subsecao' and pai_id = ?").get(CPE);
  const atrasada = (await db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, status, prioridade, criada_em, criado_por)
    values (?, 'Atrasada da subseção', '2026-09-10', '2026-09-10', 'a_fazer', 'media', '2026-09-18T10:00:00', ?)`).run(sub.id, ANA_CPE)).lastInsertRowid;
  await db.prepare(`insert into impedimentos (acao_id, descricao, critico, apoio, criado_por, criado_em) values (?, 'Sem acesso ao sistema', 1, 'TI', ?, '2026-09-18T10:00:00')`).run(atrasada, ANA_CPE);
  await db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, status, prioridade, criada_em, criado_por, concluida_em)
    values (?, 'Feita pela subseção', '2026-09-15', '2026-09-15', 'concluida', 'media', '2026-09-01T10:00:00', ?, '2026-09-17T10:00:00')`).run(sub.id, ANA_CPE);
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/presenca`, { presentes: [ANA_CPE, marta] });

  // Cartão da seção: cor, o que foi feito, impedimento crítico e apoio, como o cartão de cada seção na reunião do Diretor.
  const cartoes = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.cartoes;
  const c = cartoes.find((x) => x.secao_id === sub.id);
  assert.equal(c.cor, 'vermelho');
  assert.equal(c.feitas[0].titulo, 'Feita pela subseção');
  assert.equal(c.impedimentos[0].critico, true);
  assert.deepEqual(c.apoios, [{ acao_titulo: 'Atrasada da subseção', apoio: 'TI' }]);
  assert.ok(c.chefe_nome, 'o cartão traz quem chefia a seção');

  // Informações.
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/informacoes`, { texto: '' })).status, 400);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/informacoes`, { texto: 'Sexta é ponto facultativo.' })).status, 201);
  const info = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.informacoes[0];
  assert.equal((await call(ANA_CPE, 'PATCH', `/reunioes-equipe/${id}/informacoes/${info.id}`, { texto: 'Sexta (13/11) é ponto facultativo.' })).status, 200);

  // Ação criada na reunião: só a que o chefe criou na própria árvore entra.
  const nova = (await db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, status, prioridade, criada_em, responsavel_id, criado_por)
    values (?, 'Nova da reunião', '2026-10-10', '2026-10-10', 'a_fazer', 'alta', '2026-09-22T09:40:00', ?, ?)`).run(sub.id, marta, ANA_CPE)).lastInsertRowid;
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/acoes`, { acao_id: atrasada + 999 })).status, 404);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/acoes`, { acao_id: nova })).status, 201);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/acoes`, { acao_id: nova })).status, 201, 'repetir não duplica');
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.novas_acoes.length, 1);

  // Decisão da seção e próxima reunião.
  await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/decisoes`, { texto: 'Priorizar o acesso ao sistema', secao_id: sub.id });
  assert.equal((await call(ANA_CPE, 'PATCH', `/reunioes-equipe/${id}`, { proxima_em: '2026-09-01' })).status, 400, 'não pode ser anterior');
  assert.equal((await call(ANA_CPE, 'PATCH', `/reunioes-equipe/${id}`, { proxima_em: '2026-10-06' })).data.proxima_em, '2026-10-06');

  const enc = await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`);
  const ata = enc.data.ata_texto;
  assert.match(ata, new RegExp(`Situação das ações das seções subordinadas:\\n- ${sub.sigla}: \\d+ em aberto`));
  assert.ok(ata.includes(`Decisões:\n- [${sub.sigla}] Priorizar o acesso ao sistema`));
  assert.ok(ata.includes('Novas ações:\n- Nova da reunião [Marta Lima] — prazo 10/10/2026 — prioridade alta'));
  assert.ok(ata.includes('Informações:\n- Sexta (13/11) é ponto facultativo.'));
  assert.ok(ata.includes(`Impedimentos críticos em aberto:\n- [${sub.sigla}] "Atrasada da subseção": Sem acesso ao sistema (apoio solicitado: TI)`));
  assert.ok(ata.includes('Próxima reunião: terça-feira, 06/10/2026, às 10:00.'));
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/informacoes`, { texto: 'Tarde' })).status, 409, 'encerrada');
  assert.equal((await call(ANA_CPE, 'PATCH', `/reunioes-equipe/${id}`, { proxima_em: '2026-10-13' })).status, 200, 'ainda dá para ajustar enquanto é rascunho');
  assert.equal((await call(marta, 'PATCH', `/reunioes-equipe/${id}`, { proxima_em: '2026-10-20' })).status, 403);
  assert.equal((await call(ANA_CPE, 'DELETE', `/reunioes-equipe/${id}`)).status, 200, 'exclui junto informações e ações ligadas');
});

test('o chefe lê as atas enviadas das subseções abaixo dele, e a lista traz o tipo da unidade para o agrupamento', async (t) => {
  const { db, call } = await demo(t);
  const sub = (await db.prepare('select secao_id from usuarios where id = ?').get(GABRIELA_IND)).secao_id;
  await db.prepare("insert into usuarios (nome, email, perfil, secao_id) values ('Rui Lins', 'rui.lins@exemplo.invalid', 'membro', ?)").run(sub);
  const id = (await call(GABRIELA_IND, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  await call(GABRIELA_IND, 'POST', `/reunioes-equipe/${id}/encerrar`);
  // Rascunho: a chefe do Centro (acima) ainda não lê.
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).status, 404);
  await call(GABRIELA_IND, 'POST', `/reunioes-equipe/${id}/enviar-ata`);
  const lida = await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`);
  assert.equal(lida.status, 200);
  assert.equal(lida.data.pode_conduzir, false);
  const lista = (await call(ANA_CPE, 'GET', '/reunioes-equipe')).data;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].secao_tipo, 'subsecao');
  assert.equal(lista[0].conduzida, false);
  // Outro Centro não lê, e a Diretoria continua sem acesso.
  assert.equal((await call(BRUNO_COF, 'GET', `/reunioes-equipe/${id}`)).status, 404);
  assert.equal((await call(BRUNO_COF, 'GET', '/reunioes-equipe')).data.length, 0);
  assert.equal((await call(DIRETOR, 'GET', '/reunioes-equipe')).status, 403);
});

test('nova ação ao vivo para uma seção subordinada: o chefe cria na própria seção, redireciona e liga à reunião', async (t) => {
  const { db, call } = await demo(t);
  const sub = (await db.prepare("select id from secoes where tipo = 'subsecao' and pai_id = ?").get(CPE)).id;
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  const criada = await call(ANA_CPE, 'POST', '/acoes', { secao_id: CPE, titulo: 'Atualizar os indicadores', prazo: '2026-10-30', prioridade: 'alta' });
  assert.equal(criada.status, 201);
  const redir = await call(ANA_CPE, 'POST', `/acoes/${criada.data.id}/redirecionar`, { secao_id: sub, motivo: 'Definida na reunião da equipe.' });
  assert.equal(redir.status, 200);
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/acoes`, { acao_id: criada.data.id })).status, 201);
  const det = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data;
  assert.equal(det.novas_acoes.length, 1);
  assert.ok(det.cartoes.find((c) => c.secao_id === sub).acoes.some((a) => a.titulo === 'Atualizar os indicadores'), 'a ação aparece no cartão da seção que a recebeu');
  // Uma ação de fora da árvore não entra.
  const alheia = await call(BRUNO_COF, 'POST', '/acoes', { secao_id: 2, titulo: 'De outra seção', prazo: '2026-10-30' });
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/acoes`, { acao_id: alheia.data.id })).status, 404);
});

test('a ação criada na seção do chefe e atribuída a alguém de uma seção subordinada é apresentada por essa seção', async (t) => {
  const { db, call } = await demo(t);
  const sub = (await db.prepare("select id from secoes where tipo = 'subsecao' and pai_id = ?").get(CPE)).id;
  const chefeSub = (await db.prepare("select id from usuarios where perfil = 'chefe' and secao_id = ?").get(sub)).id;
  // Criada na seção do chefe (CPE), mas com responsável da subseção: é o caso comum de quem delega para baixo.
  const ins = async (titulo, prazo, resp) => (await db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, status, prioridade, criada_em, responsavel_id, criado_por)
    values (?, ?, ?, ?, 'a_fazer', 'media', '2026-09-18T10:00:00', ?, ?)`).run(CPE, titulo, prazo, prazo, resp, ANA_CPE)).lastInsertRowid;
  const delegada = await ins('Delegada à subseção', '2026-09-10', chefeSub);
  await ins('Só da própria seção', '2026-09-10', null);
  await db.prepare(`insert into impedimentos (acao_id, descricao, critico, apoio, criado_por, criado_em) values (?, 'Falta o acesso', 0, 'TI', ?, '2026-09-18T10:00:00')`).run(delegada, ANA_CPE);
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  const cartao = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.cartoes.find((c) => c.secao_id === sub);
  assert.ok(cartao.acoes.some((a) => a.titulo === 'Delegada à subseção'), 'aparece na lista de ações da seção');
  assert.ok(!cartao.acoes.some((a) => a.titulo === 'Só da própria seção'), 'a ação sem ninguém da subseção continua fora');
  assert.equal(cartao.acoes.filter((a) => a.titulo === 'Delegada à subseção').length, 1, 'sem duplicar');
  assert.equal(cartao.impedimentos[0].descricao, 'Falta o acesso');
});

test('cada seção pode ter o seu cabeçalho da ata; sem um, a tela usa o da instituição', async (t) => {
  const { db, call, marta } = await demo(t);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  await db.prepare("insert into config (chave, valor, empresa_id) values ('ata_cabecalho', 'Instituição\nUnidade', 1)").run();
  // Ponto de partida: o cabeçalho da instituição.
  const inicial = (await call(ANA_CPE, 'GET', '/reunioes-equipe/cabecalho')).data;
  assert.equal(inicial.propria, false);
  assert.equal(inicial.ata_cabecalho, 'Instituição\nUnidade');
  // Só o chefe da seção edita.
  assert.equal((await call(marta, 'PUT', '/reunioes-equipe/cabecalho', { ata_cabecalho: 'x', ata_brasao: '' })).status, 403);
  assert.equal((await call(DIRETOR, 'GET', '/reunioes-equipe/cabecalho')).status, 403);
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/cabecalho', { ata_cabecalho: 'x'.repeat(1501), ata_brasao: '' })).status, 400);
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/cabecalho', { ata_cabecalho: 'Centro X', ata_brasao: 'data:image/png;base64,AAAA' })).status, 400, 'brasão inválido');

  const salvo = await call(ANA_CPE, 'PUT', '/reunioes-equipe/cabecalho', { ata_cabecalho: 'Centro de Planejamento\nAta da equipe', ata_brasao: png, ata_brasao_esq: '' });
  assert.equal(salvo.status, 200);
  assert.equal(salvo.data.propria, true);
  assert.equal((await call(ANA_CPE, 'GET', '/reunioes-equipe/cabecalho')).data.ata_cabecalho, 'Centro de Planejamento\nAta da equipe');
  // Outra seção não vê nem muda o dele.
  assert.equal((await call(BRUNO_COF, 'GET', '/reunioes-equipe/cabecalho')).data.propria, false);

  // A ata da reunião traz o cabeçalho da seção; a outra seção segue com o da instituição (null: a tela usa o da instituição).
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.cabecalho.ata_cabecalho, 'Centro de Planejamento\nAta da equipe');
  await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/presenca`, { presentes: [ANA_CPE, marta] });
  await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`);
  await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/enviar-ata`);
  assert.equal((await call(marta, 'GET', `/reunioes-equipe/${id}`)).data.cabecalho.ata_brasao, png, 'quem lê a ata vê o cabeçalho da seção');

  // Voltar ao cabeçalho da instituição.
  assert.equal((await call(ANA_CPE, 'DELETE', '/reunioes-equipe/cabecalho')).status, 200);
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.cabecalho, null);
  assert.equal((await call(ANA_CPE, 'GET', '/reunioes-equipe/cabecalho')).data.propria, false);
});

test('agenda própria da seção: dia, horário, periodicidade e data da próxima reunião, independentes da organização-mãe', async (t) => {
  const { call } = await demo(t);
  const inicial = (await call(ANA_CPE, 'GET', '/reunioes-equipe/agenda')).data;
  assert.equal(inicial.intervalo, 7);
  assert.equal(inicial.propria, false, 'sem agenda própria, vale a da instituição');
  assert.equal(inicial.semana, '2026-09-22');
  assert.equal((await call(DIRETOR, 'GET', '/reunioes-equipe/agenda')).status, 403);
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_intervalo: 10 })).status, 400);
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_hora: '25:00' })).status, 400);
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_proxima: '2026-09-01' })).status, 400);

  // Quinta-feira, 14h, quinzenal: só desta seção.
  const salva = await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_dia: 4, reuniao_hora: '14:00', reuniao_intervalo: 14 });
  assert.equal(salva.status, 200);
  assert.deepEqual([salva.data.dia, salva.data.hora, salva.data.intervalo, salva.data.propria], [4, '14:00', 14, true]);
  assert.ok(salva.data.proxima, 'quinzenal parte da próxima reunião prevista');
  assert.equal(salva.data.semana, salva.data.proxima);
  // A organização-mãe e a outra seção não mudam.
  assert.equal((await call(DIRETOR, 'GET', '/bootstrap')).data.reuniao_intervalo, 7);
  assert.equal((await call(BRUNO_COF, 'GET', '/reunioes-equipe/agenda')).data.intervalo, 7);
  // Adiar só a próxima.
  const adiada = await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_proxima: '2026-10-01' });
  assert.equal(adiada.data.semana, '2026-10-01');
  assert.equal(adiada.data.anterior, '2026-09-17', 'o trilho vai da reunião anterior (15 dias antes) à próxima');
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_proxima: null })).data.proxima, null);

  // A reunião iniciada guarda a data de referência da agenda da seção e a ata anuncia a próxima, no horário da seção.
  await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_dia: 2, reuniao_hora: '15:30', reuniao_intervalo: 14, reuniao_proxima: '2026-09-22' });
  const ini = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data;
  assert.equal(ini.reuniao.semana, '2026-09-22');
  assert.equal((await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { reuniao_proxima: '2026-10-20' })).status, 409, 'não muda a data com reunião em andamento');
  const enc = await call(ANA_CPE, 'POST', `/reunioes-equipe/${ini.reuniao.id}/encerrar`);
  assert.ok(enc.data.ata_texto.includes('Próxima reunião: terça-feira, 06/10/2026, às 15:30.'));
});

test('combinados da seção: cadastro, arquivar, ordem, frequência e cópia guardada em cada reunião', async (t) => {
  const { call, marta } = await demo(t);
  assert.equal((await call(marta, 'GET', '/reunioes-equipe/combinados')).status, 403, 'o cadastro é do chefe da seção');
  assert.equal((await call(ANA_CPE, 'POST', '/reunioes-equipe/combinados', { texto: '' })).status, 400);
  const c1 = (await call(ANA_CPE, 'POST', '/reunioes-equipe/combinados', { texto: 'Uma pessoa fala por vez.' })).data.combinado;
  const c2 = (await call(ANA_CPE, 'POST', '/reunioes-equipe/combinados', { texto: 'Celular no silencioso.' })).data.combinado;
  assert.equal((await call(ANA_CPE, 'PATCH', `/reunioes-equipe/combinados/${c2.id}`, { mover: 'cima' })).status, 200);
  assert.deepEqual((await call(ANA_CPE, 'GET', '/reunioes-equipe/combinados')).data.itens.map((c) => c.id), [c2.id, c1.id]);
  // Outra seção tem a sua lista.
  assert.equal((await call(BRUNO_COF, 'GET', '/reunioes-equipe/combinados')).data.itens.length, 0);
  assert.equal((await call(BRUNO_COF, 'PATCH', `/reunioes-equipe/combinados/${c1.id}`, { ativo: false })).status, 404);

  const ini = await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar');
  assert.equal(ini.data.mostrar_combinados, true);
  const id = ini.data.reuniao.id;
  assert.deepEqual((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.combinados_snapshot.map((c) => c.texto), ['Celular no silencioso.', 'Uma pessoa fala por vez.']);
  // Arquivar muda a lista de agora, não a cópia da reunião.
  await call(ANA_CPE, 'PATCH', `/reunioes-equipe/combinados/${c1.id}`, { arquivado: true });
  assert.equal((await call(ANA_CPE, 'GET', '/reunioes-equipe/combinados')).data.itens.length, 1);
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.combinados_snapshot.length, 2);
  assert.equal((await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.mostrar_combinados, false, 'retomar não repete a abertura');

  // Frequência: só quando mudarem.
  await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`);
  await call(ANA_CPE, 'PUT', '/reunioes-equipe/agenda', { combinados_frequencia: 'quando_mudarem' });
  assert.equal((await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.mostrar_combinados, false, 'nada mudou desde a última reunião');
});

test('revisão da ata: quem esteve presente sugere, o chefe responde e as versões ficam guardadas', async (t) => {
  const { call, marta, nuno } = await demo(t);
  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/presenca`, { presentes: [ANA_CPE, marta] });
  const ata = (await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`)).data.ata_texto;
  assert.equal((await call(marta, 'POST', `/reunioes-equipe/${id}/sugestoes`, { tipo: 'correcao', texto: 'x' })).status, 409, 'a ata ainda não foi publicada');
  await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/enviar-ata`);

  const lida = (await call(marta, 'GET', `/reunioes-equipe/${id}`)).data;
  assert.equal(lida.pode_sugerir, true);
  assert.equal(lida.revisoes.length, 1, 'a primeira versão publicada fica guardada');
  assert.equal((await call(nuno, 'POST', `/reunioes-equipe/${id}/sugestoes`, { tipo: 'correcao', texto: 'x' })).status, 403, 'quem não esteve presente não sugere');
  assert.equal((await call(marta, 'POST', `/reunioes-equipe/${id}/sugestoes`, { tipo: 'outro', texto: 'x' })).status, 400);
  assert.equal((await call(marta, 'POST', `/reunioes-equipe/${id}/sugestoes`, { tipo: 'inclusao', texto: 'Incluir a pauta de segurança.' })).status, 201);
  const pendente = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.sugestoes[0];
  assert.equal(pendente.status, 'pendente');
  assert.equal(pendente.usuario_nome, 'Marta Lima');
  assert.equal((await call(marta, 'POST', `/reunioes-equipe/${id}/sugestoes/${pendente.id}/responder`, { status: 'acolhida', resposta: 'ok' })).status, 403, 'quem responde é o chefe');
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/sugestoes/${pendente.id}/responder`, { status: 'acolhida' })).status, 400, 'a resposta é obrigatória');

  const nova = `${ata}\n\nPauta de segurança incluída.`;
  const resp = await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/sugestoes/${pendente.id}/responder`, { status: 'acolhida', resposta: 'Incluído.', ata_texto: nova, ata_base: ata });
  assert.equal(resp.status, 200);
  const depois = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data;
  assert.equal(depois.ata_texto, nova);
  assert.equal(depois.sugestoes[0].status, 'acolhida');
  assert.equal(depois.revisoes.length, 2, 'a versão nova entra no histórico');
  assert.equal((await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/sugestoes/${pendente.id}/responder`, { status: 'acolhida', resposta: 'de novo' })).status, 409, 'já respondida');
  // Corrigir a ata enviada também guarda a versão.
  assert.equal((await call(ANA_CPE, 'PUT', `/reunioes-equipe/${id}/ata`, { ata_texto: `${nova}\nRevisada.`, ata_base: nova })).status, 200);
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.revisoes.length, 3);
});

test('o chefe decide ao vivo os pedidos de prazo das ações que ele criou; os demais seguem com o Diretor', async (t) => {
  const { db, call } = await demo(t);
  const sub = (await db.prepare("select id from secoes where tipo = 'subsecao' and pai_id = ?").get(CPE)).id;
  const chefeSub = (await db.prepare("select id from usuarios where perfil = 'chefe' and secao_id = ?").get(sub)).id;
  const ins = async (criador, titulo) => (await db.prepare(`insert into acoes (secao_id, titulo, prazo, prazo_original, status, prioridade, criada_em, criado_por)
    values (?, ?, '2026-10-10', '2026-10-10', 'a_fazer', 'media', '2026-09-18T10:00:00', ?)`).run(sub, titulo, criador)).lastInsertRowid;
  const daChefe = await ins(ANA_CPE, 'Criada pela chefe do Centro');
  const doDiretor = await ins(DIRETOR, 'Criada pelo Diretor');
  const pedir = async (acao) => { assert.equal((await call(chefeSub, 'POST', `/acoes/${acao}/pedido-prazo`, { novo_prazo: '2026-10-20', justificativa: 'Falta de pessoal' })).status, 201); };
  await pedir(daChefe);
  await pedir(doDiretor);
  const pedidos = (await db.prepare('select id, acao_id from pedidos_prazo').all());
  const pDaChefe = pedidos.find((p) => p.acao_id === daChefe).id;
  const pDoDiretor = pedidos.find((p) => p.acao_id === doDiretor).id;

  const id = (await call(ANA_CPE, 'POST', '/reunioes-equipe/iniciar')).data.reuniao.id;
  const cartao = (await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.cartoes.find((c) => c.secao_id === sub);
  assert.deepEqual(cartao.pedidos.map((p) => p.acao_titulo), ['Criada pela chefe do Centro'], 'só os das ações que ela criou');

  // O chefe decide só os seus; o do Diretor continua com o Diretor.
  assert.equal((await call(ANA_CPE, 'POST', `/pedidos-prazo/${pDoDiretor}/decidir`, { aprovar: true, reuniao_equipe_id: id })).status, 403);
  assert.equal((await call(chefeSub, 'POST', `/pedidos-prazo/${pDaChefe}/decidir`, { aprovar: true })).status, 403, 'quem pediu não decide');
  assert.equal((await call(ANA_CPE, 'POST', `/pedidos-prazo/${pDaChefe}/decidir`, { aprovar: true, reuniao_equipe_id: 999 })).status, 409);
  assert.equal((await call(ANA_CPE, 'POST', `/pedidos-prazo/${pDaChefe}/decidir`, { aprovar: true, reuniao_equipe_id: id })).status, 200);
  assert.equal((await db.prepare('select prazo from acoes where id = ?').get(daChefe)).prazo, '2026-10-20');
  assert.equal((await call(ANA_CPE, 'POST', `/pedidos-prazo/${pDaChefe}/decidir`, { aprovar: false, reuniao_equipe_id: id })).status, 409, 'já decidido');
  assert.equal((await call(DIRETOR, 'POST', `/pedidos-prazo/${pDoDiretor}/decidir`, { aprovar: false })).status, 200);

  const enc = await call(ANA_CPE, 'POST', `/reunioes-equipe/${id}/encerrar`);
  assert.match(enc.data.ata_texto, /Pedidos de novo prazo decididos:\n- \[\w+\] "Criada pela chefe do Centro": novo prazo 20\/10\/2026 aprovado\./);
  assert.equal((await call(ANA_CPE, 'GET', `/reunioes-equipe/${id}`)).data.pedidos_decididos.length, 1);
});
