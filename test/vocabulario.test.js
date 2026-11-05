// Vocabulário por empresa: os nomes dos tipos de unidade e do topo são próprios de cada empresa.
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import {
  VOCABULARIO_PADRAO, completarVocabulario, validarVocabulario, todasAs, dosPlural, esteTipo, oTipo, oTopo, doTopo, rotuloPerfil, listaDe, usaTipo,
} from '../public/js/vocabulario.js';

const DIRETOR = 1, APOIO = 2, ANA = 3, ADMIN = 10;

const SGTO = {
  niveis: 3,
  topo: { nome: 'Superintendente', genero: 'm' },
  tipos: {
    centro: { singular: 'Diretoria', plural: 'Diretorias', genero: 'f', usa: true },
    coordenacao: { singular: 'Coordenação', plural: 'Coordenações', genero: 'f', usa: true },
    subsecao: { singular: 'Coordenação de área', plural: 'Coordenações de área', genero: 'f', usa: true },
    diretoria_adjunta: { singular: 'Assessoria', plural: 'Assessorias', genero: 'f', usa: true },
  },
};

test('sem nada informado vale o padrão do órgão atual; o que faltar ou vier inválido volta ao padrão', () => {
  assert.deepEqual(completarVocabulario(undefined), VOCABULARIO_PADRAO);
  assert.deepEqual(completarVocabulario(null), VOCABULARIO_PADRAO);
  assert.deepEqual(completarVocabulario('lixo'), VOCABULARIO_PADRAO);
  const v = completarVocabulario({ topo: { nome: '  Superintendente ', genero: 'x' }, tipos: { centro: { singular: 'Diretoria' } } });
  assert.deepEqual(v.topo, { nome: 'Superintendente', genero: 'm' }, 'gênero inválido volta ao padrão');
  assert.deepEqual(v.tipos.centro, { singular: 'Diretoria', plural: 'Centros', genero: 'm', usa: true });
  assert.deepEqual(v.tipos.coordenacao, VOCABULARIO_PADRAO.tipos.coordenacao);
  assert.equal(completarVocabulario({ topo: { nome: 'x'.repeat(100) } }).topo.nome.length, 40);
});

test('os artigos acompanham o gênero e o rótulo do perfil acompanha o topo', () => {
  const p = completarVocabulario(null), s = completarVocabulario(SGTO);
  assert.equal(todasAs(p, 'centro'), 'Todos os Centros');
  assert.equal(todasAs(s, 'centro'), 'Todas as Diretorias');
  assert.equal(dosPlural(p, 'centro'), 'dos Centros');
  assert.equal(dosPlural(s, 'centro'), 'das Diretorias');
  assert.equal(esteTipo(s, 'centro'), 'esta Diretoria');
  assert.equal(oTipo(p, 'diretoria_adjunta'), 'a Diretoria Adjunta');
  assert.equal(oTopo(s), 'o Superintendente');
  assert.equal(doTopo(s), 'do Superintendente');
  assert.equal(rotuloPerfil(p, 'diretor'), 'Diretor');
  assert.equal(rotuloPerfil(s, 'diretor'), 'Superintendente');
  assert.equal(rotuloPerfil(s, 'apoio'), 'Apoio do Superintendente');
  assert.equal(rotuloPerfil(s, 'chefe'), 'Chefe de seção', 'os demais perfis seguem fixos');
  assert.equal(listaDe(['A', 'B', 'C']), 'A, B e C');
  assert.equal(listaDe(['A']), 'A');
});

