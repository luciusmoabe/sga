// Guarda contra divergência entre servidor e interface: as regras têm uma única fonte (public/js/regras.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as regras from '../public/js/regras.js';
import * as logic from '../server/logic.js';
import * as ui from '../public/js/ui.js';

test('servidor reexporta as regras compartilhadas, sem cópia própria', () => {
  for (const nome of ['STATUS', 'TRANSICOES', 'PRIORIDADES', 'ORDEM_COR', 'HORA_FECHAMENTO']) {
    assert.equal(logic[nome], regras[nome], nome);
  }
  assert.equal(ui.porNecessidade, regras.porNecessidade);
});

test('rótulos da interface cobrem exatamente os status e prioridades das regras', () => {
  assert.deepEqual(Object.keys(ui.STATUS).sort(), [...regras.STATUS].sort());
  assert.deepEqual(Object.keys(ui.PRIO).sort(), [...regras.PRIORIDADES].sort());
  assert.deepEqual(Object.keys(ui.COR).sort(), Object.keys(regras.ORDEM_COR).sort());
});

test('transições só usam status válidos, sem laços e sem status sem saída', () => {
  assert.deepEqual(Object.keys(regras.TRANSICOES).sort(), [...regras.STATUS].sort());
  for (const [de, destinos] of Object.entries(regras.TRANSICOES)) {
    assert.ok(destinos.length > 0, `${de} não tem saída`);
    for (const para of destinos) {
      assert.ok(regras.STATUS.includes(para), `${de} → ${para}`);
      assert.notEqual(de, para);
    }
  }
});

test('fechamento usa a hora compartilhada e por necessidade ordena vermelho, amarelo, verde', () => {
  assert.equal(logic.fechamentoDe('2026-09-22'), `2026-09-21T${String(regras.HORA_FECHAMENTO).padStart(2, '0')}:00:00`);
  const itens = [{ cor: 'verde', secao: { id: 1 } }, { cor: 'vermelho', secao: { id: 3 } }, { cor: 'amarelo', secao: { id: 2 } }, { cor: 'vermelho', secao: { id: 2 } }];
  assert.deepEqual(itens.sort(regras.porNecessidade).map((i) => `${i.cor}${i.secao.id}`), ['vermelho2', 'vermelho3', 'amarelo2', 'verde1']);
});
