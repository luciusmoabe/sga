// Periodicidade da reunião (semanal por padrão, quinzenal opcional) e data da próxima reunião alterável.
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { janelasDoRelato } from '../server/relato.js';
import { cicloDe, refReuniao, reuniaoAnterior, reuniaoSeguinte } from '../server/logic.js';

process.env.SGC_NOW = '2026-09-19T10:00:00'; // sábado; a próxima terça é 22/09

const DIRETOR = 1, CPE = 3;
const instante = (s) => new Date(`${s}-03:00`); // fuso da Bahia

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
const boot = async (call, uid = DIRETOR) => (await call(uid, 'GET', '/bootstrap')).data;

test('regras puras: semanal por padrão; quinzenal conta da data marcada; reunião alterada mantém o ritmo', () => {
  const base = { dia: 2, horaCorte: 12 };
  assert.deepEqual(cicloDe({}), { intervalo: 7, proxima: null });
  assert.deepEqual(cicloDe({ reuniao_intervalo: '14', reuniao_proxima: '2026-09-22' }), { intervalo: 14, proxima: '2026-09-22' });
  assert.equal(cicloDe({ reuniao_intervalo: '10' }).intervalo, 7, 'valor desconhecido vale semanal');
  // Sem data marcada: o dia da semana, como sempre foi.
  assert.equal(refReuniao(instante('2026-09-19T10:00:00'), base), '2026-09-22');
  assert.equal(refReuniao(instante('2026-09-22T13:00:00'), base), '2026-09-29');
  // Quinzenal: na terça da reunião (até o meio-dia) vale o dia; depois, a de 15 dias adiante.
  const q = { ...base, intervalo: 14, proxima: '2026-09-22' };
  assert.equal(refReuniao(instante('2026-09-22T11:00:00'), q), '2026-09-22');
  assert.equal(refReuniao(instante('2026-09-22T13:00:00'), q), '2026-10-06');
  assert.equal(refReuniao(instante('2026-09-29T09:00:00'), q), '2026-10-06', 'na semana sem reunião, já vale a próxima');
  assert.equal(refReuniao(instante('2026-10-07T09:00:00'), q), '2026-10-20');
  // Data adiada para a quarta: depois dela a série volta para a terça configurada.
  const adiada = { ...base, intervalo: 7, proxima: '2026-09-23' };
  assert.equal(refReuniao(instante('2026-09-22T09:00:00'), adiada), '2026-09-23');
  assert.equal(refReuniao(instante('2026-09-23T13:00:00'), adiada), '2026-09-29');
  assert.equal(reuniaoAnterior('2026-10-06', { dia: 2, intervalo: 14 }), '2026-09-22');
  assert.equal(reuniaoSeguinte('2026-09-22', { dia: 2, intervalo: 14 }), '2026-10-06');
  assert.equal(reuniaoAnterior('2026-09-23', { dia: 2, intervalo: 7 }), '2026-09-15', 'depois de uma reunião adiada, a anterior é a prevista na terça');
  // Janelas do relato acompanham a periodicidade.
  assert.equal(janelasDoRelato('2026-10-06', '2026-10-01').concluidas.de, '2026-09-29');
  assert.equal(janelasDoRelato('2026-10-06', '2026-10-01', 14).concluidas.de, '2026-09-22');
  assert.equal(janelasDoRelato('2026-10-06', '2026-10-01', 14).programadas.ate, '2026-10-20');
});

