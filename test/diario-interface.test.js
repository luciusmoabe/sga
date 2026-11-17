// Regras puras da interface do diário de progresso (public/js/diario.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_DIARIO, agruparPorDia, contagens, ehLink, filtrarDiario, haQuantoTempo, resumir, rotuloDoDia, rotuloTipo } from '../public/js/diario.js';

const HOJE = '2026-11-17';
let n = 0;
const reg = (o = {}) => ({ id: ++n, tipo: 'andamento', texto: `Registro ${n}`, data: HOJE, tarefa_id: null, tarefa_nome: null, ...o });

test('tipos e rótulos', () => {
  assert.deepEqual(TIPOS_DIARIO.map(([v]) => v), ['andamento', 'entrega', 'impedimento', 'observacao']);
  assert.equal(rotuloTipo('observacao'), 'Observação');
  assert.equal(rotuloTipo('desconhecido'), 'desconhecido');
});

test('filtro por tipo e por tarefa: todas, geral, excluídas e uma tarefa', () => {
  const geral = reg(), daT1 = reg({ tarefa_id: 7, tarefa_nome: 'Minuta' }), daT2 = reg({ tarefa_id: 8, tarefa_nome: 'Empenho', tipo: 'entrega' });
  const excluida = reg({ tarefa_id: null, tarefa_nome: 'Tarefa antiga' });
  const lista = [geral, daT1, daT2, excluida];
  const ids = (l) => l.map((r) => r.id);
  assert.deepEqual(ids(filtrarDiario(lista)), ids(lista));
  assert.deepEqual(ids(filtrarDiario(lista, { tipo: 'entrega' })), [daT2.id]);
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: 'geral' })), [geral.id], '"geral" não inclui os de tarefa excluída');
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: 'excluida' })), [excluida.id]);
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: '7' })), [daT1.id]);
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: '7', tipo: 'entrega' })), [], 'os dois filtros se combinam');
});

test('agrupar por dia mantém a ordem e junta os do mesmo dia', () => {
  const a = reg({ data: '2026-11-17' }), b = reg({ data: '2026-11-17' }), c = reg({ data: '2026-11-15' }), d = reg({ data: '2026-11-17' });
  const g = agruparPorDia([a, b, c, d]);
  assert.deepEqual(g.map((x) => [x.data, x.registros.length]), [['2026-11-17', 2], ['2026-11-15', 1], ['2026-11-17', 1]], 'só junta os vizinhos: a ordem recebida é a que vale');
  assert.deepEqual(agruparPorDia([]), []);
});

test('rótulo do dia e "há quanto tempo"', () => {
  assert.equal(rotuloDoDia('2026-11-17', HOJE), 'Hoje');
  assert.equal(rotuloDoDia('2026-11-16', HOJE), 'Ontem');
  assert.equal(rotuloDoDia('2026-11-13', HOJE), 'sexta, 13/11');
  assert.equal(rotuloDoDia('2025-12-30', HOJE), 'terça, 30/12/2025', 'com o ano quando não é o de hoje');
  assert.equal(haQuantoTempo('2026-11-17T08:30:00', HOJE), 'hoje');
  assert.equal(haQuantoTempo('2026-11-16T23:10:00', HOJE), 'ontem');
  assert.equal(haQuantoTempo('2026-11-12T09:00:00', HOJE), 'há 5 dias');
});

test('resumir corta em palavra inteira e tira quebras de linha', () => {
  assert.equal(resumir('Curto.'), 'Curto.');
  assert.equal(resumir('Linha um\n\nlinha   dois'), 'Linha um linha dois');
  const longo = resumir('palavra '.repeat(40), 50);
  assert.ok(longo.endsWith('…') && longo.length <= 51, longo);
  assert.ok(!/\s…$/.test(longo));
});

test('contagens por tipo, por tarefa, gerais e de tarefas excluídas', () => {
  const lista = [reg(), reg({ tipo: 'entrega', tarefa_id: 7, tarefa_nome: 'Minuta' }), reg({ tarefa_id: 7, tarefa_nome: 'Minuta' }), reg({ tarefa_nome: 'Antiga' })];
  const c = contagens(lista);
  assert.deepEqual(c.porTipo, { andamento: 3, entrega: 1 });
  assert.equal(c.porTarefa.get(7).n, 2);
  assert.equal(c.porTarefa.get(7).nome, 'Minuta');
  assert.equal(c.geral, 1);
  assert.equal(c.excluidas, 1);
});

test('só http e https viram link', () => {
  assert.equal(ehLink('https://sei.exemplo.gov.br/processo/1'), true);
  assert.equal(ehLink('http://x.y/z'), true);
  assert.equal(ehLink('SEI 052.3010.2026.0005350-55'), false);
  assert.equal(ehLink('javascript:alert(1)'), false);
  assert.equal(ehLink('https://a b'), false);
});
