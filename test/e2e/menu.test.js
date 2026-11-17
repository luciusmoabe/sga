// Menu lateral: grupos por assunto e recolhimento (só no computador), com o estado lembrado e acessível.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, DIRETOR, subir } from './ajuda.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const grupos = (p) => p.$$eval('.menu .grupo b', (bs) => bs.map((b) => b.textContent));
const largura = (p) => p.$eval('.lateral', (e) => Math.round(e.getBoundingClientRect().width));

test('menu: grupos por assunto para o Chefe e para o Diretor', async (t) => {
  const app = await subir(t); if (!app) return;
  const c = await app.abrir(CHEFE_COF, '#/inicio');
  assert.deepEqual(await grupos(c), ['Hoje', 'Meu trabalho', 'Acompanhamento', 'Reunião']);
  const itens = await c.$$eval('.menu a', (as) => as.map((a) => a.dataset.rota));
  assert.deepEqual(itens.slice(0, 6), ['inicio', 'gestao', 'agenda', 'minhas-acoes', 'diario', 'atualizacao']);
  const d = await app.abrir(DIRETOR, '#/painel');
  assert.deepEqual(await grupos(d), ['Acompanhamento', 'Ações', 'Reunião', 'Organização']);
  assert.equal(await d.$eval('.menu a:first-of-type', (a) => a.dataset.rota), 'reuniao', 'Iniciar reunião fica no topo, em destaque');
});

test('menu: recolhe e expande, lembra a escolha, continua navegável e passa no axe', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const p = await app.abrir(CHEFE_COF, '#/inicio');
  assert.equal(await largura(p), 245);
  assert.equal(await p.$eval('#menu-recolher', (b) => b.getAttribute('aria-expanded')), 'true');

  await p.click('#menu-recolher');
  await pausa(400);
  assert.ok(await largura(p) <= 70, 'a lateral encolheu para a coluna de ícones');
  assert.equal(await p.$eval('#menu-recolher', (b) => b.getAttribute('aria-expanded')), 'false');
  assert.equal(await p.$eval('#menu-recolher', (b) => b.getAttribute('aria-label')), 'Expandir menu');
  // O nome de cada link continua existindo para leitor de tela e aparece como dica ao passar o mouse.
  assert.equal(await p.$eval('.menu a[data-rota="agenda"]', (a) => a.title), 'Agenda');
  assert.match(await p.$eval('.menu a[data-rota="agenda"]', (a) => a.textContent), /Agenda/);

  await p.evaluate(axe);
  const violacoes = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
  assert.deepEqual(violacoes, [], 'menu recolhido sem violações de acessibilidade');

  await p.click('.menu a[data-rota="agenda"]'); // navegar pelos ícones continua funcionando
  await p.waitForSelector('#cal-grade');
  assert.ok(await largura(p) <= 70, 'continua recolhido depois de trocar de tela');

  await p.reload({ waitUntil: 'networkidle0' }); // lembra a escolha
  await pausa(300);
  assert.ok(await largura(p) <= 70, 'continua recolhido depois de recarregar');

  await p.click('#usuario-mini'); // o avatar expande o menu para dar acesso à conta
  await pausa(400);
  assert.equal(await largura(p), 245);
  assert.equal(await p.$eval('.menu a[data-rota="agenda"]', (a) => a.hasAttribute('title')), false);
  await p.reload({ waitUntil: 'networkidle0' });
  assert.equal(await largura(p), 245, 'a escolha "expandido" também é lembrada');
  assert.deepEqual(p.errosDaPagina, []);
});

test('menu: no celular não há botão de recolher', async (t) => {
  const app = await subir(t); if (!app) return;
  const p = await app.abrir(CHEFE_COF, '#/inicio', { largura: 390, altura: 844, celular: true });
  assert.equal(await p.$eval('#menu-recolher', (b) => getComputedStyle(b).display), 'none');
  assert.equal(await p.$eval('.menu', (e) => getComputedStyle(e.closest('.lateral')).display), 'none');
});

test('menu: o rótulo do perfil, no canto inferior esquerdo e na folha "Mais", mostra "Suplente de seção" para o suplente', async (t) => {
  const app = await subir(t); if (!app) return;
  await app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(41, 'Sílvia Duarte', 'silvia@exemplo.invalid', 'chefe', 1);
  const rotulo = (p) => p.$eval('.usuario-detalhe', (e) => e.innerText);

  const titular = await app.abrir(3, '#/inicio');
  assert.match(await rotulo(titular), /Chefe de seção/);
  assert.doesNotMatch(await rotulo(titular), /Suplente/);

  const suplente = await app.abrir(41, '#/inicio');
  const texto = await rotulo(suplente);
  assert.match(texto, /Sílvia Duarte/);
  assert.match(texto, /Suplente de seção/);
  assert.doesNotMatch(texto, /Chefe de seção/);
  assert.deepEqual(suplente.errosDaPagina, []);

  const cel = await app.abrir(41, '#/inicio', { largura: 390, altura: 844, celular: true });
  assert.match(await cel.$eval('.folha-conta', (e) => e.textContent), /Suplente de seção/);
});
