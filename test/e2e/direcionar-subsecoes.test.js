// Jornada: o chefe direciona uma ação às subseções pela tela "Direcionar ação"; a subseção a recebe como nova, conclui, e o chefe
// que demandou aceita em "Aguardando sua validação". O chefe sem subseções não vê o menu.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, CHEFE_CPE, clicarTexto, esperarTexto, subir } from './ajuda.js';

const GABRIELA_IND = 9;
const TITULO = 'Levantar as séries históricas de indicadores';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (p) => p.evaluate(() => document.querySelector('#conteudo').innerText);

test('Chefe: direciona às subseções, a subseção conclui e quem demandou aceita', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');

  // Só quem tem subseções vê o item de menu; quem não tem é levado de volta ao início se abrir o endereço.
  const sem = await app.abrir(CHEFE_COF, '#/inicio');
  assert.equal(await sem.$('.menu a[data-rota="direcionar"]'), null);
  await sem.goto(`${app.base}/#/direcionar`, { waitUntil: 'networkidle0' });
  await pausa(300);
  assert.match(await sem.evaluate(() => location.hash), /#\/inicio/);

  const p = await app.abrir(CHEFE_CPE, '#/inicio');
  await p.waitForSelector('.menu a[data-rota="direcionar"]');
  await p.click('.menu a[data-rota="direcionar"]');
  await p.waitForSelector('#form-dir');
  assert.match(await texto(p), /Todas as Subseções/);
  assert.match(await texto(p), /volta a você para aceite/);

  // Acessibilidade da tela nova.
  await p.evaluate(axe);
  const violacoes = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
  assert.deepEqual(violacoes, [], 'Direcionar ação (chefe) sem violações de acessibilidade');

  // Escolher subseções mostra as da árvore dele (IND e PNL), nunca outro Centro.
  await p.evaluate(() => document.querySelector('input[name=destino][value=especificos]').click());
  const alvos = await p.$$eval('#alvos input[name=secao]', (is) => is.map((i) => i.parentElement.textContent.trim()));
  assert.deepEqual(alvos.sort(), ['IND', 'PNL']);
  await p.evaluate(() => document.querySelector('input[name=destino][value=todos]').click());

  await p.type('#d-titulo', TITULO);
  await p.click('#form-dir button[type="submit"]');
  const aviso = await p.waitForFunction(() => [...document.querySelectorAll('dialog[open] button')].find((b) => /Direcionar mesmo assim/.test(b.textContent)) || null, { timeout: 2500 }).catch(() => null);
  if (aviso) await clicarTexto(p, 'dialog[open] button', 'Direcionar mesmo assim');
  await esperarTexto(p, TITULO);
  const lista = await texto(p);
  assert.match(lista, /Últimas ações direcionadas/);
  assert.match(lista, /IND ainda não viu/);

  const acoes = (await app.api(CHEFE_CPE, 'GET', '/acoes?q=Levantar%20as%20s')).dados;
  assert.equal(acoes.length, 1);
  const id = acoes[0].id;
  assert.equal(acoes[0].secao_id, 7);
  assert.equal(acoes[0].demandada_chefe, true);

  // A subseção a recebe como nova, com a origem.
  const g = await app.abrir(GABRIELA_IND, '#/inicio');
  await g.waitForSelector('.novas-quadro');
  const inicio = await texto(g);
  assert.ok(inicio.includes(TITULO));
  assert.match(inicio, /CPE/);

  // A subseção conclui; quem demandou aceita no Início, em "Aguardando sua validação".
  assert.equal((await app.api(GABRIELA_IND, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
  assert.equal((await app.api(GABRIELA_IND, 'POST', `/acoes/${id}/tempo`, { minutos: 45 })).status, 201);
  assert.equal((await app.api(GABRIELA_IND, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);

  const a = await app.abrir(CHEFE_CPE, '#/inicio');
  await a.waitForSelector('.validar-quadro');
  assert.match(await texto(a), /Aguardando sua validação/);
  assert.ok((await texto(a)).includes(TITULO));
  await clicarTexto(a, '.validar-quadro button', 'Aceitar e encerrar');
  await a.waitForFunction(() => !document.querySelector('.validar-quadro'), { timeout: 8000 });
  assert.equal((await app.api(CHEFE_CPE, 'GET', `/acoes/${id}`)).dados.encerrada, true);
  assert.deepEqual(a.errosDaPagina, []);
  assert.deepEqual(p.errosDaPagina, []);
});
