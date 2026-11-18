// O que pede a decisão do Diretor no Painel da semana (public/js/decisao-painel.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pontosParaDecidir } from '../public/js/decisao-painel.js';

const u = (id, nome, o = {}) => ({ secao: { id, nome }, impedimentos_criticos: 0, pedidos_pendentes: 0, ...o });

test('um ponto por seção com impedimento crítico (mais graves primeiro) e um só para todos os pedidos de prazo', () => {
  const p = pontosParaDecidir([u(1, 'Planejamento', { impedimentos_criticos: 1, pedidos_pendentes: 2 }), u(2, 'Orçamento', { impedimentos_criticos: 3 }), u(3, 'Gestão', { pedidos_pendentes: 1 }), u(4, 'Coordenação')], '2026-11-24');
  assert.deepEqual(p.map((x) => [x.chave, x.n, x.secao]), [['critico', 3, 'Orçamento'], ['critico', 1, 'Planejamento'], ['pedidos', 3, undefined]]);
  assert.equal(p[0].href, '#/centro/2?semana=2026-11-24');
  assert.equal(p[2].href, '#/prazos');
  assert.equal(p[2].rotulo, 'Responder');
});

test('sem impedimento crítico nem pedido, nada pede decisão', () => {
  assert.deepEqual(pontosParaDecidir([u(1, 'Planejamento'), u(2, 'Orçamento')], '2026-11-24'), []);
  assert.deepEqual(pontosParaDecidir([], '2026-11-24'), []);
});

test('empate de gravidade: ordem alfabética das seções', () => {
  const p = pontosParaDecidir([u(2, 'Zeladoria', { impedimentos_criticos: 1 }), u(1, 'Almoxarifado', { impedimentos_criticos: 1 })], '2026-11-24');
  assert.deepEqual(p.map((x) => x.secao), ['Almoxarifado', 'Zeladoria']);
});