test('a validação exige nomes e gênero, limita o tamanho e recusa nomes repetidos', () => {
  assert.deepEqual(validarVocabulario(SGTO), SGTO);
  const sem = (alterar) => { const c = structuredClone(SGTO); alterar(c); return c; };
  assert.throws(() => validarVocabulario(null), /Informe os nomes/);
  assert.throws(() => validarVocabulario(sem((c) => { c.topo.nome = ' '; })), /Preencha o nome/);
  assert.throws(() => validarVocabulario(sem((c) => { c.tipos.centro.plural = ''; })), /Preencha o nome/);
  assert.throws(() => validarVocabulario(sem((c) => { c.tipos.centro.genero = 'n'; })), /gênero/);
  assert.throws(() => validarVocabulario(sem((c) => { c.topo.nome = 'x'.repeat(41); })), /até 40/);
  assert.throws(() => validarVocabulario(sem((c) => { c.tipos.subsecao.singular = 'diretoria'; })), /mesmo nome/);
});

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

test('API: o bootstrap traz o vocabulário; só o Diretor e o Administrador o editam; vale para todos da empresa', async (t) => {
  const { call } = await demo(t);
  assert.deepEqual((await call(ANA, 'GET', '/bootstrap')).data.vocabulario, VOCABULARIO_PADRAO);
  for (const uid of [APOIO, ANA]) assert.equal((await call(uid, 'PUT', '/config/vocabulario', { vocabulario: SGTO })).status, 403, `perfil ${uid}`);
  assert.equal((await call(DIRETOR, 'GET', '/bootstrap')).data.vocabulario.topo.nome, 'Diretor', 'nada mudou');

  const r = await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: SGTO });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.vocabulario, SGTO);
  for (const uid of [DIRETOR, APOIO, ANA, ADMIN]) assert.deepEqual((await call(uid, 'GET', '/bootstrap')).data.vocabulario, SGTO, `perfil ${uid}`);
  assert.equal((await call(ADMIN, 'PUT', '/config/vocabulario', { vocabulario: VOCABULARIO_PADRAO })).status, 200, 'o Administrador também edita');
  assert.deepEqual((await call(ANA, 'GET', '/bootstrap')).data.vocabulario, VOCABULARIO_PADRAO);

  // Validações
  for (const corpo of [{}, { vocabulario: 'x' }, { vocabulario: { ...SGTO, topo: { nome: '', genero: 'm' } } }, { vocabulario: { ...SGTO, tipos: { ...SGTO.tipos, centro: { singular: 'A', plural: 'B', genero: 'z' } } } }]) {
    assert.equal((await call(DIRETOR, 'PUT', '/config/vocabulario', corpo)).status, 400, JSON.stringify(corpo).slice(0, 60));
  }
});

test('API: a ata e as mensagens usam os nomes da empresa', async (t) => {
  const { db, call } = await demo(t);
  await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: SGTO });
  const reuniao = (await call(DIRETOR, 'POST', '/reunioes/iniciar')).data.reuniao.id;
  assert.equal((await call(DIRETOR, 'POST', `/reunioes/${reuniao}/acoes`, { titulo: 'Para todas', prazo: '2026-12-31', destino: 'todos' })).status, 201);
  await call(DIRETOR, 'POST', `/reunioes/${reuniao}/encerrar`, {});
  const ata = (await db.prepare('select ata_texto from reunioes where id = ?').get(reuniao)).ata_texto;
  assert.ok(ata.includes('[Todas as Diretorias] Para todas'), ata);
  assert.ok(!ata.includes('Todos os Centros'));
  const erro = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'x', prazo: '2026-12-31', destino: 'especificos', secoes: [7] });
  assert.equal(erro.status, 400);
  assert.match(erro.data.erro, /Diretorias, Coordenações e Assessoria/);
});