test('configuração: semanal é o padrão; quinzenal e a data da próxima reunião valem para o bootstrap e o trilho do Início', async (t) => {
  const { call } = await demo(t);
  const inicial = await boot(call);
  assert.equal(inicial.reuniao_intervalo, 7);
  assert.equal(inicial.reuniao_proxima, null);
  assert.equal(inicial.semana, '2026-09-22');
  assert.equal(inicial.reuniao_anterior, '2026-09-15');

  // Quinzenal sem informar data: a série começa na próxima reunião prevista.
  assert.equal((await call(DIRETOR, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_intervalo: 14 })).status, 200);
  const q = await boot(call);
  assert.equal(q.reuniao_intervalo, 14);
  assert.equal(q.reuniao_proxima, '2026-09-22');
  assert.equal(q.semana, '2026-09-22');
  assert.equal(q.reuniao_anterior, '2026-09-08', 'o trilho vai da reunião anterior (15 dias antes) à próxima');
  assert.equal(q.fechamento, '2026-09-21T18:00:00');

  // Chefe lê o mesmo trilho.
  assert.equal((await boot(call, CPE)).reuniao_intervalo, 14);

  // Muda só a próxima reunião (adia 2 dias); a série continua dela.
  const adiar = await call(DIRETOR, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_proxima: '2026-09-24' });
  assert.equal(adiar.status, 200);
  const m = await boot(call);
  assert.equal(m.semana, '2026-09-24');
  assert.equal(m.fechamento, '2026-09-23T18:00:00', 'o fechamento acompanha a nova data');
  assert.equal(m.reuniao_intervalo, 14, 'a periodicidade não muda ao mudar a data');

  // O relato aceita a semana alterada, mesmo fora do dia configurado.
  assert.equal((await call(CPE, 'GET', '/atualizacao?semana=2026-09-24')).status, 200);
  assert.equal((await call(CPE, 'GET', '/atualizacao?semana=2026-09-25')).status, 400, 'outra data fora do dia configurado segue recusada');

  // Voltar ao dia da semana desfaz a data marcada.
  assert.equal((await call(DIRETOR, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_proxima: null, reuniao_intervalo: 7 })).status, 200);
  const volta = await boot(call);
  assert.equal(volta.reuniao_proxima, null);
  assert.equal(volta.semana, '2026-09-22');
  assert.equal(volta.reuniao_intervalo, 7);
});

test('configuração: valida periodicidade e data, e não deixa mudar a data com reunião em andamento', async (t) => {
  const { call } = await demo(t);
  const base = { combinados_frequencia: 'sempre' };
  assert.equal((await call(DIRETOR, 'PUT', '/config', { ...base, reuniao_intervalo: 10 })).status, 400);
  assert.equal((await call(DIRETOR, 'PUT', '/config', { ...base, reuniao_intervalo: 'x' })).status, 400);
  assert.equal((await call(DIRETOR, 'PUT', '/config', { ...base, reuniao_proxima: 'amanhã' })).status, 400);
  assert.equal((await call(DIRETOR, 'PUT', '/config', { ...base, reuniao_proxima: '2026-09-18' })).status, 400, 'não pode ser no passado');
  assert.equal((await call(CPE, 'PUT', '/config', { ...base, reuniao_intervalo: 14 })).status, 403, 'chefe não muda a reunião');
  assert.equal((await boot(call)).reuniao_intervalo, 7, 'nada foi gravado');

  assert.equal((await call(DIRETOR, 'POST', '/reunioes/iniciar')).status, 201);
  assert.equal((await call(DIRETOR, 'PUT', '/config', { ...base, reuniao_proxima: '2026-09-30' })).status, 409);
});

test('reunião quinzenal: iniciar usa a data da série e a ata anuncia a próxima 15 dias depois', async (t) => {
  const { call } = await demo(t);
  await call(DIRETOR, 'PUT', '/config', { combinados_frequencia: 'sempre', reuniao_intervalo: 14, reuniao_proxima: '2026-09-22' });
  const ini = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  assert.equal(ini.status, 201);
  assert.equal(ini.data.reuniao.semana, '2026-09-22');
  const enc = await call(DIRETOR, 'POST', `/reunioes/${ini.data.reuniao.id}/encerrar`);
  assert.equal(enc.status, 200);
  const ata = (await call(DIRETOR, 'GET', `/reunioes/${ini.data.reuniao.id}`)).data;
  assert.match(JSON.stringify(ata), /Próxima reunião: terça-feira, 06\/10\/2026/i);
});
