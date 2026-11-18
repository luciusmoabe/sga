// Regras puras da nova interface (public/js/nova-interface.js): áreas por perfil, abas disponíveis, aba ativa e a área de cada rota atual.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS_CHEFE, AREAS_GESTAO, AREAS_MEMBRO, AREA_CONFIGURACAO, PERFIS_NOVA_INTERFACE, TODAS_AS_AREAS, abaAtiva, abasDaArea, areaDaRota, areasDoPerfil, casaNovaInterface, menuNovaInterface, temNovaInterface,
} from '../public/js/nova-interface.js';

const area = (areas, id) => areas.find((a) => a.id === id);
const titulos = { 'minhas-acoes': 'Minhas ações', agenda: 'Agenda', diario: 'Diário', direcionar: 'Direcionar ação', 'acoes-centros': 'Ações dos Centros', combinados: 'Combinados', produtividade: 'Produtividade', historico: 'Histórico', pauta: 'Pauta', avisos: 'Avisos' };

test('o menu da versão nova tem quatro áreas por perfil, na ordem da proposta', () => {
  assert.deepEqual(menuNovaInterface(areasDoPerfil('chefe')), [['a-hoje', 'Hoje'], ['a-acoes', 'Ações'], ['a-semana', 'Semana'], ['a-equipe', 'Equipe']]);
  assert.deepEqual(menuNovaInterface(areasDoPerfil('diretor')), [['a-painel', 'Painel'], ['a-acoes', 'Ações'], ['a-reuniao', 'Reunião', 'destaque'], ['a-config', 'Configuração']]);
  assert.deepEqual(menuNovaInterface(areasDoPerfil('apoio')).map((m) => m[0]), ['a-painel', 'a-acoes', 'a-reuniao', 'a-config']);
  assert.deepEqual(menuNovaInterface(areasDoPerfil('membro')), [['a-meudia', 'Meu dia'], ['a-atas', 'Atas']]);
});

test('o chefe com acesso à configuração ganha a quinta área; o membro tem duas; Administrador e Consulta não têm a versão nova ainda', () => {
  assert.deepEqual(areasDoPerfil('chefe', { acessoConfiguracao: true }).map((a) => a.id), ['a-hoje', 'a-acoes', 'a-semana', 'a-equipe', 'a-config']);
  assert.deepEqual(areasDoPerfil('membro').map((a) => a.id), ['a-meudia', 'a-atas']);
  assert.deepEqual(areasDoPerfil('consulta'), []);
  assert.deepEqual(PERFIS_NOVA_INTERFACE, ['chefe', 'diretor', 'apoio', 'membro']);
  assert.equal(temNovaInterface('diretor'), true);
  assert.equal(temNovaInterface('membro'), true);
  assert.equal(temNovaInterface('administrador'), false);
  assert.equal(temNovaInterface('consulta'), false);
});

test('onde o perfil entra na versão nova', () => {
  assert.equal(casaNovaInterface('chefe'), '#/a-hoje');
  assert.equal(casaNovaInterface('diretor'), '#/a-painel');
  assert.equal(casaNovaInterface('apoio'), '#/a-painel');
  assert.equal(casaNovaInterface('membro'), '#/a-meudia');
});

test('dentro de um perfil, cada tela atual pertence a uma só área; o mesmo id de área não muda de sentido', () => {
  for (const [nome, areas] of [['chefe', areasDoPerfil('chefe', { acessoConfiguracao: true })], ['diretor', areasDoPerfil('diretor')]]) {
    const vistas = new Map();
    for (const a of areas) for (const b of a.abas) {
      assert.equal(vistas.has(b.rota), false, `${nome}: ${b.rota} está em ${vistas.get(b.rota)} e em ${a.id}`);
      vistas.set(b.rota, a.id);
    }
  }
  assert.equal(new Set(TODAS_AS_AREAS.map((a) => a.id)).size, TODAS_AS_AREAS.length, 'sem id repetido na lista de todas as áreas');
  assert.deepEqual(TODAS_AS_AREAS.map((a) => a.id).sort(), ['a-acoes', 'a-atas', 'a-config', 'a-equipe', 'a-hoje', 'a-meudia', 'a-painel', 'a-reuniao', 'a-semana']);
});