test('tipos opcionais: a empresa pode não usar a Coordenação de primeiro nível nem a Diretoria Adjunta; Centro e Subseção sempre valem', () => {
  assert.equal(usaTipo(completarVocabulario(null), 'diretoria_adjunta'), true, 'o padrão usa todos');
  const sem = { ...SGTO, tipos: { ...SGTO.tipos, diretoria_adjunta: { ...SGTO.tipos.diretoria_adjunta, usa: false }, coordenacao: { ...SGTO.tipos.coordenacao, usa: false }, centro: { ...SGTO.tipos.centro, usa: false } } };
  const v = validarVocabulario(sem);
  assert.equal(usaTipo(v, 'diretoria_adjunta'), false);
  assert.equal(usaTipo(v, 'coordenacao'), false);
  assert.equal(usaTipo(v, 'centro'), true, 'o Centro não pode ser desligado');
  assert.equal(usaTipo(v, 'subsecao'), true);
  assert.equal(usaTipo(completarVocabulario(sem), 'diretoria_adjunta'), false);
  assert.throws(() => validarVocabulario({ ...SGTO, tipos: { ...SGTO.tipos, diretoria_adjunta: { ...SGTO.tipos.diretoria_adjunta, usa: 'não' } } }), /sim ou não/);
});

test('API: tipo que a empresa não usa não aceita unidades novas, e não se desliga tipo com unidade ativa', async (t) => {
  const { call } = await demo(t);
  const SEM_ADJUNTA = { ...SGTO, tipos: { ...SGTO.tipos, diretoria_adjunta: { ...SGTO.tipos.diretoria_adjunta, usa: false } } };
  // Com uma Adjunta ativa, não dá para deixar de usar o tipo.
  const adjunta = await call(DIRETOR, 'POST', '/secoes', { nome: 'Adjunta', tipo: 'diretoria_adjunta' });
  assert.equal(adjunta.status, 201, JSON.stringify(adjunta.data));
  const bloqueio = await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: SEM_ADJUNTA });
  assert.equal(bloqueio.status, 409);
  assert.match(bloqueio.data.erro, /Desative-as antes/);
  await call(DIRETOR, 'PATCH', `/secoes/${adjunta.data.id}`, { ativa: false });
  assert.equal((await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: SEM_ADJUNTA })).status, 200);
  // Desligado: não cria nem troca o tipo para ele.
  const nova = await call(DIRETOR, 'POST', '/secoes', { nome: 'Outra adjunta', tipo: 'diretoria_adjunta' });
  assert.equal(nova.status, 400);
  assert.match(nova.data.erro, /não usa este tipo/);
  assert.equal((await call(DIRETOR, 'PATCH', '/secoes/1', { tipo: 'diretoria_adjunta' })).status, 400);
  assert.equal((await call(DIRETOR, 'POST', '/secoes', { nome: 'Nova diretoria', tipo: 'centro' })).status, 201, 'os tipos usados seguem valendo');
  // A mensagem de destino só cita os tipos usados.
  const erro = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'x', prazo: '2026-12-31', destino: 'especificos', secoes: [7] });
  assert.match(erro.data.erro, /Diretorias e Coordenações\)/);
  assert.ok(!/Assessoria/.test(erro.data.erro));
  // Religar volta a aceitar.
  assert.equal((await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: SGTO })).status, 200);
  assert.equal((await call(DIRETOR, 'POST', '/secoes', { nome: 'Assessoria nova', tipo: 'diretoria_adjunta' })).status, 409, 'já existe uma Adjunta (ativa ou não): a regra de no máximo uma continua');
});

test('API: as mensagens falam do topo com o nome e o gênero que a empresa escolheu', async (t) => {
  const { call } = await demo(t);
  const msg = async () => (await call(ANA, 'POST', '/acoes', { titulo: 'x', prazo: '2026-12-31', demanda_diretor: 'sim' })).data.erro;
  assert.equal(await msg(), 'Informe se a ação é demanda do Diretor.', 'o padrão é o do órgão atual');
  await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: { ...SGTO, topo: { nome: 'Superintendente', genero: 'm' } } });
  assert.equal(await msg(), 'Informe se a ação é demanda do Superintendente.');
  await call(DIRETOR, 'PUT', '/config/vocabulario', { vocabulario: { ...SGTO, topo: { nome: 'Secretária', genero: 'f' } } });
  assert.equal(await msg(), 'Informe se a ação é demanda da Secretária.');
});
