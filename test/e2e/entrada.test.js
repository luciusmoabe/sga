// Telas de entrada no desenho novo: vitrine decorativa à esquerda e conteúdo à direita (login por e-mail e senha, lista de perfis da demonstração),
// com "Esqueceu a senha?", o olho da senha, o erro de credencial e o celular (só o formulário, com a marca no alto).
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { subir } from './ajuda.js';

const violacoes = (p, axe) => p.evaluate(async (js) => { eval(js); return (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); }, axe);
const semRolagemLateral = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

/** Abre a entrada como no órgão (e-mail e senha): a página pergunta o modo de acesso, e a resposta é trocada por "supabase". */
async function abrirLogin(app, { largura = 1440, altura = 900, celular = false } = {}) {
  const p = await app.navegador.newPage();
  p.errosDaPagina = [];
  p.on('pageerror', (e) => p.errosDaPagina.push(e.message));
  await p.setViewport({ width: largura, height: altura, isMobile: celular, hasTouch: celular });
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('/api/auth/config')) r.respond({ status: 200, contentType: 'application/json', body: '{"modo":"supabase"}' });
    else if (u.endsWith('/api/auth/entrar')) r.respond({ status: 401, contentType: 'application/json', body: '{"erro":"E-mail ou senha incorretos."}' });
    else r.continue();
  });
  await p.goto(`${app.base}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('#login-senha', { timeout: 10000 });
  return p;
}

test('Login: vitrine à esquerda, formulário à direita, olho da senha, "Esqueceu a senha?" e erro de credencial', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const p = await abrirLogin(app);
  const g = await p.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; };
    return { vitrine: r('.entrada-vitrine'), painel: r('.entrada-painel'), logoMovel: getComputedStyle(document.querySelector('.entrada-logo-movel')).display };
  });
  assert.ok(g.vitrine[2] > 400, 'a vitrine aparece em tela larga');
  assert.ok(g.vitrine[1] <= g.painel[0] + 2, 'a vitrine fica à esquerda do painel');
  assert.equal(g.logoMovel, 'none', 'a marca do alto só vale no celular');
  assert.equal(await p.$eval('h1', (h) => h.textContent), 'Acessar o sistema');
  assert.equal(await p.$eval('.entrada-tag', (e) => e.textContent), 'Bem-vindo de volta');
  assert.equal(await p.$eval('.entrada-vitrine', (e) => e.getAttribute('aria-hidden')), 'true', 'a vitrine é só enfeite');
  assert.match(await p.$eval('.vitrine-base', (e) => e.innerText), /Reunião com foco/);
  assert.equal(await semRolagemLateral(p), true);
  assert.deepEqual(await violacoes(p, axe), [], 'a tela de login não tem violações de acessibilidade');

  // Olho da senha.
  assert.equal(await p.$eval('#login-password', (e) => e.type), 'password');
  await p.click('#mostrar-senha');
  assert.equal(await p.$eval('#login-password', (e) => e.type), 'text');
  assert.equal(await p.$eval('#mostrar-senha', (e) => e.getAttribute('aria-pressed')), 'true');
  await p.click('#mostrar-senha');
  assert.equal(await p.$eval('#login-password', (e) => e.type), 'password');

  // "Esqueceu a senha?" mostra e esconde a orientação.
  assert.equal(await p.$eval('#esqueceu-ajuda', (e) => e.hidden), true);
  await p.click('#esqueceu-senha');
  assert.equal(await p.$eval('#esqueceu-ajuda', (e) => e.hidden), false);
  assert.equal(await p.$eval('#esqueceu-senha', (e) => e.getAttribute('aria-expanded')), 'true');
  assert.match(await p.$eval('#esqueceu-ajuda', (e) => e.innerText), /quem administra o Agilis/);
  assert.deepEqual(await violacoes(p, axe), [], 'com a orientação aberta também passa no axe');
  await p.click('#esqueceu-senha');
  assert.equal(await p.$eval('#esqueceu-ajuda', (e) => e.hidden), true);

  // Credencial recusada: mostra o erro, limpa a senha e o botão volta a dizer "Entrar".
  await p.type('#login-email', 'alguem@orgao.gov.br');
  await p.type('#login-password', 'senha-errada');
  await p.click('.btn-entrar');
  await p.waitForFunction(() => document.querySelector('#login-erro')?.textContent.includes('incorretos'), { timeout: 8000 });
  assert.equal(await p.$eval('#login-password', (e) => e.value), '');
  assert.equal(await p.$eval('.btn-entrar span', (e) => e.textContent), 'Entrar');
  assert.equal(await p.$eval('.btn-entrar', (e) => e.disabled), false);
  assert.ok(await p.$('.btn-entrar svg'), 'o ícone da chave continua no botão');
  assert.deepEqual(p.errosDaPagina, []);
});

test('Login no celular: só o formulário, com a marca no alto e sem rolagem lateral', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const p = await abrirLogin(app, { largura: 390, altura: 844, celular: true });
  assert.equal(await p.$eval('.entrada-vitrine', (e) => getComputedStyle(e).display), 'none');
  assert.equal(await p.$eval('.entrada-logo-movel', (e) => getComputedStyle(e).display), 'block');
  assert.equal(await semRolagemLateral(p), true);
  const alvos = await p.$$eval('#login-email, #login-password, .btn-entrar, #mostrar-senha, #esqueceu-senha', (es) => es.map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.ok(alvos.every((h) => h >= 44), `alvos de toque de 44 px ou mais (${alvos})`);
  assert.deepEqual(await violacoes(p, axe), []);
});

test('Demonstração: a lista de perfis aparece na mesma moldura, com a vitrine em tela larga', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const p = await app.navegador.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(`${app.base}/`, { waitUntil: 'networkidle0' });
  await p.waitForSelector('.perfil', { timeout: 10000 });
  assert.ok((await p.$$('.perfil')).length >= 5);
  assert.ok(await p.$eval('.entrada-vitrine', (e) => e.getBoundingClientRect().width) > 400);
  assert.equal(await p.$eval('h1', (h) => h.textContent), 'Bem-vindo ao Agilis');
  assert.deepEqual(await violacoes(p, axe), [], 'a entrada da demonstração não tem violações de acessibilidade');
  // Escolher um perfil continua entrando.
  await p.evaluate(() => document.querySelector('.perfil').click());
  await p.waitForSelector('.menu a', { timeout: 10000 });
});
