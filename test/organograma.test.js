// Organograma por empresa, etapa 2 e cartões: a Diretoria Adjunta pode ter Centros e Coordenações abaixo dela (cada um é um
// cartão à parte); a Subseção entra na soma do cartão acima; os níveis da árvore são configuração da empresa.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { arvoresDosCentros } from '../server/helpers.js';
import { comEmpresa } from '../server/empresa.js';
import { VOCABULARIO_PADRAO } from '../public/js/vocabulario.js';

const DIRETOR = 1, ANA_CPE = 3;
// seed: CPE 1, COF 2, CGP 3, CIG 4, CCP 5, CPR 6 (Coordenação), IND 7 (sob CPE), MAP 8 (sob CGP), PNL 9 (sob IND)
const CPE = 1, COF = 2, IND = 7, PNL = 9, CPR = 6;
const PRAZO = '2026-12-31';
const PROXIMA = '2026-09-23'; // dentro da janela do relato da reunião de 22/09

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  return { db, call };
}

/** Cenário do Deplan: Adjunta → (CPE com IND e PNL abaixo) e Coordenação direta; os demais Centros ficam no primeiro nível. */
async function deplan(t) {
  const ctx = await demo(t);
  const { db, call } = ctx;
  await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: { ...VOCABULARIO_PADRAO, niveis: 4 } });
  const da = (await call(DIRETOR, 'POST', '/secoes', { nome: 'Diretoria Adjunta', sigla: 'DA', tipo: 'diretoria_adjunta' })).data.id;
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${CPE}`, { pai_id: da })).status, 200, JSON.stringify((await call(DIRETOR, 'GET', '/secoes')).data.find((s) => s.id === CPE)));
  const coord = (await call(DIRETOR, 'POST', '/secoes', { nome: 'Coordenação da Adjunta', sigla: 'CDA', tipo: 'coordenacao', pai_id: da })).data.id;
  const adjunto = (await db.prepare("insert into usuarios (nome, email, perfil, secao_id) values ('Diretor Adjunto', 'adjunto@exemplo.invalid', 'administrador', ?)").run(da)).lastInsertRowid;
  return { ...ctx, da, coord, adjunto };
}

test('o Painel traz um cartão por unidade de acompanhamento, na ordem da árvore, e a Subseção entra na soma do cartão acima', async (t) => {
  const { call, da, coord } = await deplan(t);
  const itens = (await call(DIRETOR, 'GET', '/painel')).data.itens;
  const ids = itens.map((i) => i.secao.id);
  const pos = ids.indexOf(da);
  assert.deepEqual(ids.slice(pos, pos + 3), [da, CPE, coord], 'a Adjunta vem logo antes das unidades que ficam abaixo dela');
  assert.ok(!ids.includes(IND) && !ids.includes(PNL), 'Subseção não é cartão');
  assert.deepEqual([...new Set(ids)].sort((a, b) => a - b), [CPE, COF, 3, 4, 5, CPR, da, coord].sort((a, b) => a - b), 'todas as unidades de acompanhamento, e só elas');
  assert.equal(itens.find((i) => i.secao.id === CPE).subsecoes, 2, 'IND e PNL somam no cartão do CPE');
  assert.equal(itens.find((i) => i.secao.id === da).subsecoes, 0, 'a Adjunta não soma os Centros: cada um tem o seu cartão');
});

test('a reunião, o relato e a visibilidade seguem o cartão: a Adjunta não herda as ações dos Centros abaixo dela', async (t) => {
  const { db, call, da, coord, adjunto } = await deplan(t);
  await call(adjunto, 'POST', '/acoes', { titulo: 'Da Adjunta', prazo: PROXIMA, secao_id: da });
  const dela = (await db.prepare("select id from acoes where titulo = 'Da Adjunta'").get()).id;
  const doCpe = (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Do CPE', prazo: PROXIMA })).data.id;
  // O Diretor Adjunto é Administrador (vê tudo), mas "Minha equipe", "Início" e os selos seguem só a unidade dele.
  const reuniao = (await call(DIRETOR, 'POST', '/reunioes/iniciar')).data.reuniao.id;
  const cartoes = (await call(DIRETOR, 'GET', `/reunioes/${reuniao}/cartoes`)).data.cartoes;
  const cartaoDa = cartoes.find((c) => c.secao.id === da);
  const cartaoCpe = cartoes.find((c) => c.secao.id === CPE);
  assert.ok(cartaoDa && cartaoCpe && cartoes.some((c) => c.secao.id === coord), 'a Adjunta, o Centro e a Coordenação são cartões');
  assert.ok(cartaoDa.acoes.some((a) => a.id === dela) && !cartaoDa.acoes.some((a) => a.id === doCpe));
  assert.ok(cartaoCpe.acoes.some((a) => a.id === doCpe) && !cartaoCpe.acoes.some((a) => a.id === dela));
  // O relato da Adjunta só traz as ações dela.
  const relato = (await call(adjunto, 'GET', '/atualizacao')).data.relato;
  const titulos = [...relato.atrasadas, ...relato.vencemAntes, ...relato.programadas, ...relato.concluidas].map((a) => a.titulo);
  assert.ok(titulos.includes('Da Adjunta') && !titulos.includes('Do CPE'), JSON.stringify(titulos));
  // O chefe do Centro continua vendo a própria árvore e nada além dela (agora o Centro está sob a Adjunta).
  const lista = (await call(ANA_CPE, 'GET', '/acoes')).data;
  assert.ok(lista.some((a) => a.id === doCpe) && !lista.some((a) => a.id === dela));
  assert.deepEqual((await call(ANA_CPE, 'GET', '/secoes')).data.map((s) => s.id).sort((a, b) => a - b), [CPE, IND, PNL]);
  // "Minha equipe" do Diretor Adjunto: só a unidade dele.
  assert.deepEqual((await call(adjunto, 'GET', '/equipe')).data, []);
});

test('"Todos os Centros" vale para Centros e Coordenações onde estiverem na árvore, sem a Diretoria Adjunta', async (t) => {
  const { db, call, da, coord } = await deplan(t);
  const r = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Para todos', prazo: PRAZO, destino: 'todos' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const secoes = (await db.prepare('select secao_id from acoes where diretriz_id = ?').all(r.data.id)).map((x) => x.secao_id).sort((a, b) => a - b);
  assert.deepEqual(secoes, [CPE, COF, 3, 4, 5, CPR, coord].sort((a, b) => a - b), 'o CPE (sob a Adjunta) e a Coordenação da Adjunta recebem; a Adjunta e as Subseções não');
  assert.ok(!secoes.includes(da));
  // Escolhidas: cartões valem (inclusive a Adjunta), Subseção não.
  assert.equal((await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'À Adjunta', prazo: PRAZO, destino: 'especificos', secoes: [da, coord] })).status, 201);
  assert.equal((await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'À Subseção', prazo: PRAZO, destino: 'especificos', secoes: [IND] })).status, 400);
});

test('regras de posição: Centro e Coordenação no primeiro nível ou sob a Adjunta; Adjunta só no primeiro nível; Subseção sob qualquer uma', async (t) => {
  const { call, da } = await deplan(t);
  const nova = (corpo) => call(DIRETOR, 'POST', '/secoes', { nome: 'X', ...corpo });
  assert.equal((await nova({ tipo: 'centro', pai_id: da })).status, 201);
  assert.equal((await nova({ tipo: 'coordenacao', pai_id: da })).status, 201);
  assert.equal((await nova({ tipo: 'centro', pai_id: COF })).status, 400, 'Centro sob Centro');
  assert.equal((await nova({ tipo: 'coordenacao', pai_id: IND })).status, 400, 'Coordenação de primeiro nível sob Subseção');
  assert.ok([400, 409].includes((await nova({ tipo: 'diretoria_adjunta', pai_id: COF })).status), 'a Adjunta não fica sob outra unidade (e já existe uma)');
  assert.equal((await nova({ tipo: 'subsecao', pai_id: da })).status, 201, 'Subseção direto sob a Adjunta');
  assert.equal((await nova({ tipo: 'subsecao' })).status, 400, 'Subseção precisa de seção acima');
  // Mover: Centro para dentro da Adjunta e de volta ao primeiro nível.
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${COF}`, { pai_id: da })).status, 200);
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${COF}`, { pai_id: null })).status, 200);
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${COF}`, { pai_id: CPE })).status, 400, 'Centro não vai para dentro de outro Centro');
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${da}`, { pai_id: COF })).status, 400, 'a Adjunta não sai do primeiro nível');
});

test('níveis da estrutura são configuração da empresa: a Adjunta conta como um nível e não dá para limitar abaixo da profundidade atual', async (t) => {
  const { call } = await demo(t);
  const da = (await call(DIRETOR, 'POST', '/secoes', { nome: 'Adjunta', tipo: 'diretoria_adjunta' })).data.id;
  // Com 3 níveis, o CPE (com IND e PNL abaixo) não cabe sob a Adjunta: ficaria com 4.
  const cheio = await call(DIRETOR, 'PATCH', `/secoes/${CPE}`, { pai_id: da });
  assert.equal(cheio.status, 400);
  assert.match(cheio.data.erro, /até 3 níveis/);
  assert.equal((await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: { ...VOCABULARIO_PADRAO, niveis: 4 } })).status, 200);
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${CPE}`, { pai_id: da })).status, 200);
  assert.deepEqual((await call(ANA_CPE, 'GET', '/bootstrap')).data.vocabulario.niveis, 4);
  const reducao = await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: { ...VOCABULARIO_PADRAO, niveis: 3 } });
  assert.equal(reducao.status, 409);
  assert.match(reducao.data.erro, /4 níveis/);
  for (const niveis of [1, 7, 2.5, '4']) assert.equal((await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: { ...VOCABULARIO_PADRAO, niveis } })).status, 400, String(niveis));
  // O quinto nível é recusado com 4.
  assert.equal((await call(DIRETOR, 'POST', '/secoes', { nome: 'Fundo', tipo: 'subsecao', pai_id: PNL })).status, 400);
});

test('desativar um Centro que fica sob a Adjunta não reatribui as ações dele à Adjunta', async (t) => {
  const { call, da } = await deplan(t);
  assert.equal((await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Em aberto', prazo: PRAZO })).status, 201);
  await call(DIRETOR, 'PATCH', `/secoes/${PNL}`, { ativa: false });
  await call(DIRETOR, 'PATCH', `/secoes/${IND}`, { ativa: false, reatribuir: true });
  const r = await call(DIRETOR, 'PATCH', `/secoes/${CPE}`, { ativa: false, reatribuir: true });
  assert.equal(r.status, 409);
  assert.equal(r.data.pode_reatribuir, false, 'só Subseção reatribui à seção acima');
  assert.ok(da);
});

test('os cartões saem de uma só consulta, e a recursão só desce por Subseções', async (t) => {
  const { db, da, coord } = await deplan(t);
  const arvores = await comEmpresa(1, () => arvoresDosCentros(db));
  assert.deepEqual([...arvores.get(CPE)].sort((a, b) => a - b), [CPE, IND, PNL]);
  assert.deepEqual(arvores.get(da), [da]);
  assert.deepEqual(arvores.get(coord), [coord]);
  assert.ok(!arvores.has(IND) && !arvores.has(PNL));
});
