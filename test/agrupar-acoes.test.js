// Agrupamento de ações por diretriz na tela Ações (módulo puro da interface).
import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorDiretriz, resumirGrupo, partesDoResumo } from '../public/js/agrupar-acoes.js';

const ac = (id, extra = {}) => ({ id, titulo: `Ação ${id}`, diretriz_id: null, status: 'a_fazer', atrasada: false, prazo: '2026-10-02', ...extra });

test('agrupar: ações de uma mesma diretriz viram um grupo, na posição da primeira', () => {
  const lista = [ac(1), ac(2, { diretriz_id: 7 }), ac(3), ac(4, { diretriz_id: 7 }), ac(5, { diretriz_id: 7 })];
  const r = agruparPorDiretriz(lista);
  assert.deepEqual(r.map((x) => x.tipo), ['acao', 'grupo', 'acao']);
  assert.equal(r[1].diretrizId, 7);
  assert.deepEqual(r[1].acoes.map((a) => a.id), [2, 4, 5]);
  assert.equal(r[1].titulo, 'Ação 2');
  assert.equal(r[1].resumo.total, 3);
});

test('agrupar: uma ação sozinha na lista (ou sem diretriz) continua solta', () => {
  const lista = [ac(1, { diretriz_id: 7 }), ac(2), ac(3, { diretriz_id: 8 }), ac(4, { diretriz_id: 8 })];
  const r = agruparPorDiretriz(lista);
  assert.deepEqual(r.map((x) => x.tipo), ['acao', 'acao', 'grupo']);
  assert.equal(r[0].acao.id, 1, 'diretriz com uma só ação visível não vira grupo');
});

test('agrupar: lista vazia e sem diretrizes não mudam nada', () => {
  assert.deepEqual(agruparPorDiretriz([]), []);
  const lista = [ac(1), ac(2)];
  assert.deepEqual(agruparPorDiretriz(lista).map((x) => x.acao), lista);
});

test('resumo: cada ação cai em um só balde, pelo mais urgente', () => {
  const r = resumirGrupo([
    ac(1, { status: 'em_andamento', atrasada: true }),
    ac(2, { status: 'bloqueada' }),
    ac(3, { status: 'em_andamento' }),
    ac(4),
    ac(5, { status: 'concluida', atrasada: true }),
    ac(6, { status: 'concluida', prazo: '2026-10-09' }),
  ]);
  assert.deepEqual({ a: r.atrasadas, b: r.bloqueadas, e: r.emAndamento, f: r.aFazer, c: r.concluidas, t: r.total }, { a: 1, b: 1, e: 1, f: 1, c: 2, t: 6 });
  assert.equal(r.prazoMin, '2026-10-02');
  assert.equal(r.prazoMax, '2026-10-09');
});

test('partes do resumo: em ordem de urgência, com singular e plural, sem os zeros', () => {
  const partes = partesDoResumo(resumirGrupo([ac(1, { atrasada: true }), ac(2, { atrasada: true }), ac(3, { status: 'concluida' })]));
  assert.deepEqual(partes.map((p) => p.texto), ['2 atrasadas', '1 concluída']);
});
