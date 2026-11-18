// O resumo do uso das telas (public/js/uso-resumo.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoDeUso } from '../public/js/uso-resumo.js';

const l = (tela, perfil, versao, aberturas) => ({ tela, perfil, versao, aberturas });

test('soma por tela, separa as versões e os perfis, e ordena da mais aberta para a menos aberta', () => {
  const r = resumoDeUso([l('agenda', 'chefe', 'atual', 5), l('agenda', 'chefe', 'nova', 3), l('agenda', 'membro', 'atual', 2), l('painel', 'diretor', 'atual', 20), l('historico', 'chefe', 'atual', 1)]);
  assert.deepEqual(r.telas.map((t) => [t.tela, t.total]), [['painel', 20], ['agenda', 10], ['historico', 1]]);
  const a = r.telas.find((t) => t.tela === 'agenda');
  assert.deepEqual([a.atual, a.nova, a.perfis], [7, 3, { chefe: 8, membro: 2 }]);
  assert.equal(r.total, 31);
});

test('empate: ordem alfabética; as telas conhecidas que ninguém abriu vão para "nunca abertas"', () => {
  const r = resumoDeUso([l('b', 'chefe', 'atual', 2), l('a', 'chefe', 'atual', 2)], ['a', 'b', 'zeta', 'alfa']);
  assert.deepEqual(r.telas.map((t) => t.tela), ['a', 'b']);
  assert.deepEqual(r.nuncaAbertas, ['alfa', 'zeta']);
});

test('sem nenhum registro: lista vazia e tudo como nunca aberto', () => {
  const r = resumoDeUso([], ['agenda', 'painel']);
  assert.deepEqual(r, { telas: [], nuncaAbertas: ['agenda', 'painel'], total: 0 });
});
