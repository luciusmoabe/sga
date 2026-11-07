// Apoio dos testes de ponta a ponta (`npm run test:e2e`): sobe a aplicação com dados fictícios num banco em memória e abre
// um Chrome de verdade. Não faz parte de `npm test`, porque precisa do Chrome instalado.
//   - CHROME_PATH aponta o executável; sem ela, procura nos lugares comuns (Windows, macOS, Linux).
//   - Sem Chrome o teste é PULADO, a não ser com CI=true (no CI a falta do Chrome é erro, para não passar em branco).
process.env.SGC_NOW = '2026-09-22T09:30:00'; // terça-feira, 9h30 (Bahia), meia hora antes da reunião

import fs from 'node:fs';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { openDb } from '../../server/db.js';
import { seed } from '../../server/seed.js';
import { createApp } from '../../server/app.js';

const exigir = createRequire(import.meta.url);

export const DIRETOR = 1, CHEFE_CPE = 3, CHEFE_COF = 4;

export function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

/** Sobe a aplicação e o navegador. Devolve { base, db, api, abrir } e encerra tudo no fim do teste `t`. */
export async function subir(t) {
  const chrome = acharChrome();
  if (!chrome) {
    if (process.env.CI) throw new Error('Chrome não encontrado no CI: instale-o ou defina CHROME_PATH.');
    t.skip('Chrome não encontrado (defina CHROME_PATH para rodar os testes de ponta a ponta).');
    return null;
  }
  const db = openDb(':memory:');
  await seed(db);
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  t.after(async () => { await browser.close(); await new Promise((ok) => server.close(ok)); await db.close(); });

  /** Chama a API como o usuário `uid` (para preparar e conferir dados, sem passar pela tela). */
  const api = async (uid, metodo, caminho, corpo) => {
    const r = await fetch(`${base}/api${caminho}`, {
      method: metodo, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return { status: r.status, dados: await r.json().catch(() => null) };
  };

  /** Abre uma página já "logada" como `uid`, em `rota` (ex.: '#/painel'). */
  const abrir = async (uid, rota, { largura = 1440, altura = 900, celular = false } = {}) => {
    const p = await browser.newPage();
    p.errosDaPagina = [];
    p.on('pageerror', (e) => p.errosDaPagina.push(e.message));
    p.setDefaultTimeout(15000);
    await p.setViewport({ width: largura, height: altura, isMobile: celular, hasTouch: celular });
    await p.evaluateOnNewDocument((u) => { try { localStorage.setItem('agilis-usuario', String(u)); } catch { /* segue */ } }, uid);
    await p.goto(`${base}/${rota}`, { waitUntil: 'networkidle0' });
    return p;
  };
  return { base, db, api, abrir, caminhoAxe: exigir.resolve('axe-core/axe.min.js') };
}

/** Clica no primeiro elemento visível de `seletor` cujo texto contém `texto`. Falha com mensagem clara se não achar. */
export async function clicarTexto(p, seletor, texto) {
  await p.waitForFunction((sel, txt) => [...document.querySelectorAll(sel)].some((e) => e.offsetParent !== null && e.textContent.includes(txt)), {}, seletor, texto);
  await p.evaluate((sel, txt) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && e.textContent.includes(txt)).click(), seletor, texto);
}

/** Espera o texto aparecer em qualquer parte visível da página. */
export const esperarTexto = (p, texto) => p.waitForFunction((txt) => document.body.innerText.includes(txt), {}, texto);
