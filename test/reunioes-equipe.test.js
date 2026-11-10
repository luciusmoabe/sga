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
  assert.ok(ata.includes('Próxima reunião: terça-feira, 06/10/2026.'));
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
