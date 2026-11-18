// Regras puras da nova interface (public/js/nova-interface.js): áreas, abas disponíveis, aba ativa e a área de cada rota atual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS_CHEFE, PERFIS_NOVA_INTERFACE, abaAtiva, abasDaArea, areaDaRota, menuNovaInterface, temNovaInterface } from '../public/js/nova-interface.js';

const area = (id) => AREAS_CHEFE.find((a) => a.id === id);
const titulos = { 'minhas-acoes': 'Minhas ações', agenda: 'Agenda', diario: 'Diário', direcionar: 'Direcionar ação', 'acoes-centros': 'Ações dos Centros', combinados: 'Combinados', produtividade: 'Produtividade', historico: 'Histórico' };

test('o menu da versão nova tem quatro áreas, na ordem da proposta', () => {
  assert.deepEqual(menuNovaInterface(), [['a-hoje', 'Hoje'], ['a-acoes', 'Ações'], ['a-semana', 'Semana'], ['a-equipe', 'Equipe']]);
});

test('só o chefe tem a versão nova nesta fase', () => {
  assert.deepEqual(PERFIS_NOVA_INTERFACE, ['chefe']);
  assert.equal(temNovaInterface('chefe'), true);
  assert.equal(temNovaInterface('diretor'), false);
  assert.equal(temNovaInterface('membro'), false);
});

test('cada tela atual do chefe pertence a uma só área, e nenhuma rota aparece em duas', () => {
  const vistas = new Map();
  for (const a of AREAS_CHEFE) for (const b of a.abas) {
    assert.equal(vistas.has(b.rota), false, `${b.rota} está em ${vistas.get(b.rota)} e em ${a.id}`);
    vistas.set(b.rota, a.id);
  }
  assert.equal(areaDaRota(AREAS_CHEFE, 'inicio'), 'a-hoje');
  assert.equal(areaDaRota(AREAS_CHEFE, 'minhas-acoes'), 'a-acoes');
  assert.equal(areaDaRota(AREAS_CHEFE, 'diario'), 'a-acoes');
  assert.equal(areaDaRota(AREAS_CHEFE, 'atualizacao'), 'a-semana');
  assert.equal(areaDaRota(AREAS_CHEFE, 'reunioes-equipe'), 'a-semana', 'o detalhe de uma reunião da equipe fica na Semana');
  assert.equal(areaDaRota(AREAS_CHEFE, 'gestao'), 'a-equipe');
  assert.equal(areaDaRota(AREAS_CHEFE, 'a-semana'), 'a-semana', 'a própria área também vale');
  assert.equal(areaDaRota(AREAS_CHEFE, 'painel'), null, 'rota de outro perfil não pertence a nenhuma área');
});

test('abasDaArea: só as rotas disponíveis, com o rótulo da aba ou o título da tela', () => {
  const sem = (...fora) => (rota) => !fora.includes(rota);
  const todas = abasDaArea(area('a-acoes'), sem(), (r) => titulos[r]);
  assert.deepEqual(todas.map((b) => b.rotulo), ['Minhas ações', 'Agenda', 'Diário', 'Direcionar', 'Ações dos Centros']);
  const reduzida = abasDaArea(area('a-acoes'), sem('direcionar', 'acoes-centros'), (r) => titulos[r]);
  assert.deepEqual(reduzida.map((b) => b.rota), ['minhas-acoes', 'agenda', 'diario']);
  assert.deepEqual(abasDaArea(area('a-hoje'), sem(), () => 'x').map((b) => b.rota), ['inicio']);
});

test('abaAtiva: a pedida se existir; senão a primeira; sem abas, nulo', () => {
  const abas = [{ rota: 'atualizacao', rotulo: 'A' }, { rota: 'atas', rotulo: 'B' }];
  assert.equal(abaAtiva(abas, 'atas').rota, 'atas');
  assert.equal(abaAtiva(abas, 'combinados').rota, 'atualizacao', 'aba que não existe cai na primeira');
  assert.equal(abaAtiva(abas, null).rota, 'atualizacao');
  assert.equal(abaAtiva([], 'atas'), null);
});
