import test from 'node:test';
import assert from 'node:assert/strict';
import { ehISO } from '../server/logic.js';

test('datas: rejeita normalização de dias e meses inexistentes', () => {
  for (const valor of ['2026-02-31', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-00', '2026-01-00', '1900-02-29', '2026-1-01', '', null, 20260922]) {
    assert.equal(ehISO(valor), false, String(valor));
  }
});

test('datas: aceita limites de mês e anos bissextos válidos', () => {
  for (const valor of ['2026-02-28', '2028-02-29', '2000-02-29', '2026-04-30', '2026-12-31']) {
    assert.equal(ehISO(valor), true, valor);
  }
});
