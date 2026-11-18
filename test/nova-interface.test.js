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

test('o chefe com acesso à configuração ganha a quinta área; o membro tem duas; só a Consulta não tem a versão nova', () => {
  assert.deepEqual(areasDoPerfil('chefe', { acessoConfiguracao: true }).map((a) => a.id), ['a-hoje', 'a-acoes', 'a-semana', 'a-equipe', 'a-config']);
  assert.deepEqual(areasDoPerfil('membro').map((a) => a.id), ['a-meudia', 'a-atas']);
  assert.deepEqual(areasDoPerfil('consulta'), []);
  assert.deepEqual(PERFIS_NOVA_INTERFACE, ['chefe', 'diretor', 'apoio', 'membro', 'administrador']);
  assert.equal(temNovaInterface('diretor'), true);
  assert.equal(temNovaInterface('membro'), true);
  assert.equal(temNovaInterface('administrador'), true);
  assert.equal(temNovaInterface('consulta'), false);
});

test('onde o perfil entra na versão nova', () => {
  assert.equal(casaNovaInterface('chefe'), '#/a-hoje');
  assert.equal(casaNovaInterface('diretor'), '#/a-painel');
  assert.equal(casaNovaInterface('apoio'), '#/a-painel');
  assert.equal(casaNovaInterface('membro'), '#/a-meudia');
  assert.equal(casaNovaInterface('administrador'), '#/a-painel');
  assert.equal(casaNovaInterface('administrador', { daDiretoriaAdjunta: true }), '#/a-secao', 'o Administrador da Diretoria Adjunta entra pela própria seção');
});

test('dentro de um perfil, cada tela atual pertence a uma só área; o mesmo id de área não muda de sentido', () => {
  for (const [nome, areas] of [['chefe', areasDoPerfil('chefe', { acessoConfiguracao: true })], ['diretor', areasDoPerfil('diretor')], ['administrador', areasDoPerfil('administrador')], ['administrador da Diretoria Adjunta', areasDoPerfil('administrador', { daDiretoriaAdjunta: true })]]) {
    const vistas = new Map();
    for (const a of areas) for (const b of a.abas) {
      assert.equal(vistas.has(b.rota), false, `${nome}: ${b.rota} está em ${vistas.get(b.rota)} e em ${a.id}`);
      vistas.set(b.rota, a.id);
    }
  }
  assert.equal(new Set(TODAS_AS_AREAS.map((a) => a.id)).size, TODAS_AS_AREAS.length, 'sem id repetido na lista de todas as áreas');
  assert.deepEqual(TODAS_AS_AREAS.map((a) => a.id).sort(), ['a-acoes', 'a-atas', 'a-config', 'a-equipe', 'a-hoje', 'a-meudia', 'a-painel', 'a-reuniao', 'a-secao', 'a-semana']);
});

test('areaDaRota: a área de cada tela atual, por perfil', () => {
  assert.equal(areaDaRota(AREAS_CHEFE, 'hoje'), 'a-hoje');
  assert.equal(areaDaRota(AREAS_MEMBRO, 'diario'), 'a-meudia');
  assert.equal(areaDaRota(AREAS_MEMBRO, 'atas'), 'a-atas');
  assert.equal(areaDaRota(AREAS_CHEFE, 'diario'), 'a-acoes');
  assert.equal(areaDaRota(AREAS_CHEFE, 'atualizacao'), 'a-semana');
  assert.equal(areaDaRota(AREAS_CHEFE, 'reunioes-equipe'), 'a-semana', 'o detalhe de uma reunião da equipe fica na Semana');
  assert.equal(areaDaRota(AREAS_CHEFE, 'produtividade'), 'a-equipe');
  assert.equal(areaDaRota(AREAS_CHEFE, 'historico'), 'a-semana', 'as atualizações enviadas ficam na Semana');
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
  assert.deepEqual(abasDaArea(AREA_CONFIGURACAO, sem('avisos', 'uso'), (r) => titulos[r]).map((b) => b.rota), ['estrutura'], 'o Apoio não tem Avisos nem Uso das telas');
});

test('abaAtiva: a pedida se existir; senão a primeira; sem abas, nulo', () => {
  const abas = [{ rota: 'atualizacao', rotulo: 'A' }, { rota: 'atas', rotulo: 'B' }];
  assert.equal(abaAtiva(abas, 'atas').rota, 'atas');
  assert.equal(abaAtiva(abas, 'combinados').rota, 'atualizacao', 'aba que não existe cai na primeira');
  assert.equal(abaAtiva(abas, null).rota, 'atualizacao');
  assert.equal(abaAtiva([], 'atas'), null);
});

test('Administrador: a gestão inteira e, se está numa Diretoria Adjunta, a área "Minha seção" logo depois do Painel', () => {
  assert.deepEqual(menuNovaInterface(areasDoPerfil('administrador')).map((m) => m[0]), ['a-painel', 'a-acoes', 'a-reuniao', 'a-config']);
  assert.deepEqual(menuNovaInterface(areasDoPerfil('administrador', { daDiretoriaAdjunta: true })).map((m) => m[0]), ['a-painel', 'a-secao', 'a-acoes', 'a-reuniao', 'a-config']);
  const minha = areasDoPerfil('administrador', { daDiretoriaAdjunta: true }).find((a) => a.id === 'a-secao');
  assert.deepEqual(minha.abas.map((b) => b.rota), ['inicio', 'minhas-acoes', 'atualizacao', 'equipe']);
  assert.equal(areaDaRota(areasDoPerfil('administrador', { daDiretoriaAdjunta: true }), 'atualizacao'), 'a-secao');
  assert.equal(areaDaRota(areasDoPerfil('administrador'), 'atualizacao'), null, 'sem Diretoria Adjunta, a atualização não é do Administrador');
});

// A regra de "Nova ação" (public/js/nova-acao.js) importa módulos do navegador; aqui só a parte pura dos caminhos é conferida, copiada da fonte.
test('Nova ação: os caminhos de criação de cada perfil (a seção, direcionar, ou os dois com pergunta)', async () => {
  const fonte = await (await import('node:fs/promises')).readFile(new URL('../public/js/nova-acao.js', import.meta.url), 'utf8');
  const corpo = fonte.slice(fonte.indexOf('export function caminhosDeCriacao'), fonte.indexOf('/** `aoCriar`'));
  const caminhosDeCriacao = new Function(`${corpo.replace('export function', 'function')}; return caminhosDeCriacao;`)();
  const c = (perfil, extra = {}, boot = {}) => caminhosDeCriacao({ perfil, ...extra }, boot);
  assert.deepEqual(c('membro'), { secao: true, direcionar: false });
  assert.deepEqual(c('chefe'), { secao: true, direcionar: false }, 'chefe sem subseções: só a própria seção');
  assert.deepEqual(c('chefe', {}, { secao: { tem_subsecoes: true } }), { secao: true, direcionar: true }, 'com subseções: pergunta');
  assert.deepEqual(c('diretor'), { secao: false, direcionar: true });
  assert.deepEqual(c('apoio'), { secao: false, direcionar: true });
  assert.deepEqual(c('administrador'), { secao: false, direcionar: true }, 'o Administrador geral direciona');
  assert.deepEqual(c('administrador', { secao_id: 20 }), { secao: true, direcionar: true }, 'o da Diretoria Adjunta: pergunta');
});
