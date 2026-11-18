// Nova interface, fase 1 (chefe): quatro áreas no menu, as telas atuais como abas, os endereços antigos levando à área, a opção de
// experimentar e voltar, o celular e a acessibilidade. As regras e os dados são os mesmos: só a navegação muda.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, subir } from './ajuda.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const violacoes = (p, axe) => p.evaluate(async (js) => { eval(js); return (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); }, axe);
const hash = (p) => p.evaluate(() => location.hash);
const abas = (p) => p.$$eval('.abas-area a', (as) => as.map((a) => a.textContent.trim()));
const ativa = (p) => p.$eval('.abas-area a[aria-current="page"]', (a) => a.textContent.trim());
const areaAtiva = (p) => p.$eval('.menu a[aria-current="page"]', (a) => a.dataset.rota);
const esperarHash = (p, re) => p.waitForFunction((s) => new RegExp(s).test(location.hash), { timeout: 10000 }, re.source);

/** Abre o chefe já com a versão nova ligada (a escolha fica no navegador, como no uso real). */
async function abrirNova(app, rota = '#/a-hoje', opcoes) {
  const p = await app.abrir(CHEFE_COF, '#/inicio', opcoes);
  await p.waitForSelector('.menu a');
  await p.evaluate(() => localStorage.setItem('agilis:nova-interface', '1'));
  await p.evaluate((r) => { location.hash = r; }, rota);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('.menu a');
  return p;
}

test('Experimentar e voltar: o botão alterna entre o menu atual e o de quatro áreas, e só o chefe o tem', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/inicio');
  await p.waitForSelector('#alternar-interface');
  assert.equal(await p.$eval('#alternar-interface', (b) => b.textContent), 'Experimentar a versão nova');
  assert.ok((await p.$$('.menu a')).length >= 10, 'o menu atual tem muitos itens');

  await p.click('#alternar-interface');
  await esperarHash(p, /#\/a-hoje/);
  await p.waitForSelector('.menu a[data-rota="a-hoje"]');
  assert.deepEqual(await p.$$eval('.menu a', (as) => as.map((a) => a.dataset.rota)), ['a-hoje', 'a-acoes', 'a-semana', 'a-equipe']);
  assert.equal(await p.$eval('#alternar-interface', (b) => b.textContent), 'Voltar à versão atual');
  assert.equal(await areaAtiva(p), 'a-hoje');

  await p.click('#alternar-interface');
  await esperarHash(p, /#\/inicio/);
  await p.waitForSelector('.menu a[data-rota="gestao"]');
  assert.ok((await p.$$('.menu a')).length >= 10, 'voltou ao menu atual');

  const d = await app.abrir(DIRETOR, '#/painel');
  await d.waitForSelector('.menu a');
  assert.equal(await d.$('#alternar-interface'), null, 'o Diretor ainda não tem a versão nova');
  assert.deepEqual(p.errosDaPagina, []);
});

test('As quatro áreas abrem as telas de sempre em abas, e o endereço antigo leva à área', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await abrirNova(app);
  assert.match(await p.$eval('#conteudo', (e) => e.innerText), /Sua semana/, 'Hoje mostra o início do chefe');
  assert.equal(await p.$('.abas-area'), null, 'Hoje tem uma tela só, sem abas');

  await p.click('.menu a[data-rota="a-acoes"]');
  await p.waitForSelector('.abas-area');
  assert.equal(await areaAtiva(p), 'a-acoes');
  assert.deepEqual((await abas(p)).slice(0, 3), ['Minhas ações', 'Agenda', 'Diário']);
  assert.equal(await ativa(p), 'Minhas ações');
  await p.waitForSelector('#conteudo h1');
  assert.match(await p.$eval('#conteudo', (e) => e.innerText), /Minhas ações/);

  await p.click('.abas-area a[href="#/a-acoes?t=diario"]');
  await esperarHash(p, /t=diario/);
  await p.waitForFunction(() => /Meu diário|Diário da seção/.test(document.querySelector('#conteudo')?.innerText || ''), { timeout: 10000 });
  assert.equal(await ativa(p), 'Diário');

  await p.click('.menu a[data-rota="a-semana"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Atualização', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Atualização', 'Reuniões e atas', 'Combinados', 'Ajustes da reunião']);
  assert.equal(await areaAtiva(p), 'a-semana');

  await p.click('.menu a[data-rota="a-equipe"]');
  await p.waitForFunction(() => document.querySelector('.abas-area a[aria-current="page"]')?.textContent.trim() === 'Minha equipe', { timeout: 10000 });
  assert.deepEqual(await abas(p), ['Minha equipe', 'Painel de gestão', 'Produtividade', 'Histórico']);

  // O endereço de uma tela atual leva à mesma tela dentro da área, com os parâmetros (a instância da equipe).
  await p.evaluate(() => { location.hash = '#/combinados?i=equipe'; });
  await esperarHash(p, /#\/a-semana\?.*t=combinados/);
  assert.match(await hash(p), /i=equipe/);
  assert.equal(await ativa(p), 'Combinados');
  assert.equal(await areaAtiva(p), 'a-semana');
  await p.evaluate(() => { location.hash = '#/gestao'; });
  await esperarHash(p, /#\/a-equipe\?t=gestao/);
  assert.equal(await ativa(p), 'Painel de gestão');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Link de uma ação abre a ficha dentro da área Ações; com a versão atual, nada disso aparece', async (t) => {
  const app = await subir(t); if (!app) return;
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Ação da versão nova', prazo: '2026-12-31' })).dados.id;
  const p = await abrirNova(app, `#/acao/${acao}`);
  await p.waitForSelector('dialog[open]', { timeout: 10000 });
  assert.match(await hash(p), new RegExp(`#/a-acoes\\?.*acao=${acao}`));
  assert.match(await p.$eval('dialog[open]', (d) => d.innerText), /Ação da versão nova/);

  // Versão atual: as rotas novas não valem e o chefe volta ao Início.
  await p.evaluate(() => localStorage.removeItem('agilis:nova-interface'));
  await p.evaluate(() => { location.hash = '#/a-semana'; });
  await p.reload({ waitUntil: 'networkidle0' });
  await esperarHash(p, /#\/inicio/);
  assert.equal(await p.$('.abas-area'), null);
});

test('Celular: quatro abas inferiores, abas da área com rolagem própria e acessibilidade', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const m = await abrirNova(app, '#/a-semana', { celular: true, largura: 390, altura: 844 });
  await m.waitForSelector('.abas-movel a');
  assert.deepEqual(await m.$$eval('.abas-movel a', (as) => as.map((a) => a.dataset.rota)), ['a-hoje', 'a-acoes', 'a-semana', 'a-equipe']);
  assert.equal(await m.$eval('.abas-movel a[aria-current="page"]', (a) => a.dataset.rota), 'a-semana');
  assert.equal(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'a página não rola na horizontal');
  assert.deepEqual(await violacoes(m, axe), [], 'Semana no celular não tem violações de acessibilidade');
  await m.close();

  const p = await abrirNova(app, '#/a-equipe');
  await p.waitForSelector('.abas-area');
  assert.deepEqual(await violacoes(p, axe), [], 'Equipe não tem violações de acessibilidade');
  await pausa(100);
  assert.deepEqual(p.errosDaPagina, []);
});