test('areaDaRota: a área de cada tela atual, por perfil', () => {
  assert.equal(areaDaRota(AREAS_CHEFE, 'hoje'), 'a-hoje');
  assert.equal(areaDaRota(AREAS_MEMBRO, 'diario'), 'a-meudia');
  assert.equal(areaDaRota(AREAS_MEMBRO, 'atas'), 'a-atas');
  assert.equal(areaDaRota(AREAS_CHEFE, 'diario'), 'a-acoes');
  assert.equal(areaDaRota(AREAS_CHEFE, 'atualizacao'), 'a-semana');
  assert.equal(areaDaRota(AREAS_CHEFE, 'reunioes-equipe'), 'a-semana', 'o detalhe de uma reunião da equipe fica na Semana');
  assert.equal(areaDaRota(AREAS_CHEFE, 'produtividade'), 'a-equipe');
  assert.equal(areaDaRota(AREAS_CHEFE, 'painel'), null, 'rota de outro perfil não pertence a nenhuma área');
  const g = [...AREAS_GESTAO, AREA_CONFIGURACAO];
  assert.equal(areaDaRota(g, 'painel'), 'a-painel');
  assert.equal(areaDaRota(g, 'centro'), 'a-painel', 'o detalhe de um Centro fica no Painel');
  assert.equal(areaDaRota(g, 'produtividade'), 'a-painel', 'para o Diretor, produtividade é do Painel');
  assert.equal(areaDaRota(g, 'prazos'), 'a-acoes');
  assert.equal(areaDaRota(g, 'pauta'), 'a-reuniao');
  assert.equal(areaDaRota(g, 'estrutura'), 'a-config');
  assert.equal(areaDaRota(g, 'a-reuniao'), 'a-reuniao', 'a própria área também vale');
});

test('abasDaArea: só as rotas disponíveis, com o rótulo da aba ou o título da tela', () => {
  const sem = (...fora) => (rota) => !fora.includes(rota);
  const todas = abasDaArea(area(AREAS_CHEFE, 'a-acoes'), sem(), (r) => titulos[r]);
  assert.deepEqual(todas.map((b) => b.rotulo), ['Minhas ações', 'Agenda', 'Diário', 'Direcionar', 'Ações dos Centros']);
  assert.deepEqual(abasDaArea(area(AREAS_CHEFE, 'a-acoes'), sem('direcionar', 'acoes-centros'), (r) => titulos[r]).map((b) => b.rota), ['minhas-acoes', 'agenda', 'diario']);
  assert.deepEqual(abasDaArea(area(AREAS_GESTAO, 'a-reuniao'), sem(), (r) => titulos[r]).map((b) => b.rotulo), ['Iniciar reunião', 'Pauta', 'Combinados', 'Reuniões e atas', 'Ajustes da reunião']);
  assert.deepEqual(abasDaArea(AREA_CONFIGURACAO, sem('avisos'), (r) => titulos[r]).map((b) => b.rota), ['estrutura'], 'o Apoio não tem Avisos');
});

test('abaAtiva: a pedida se existir; senão a primeira; sem abas, nulo', () => {
  const abas = [{ rota: 'atualizacao', rotulo: 'A' }, { rota: 'atas', rotulo: 'B' }];
  assert.equal(abaAtiva(abas, 'atas').rota, 'atas');
  assert.equal(abaAtiva(abas, 'combinados').rota, 'atualizacao', 'aba que não existe cai na primeira');
  assert.equal(abaAtiva(abas, null).rota, 'atualizacao');
  assert.equal(abaAtiva([], 'atas'), null);
});
