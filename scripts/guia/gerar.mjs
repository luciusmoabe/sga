// Gera o Guia do Usuário em PDF (A4): `npm run guia` (ou `npm run guia -- --saida caminho/Guia.pdf`).
//
// O que faz, sem tocar em nenhum banco real:
//   1. sobe o sistema com os dados fictícios, num banco em memória, numa sexta-feira às 16h simuladas (a faixa de aviso e o
//      cartão "Sua semana" aparecem) e com chaves de teste dos avisos no celular (só para a tela "Avisos no celular");
//   2. captura as telas no Chrome (lista TELAS abaixo), recortando a barra lateral das telas de computador;
//   3. monta o HTML com o texto de `conteudo.mjs` e o estilo de `estilo.css` (margens de A4);
//   4. calcula a página de cada capítulo para o sumário (renderizando o documento por partes) e gera o PDF.
// Depois, `python scripts/verificar-margens-pdf.py <pdf>` confere as margens medindo o que foi impresso (opcional: pede PyMuPDF e Pillow).
//
// Requer o Chrome (CHROME_PATH aponta o executável; sem ele, procura nos lugares comuns).
process.env.SGC_NOW = '2026-09-18T16:00:00'; // sexta-feira, 16h (Bahia): depois do lembrete das 15h

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { openDb } from '../../server/db.js';
import { seed } from '../../server/seed.js';
import { createApp } from '../../server/app.js';
import { gerarChaves } from '../../server/push.js';
import { conteudo } from './conteudo.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '../..');
const argSaida = process.argv.indexOf('--saida');
const saida = path.resolve(argSaida > 0 ? process.argv[argSaida + 1] : path.join(raiz, 'docs/Guia-do-Usuario-Agilis.pdf'));
const trabalho = fs.mkdtempSync(path.join(os.tmpdir(), 'agilis-guia-'));
const dirImg = path.join(trabalho, 'img');
fs.mkdirSync(dirImg);

function acharChrome() {
  return [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .filter(Boolean).find((c) => fs.existsSync(c));
}
const chrome = acharChrome();
if (!chrome) { console.error('Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.'); process.exit(1); }

// ---------------------------------------------------------------- 1. o sistema, em memória
const chaves = gerarChaves();
process.env.SGC_VAPID_PUBLIC_KEY = chaves.publicKey;
process.env.SGC_VAPID_PRIVATE_KEY = chaves.privateKey;
process.env.SGC_VAPID_SUBJECT = 'mailto:guia@exemplo.invalid';
const db = openDb(':memory:');
await seed(db);
const servidor = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
await once(servidor, 'listening');
const BASE = `http://127.0.0.1:${servidor.address().port}`;
const api = async (uid, metodo, caminho, corpo) => {
  const r = await fetch(`${BASE}/api${caminho}`, { method: metodo, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, dados: await r.json().catch(() => null) };
};

// ---------------------------------------------------------------- 2. as telas
const DIRETOR = 1, CHEFE_COF = 4;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const clicarTexto = (p, sel, txt) => p.evaluate((s, t) => { const e = [...document.querySelectorAll(s)].find((x) => x.offsetParent !== null && x.textContent.trim().includes(t)); if (e) e.click(); return !!e; }, sel, txt);
const ficha = (await api(CHEFE_COF, 'GET', '/acoes')).dados.find((a) => a.status !== 'concluida');

/** Cada tela: [arquivo, usuário, rota, opções]. `recorte` (padrão sim) tira a barra lateral das telas de computador. */
const TELAS = [
  ['01-entrada', null, '', { recorte: false }],
  ['02-painel', DIRETOR, '#/painel', { recorte: false }],
  ['02b-painel-sem-menu', DIRETOR, '#/painel'],
  ['03-detalhe-secao', DIRETOR, '#/centro/2'],
  ['04-direcionar', DIRETOR, '#/direcionar'],
  ['05-acoes-agrupadas', DIRETOR, '#/acoes'],
  ['05b-acoes-expandida', DIRETOR, '#/acoes', { depois: (p) => p.evaluate(() => document.querySelector('[data-alternar-grupo]')?.click()) }],
  ['06-prazos', DIRETOR, '#/prazos'],
  ['07-combinados', DIRETOR, '#/combinados'],
  ['08-reunioes', DIRETOR, '#/reunioes'],
  ['09-produtividade', DIRETOR, '#/produtividade'],
  ['10-agenda', DIRETOR, '#/agenda'],
  ['11-avisos', DIRETOR, '#/avisos'],
  ['12-estrutura', DIRETOR, '#/estrutura'],
  ['20-chefe-inicio', CHEFE_COF, '#/inicio'],
  ['21-chefe-faixa', CHEFE_COF, '#/minhas-acoes'],
  ['22-chefe-atualizacao', CHEFE_COF, '#/atualizacao', { altura: 1000 }],
  ['23-chefe-equipe', CHEFE_COF, '#/equipe'],
  ['24-chefe-historico', CHEFE_COF, '#/historico'],
  ['25-chefe-agenda', CHEFE_COF, '#/agenda'],
  ['26-ficha-acao', CHEFE_COF, `#/acao/${ficha.id}`, { altura: 1100 }],
  ['27-pedir-prazo', CHEFE_COF, '#/minhas-acoes', { depois: (p) => clicarTexto(p, 'button', 'Pedir novo prazo') }],
  ['28-nova-acao', CHEFE_COF, '#/minhas-acoes', { depois: (p) => clicarTexto(p, 'button, a', 'Nova ação') }],
  ['29-avisos-celular', CHEFE_COF, '#/inicio', { permissoes: true, depois: (p) => p.click('#avisos-celular') }],
  ['30-cel-inicio', CHEFE_COF, '#/inicio', { largura: 390, altura: 844, celular: true, recorte: false }],
  ['31-cel-acoes', CHEFE_COF, '#/minhas-acoes', { largura: 390, altura: 844, celular: true, recorte: false }],
  ['40-reuniao-conferencia', DIRETOR, '#/reuniao'],
  // As duas da TV precisam de uma reunião em andamento: criada pouco antes (ver `reuniaoId`).
  ['41-reuniao-visao-geral', DIRETOR, () => `#/reuniao/${reuniaoId}`, { largura: 1920, altura: 1080, recorte: false }],
  ['42-reuniao-secao', DIRETOR, () => `#/reuniao/${reuniaoId}`, { largura: 1920, altura: 1080, recorte: false, depois: async (p) => { for (let i = 0; i < 3; i++) { await p.keyboard.press('ArrowRight'); await esperar(450); } } }],
];
let reuniaoId = null;
const LARGURA_LATERAL = 250; // px CSS da barra lateral

let navegador = null;
const abrirNavegador = async () => { navegador = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] }); };

async function capturar([nome, uid, rota, o = {}]) {
  const { largura = 1440, altura = 900, celular = false, recorte = true, permissoes = false, depois } = o;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      if (!navegador) await abrirNavegador();
      if (permissoes) await navegador.defaultBrowserContext().overridePermissions(BASE, ['notifications']);
      const p = await navegador.newPage();
      await p.setViewport({ width: largura, height: altura, deviceScaleFactor: celular ? 2 : 1.6, isMobile: celular, hasTouch: celular });
      if (uid) await p.evaluateOnNewDocument((u) => { try { localStorage.setItem('agilis-usuario', String(u)); } catch { /* segue */ } }, uid);
      await p.goto(`${BASE}/${typeof rota === 'function' ? rota() : rota}`, { waitUntil: 'networkidle0' });
      await esperar(1100);
      if (depois) { await depois(p); await esperar(700); }
      const arquivo = path.join(dirImg, `${nome}.png`);
      if (recorte && !celular) await p.screenshot({ path: arquivo, clip: { x: LARGURA_LATERAL, y: 0, width: largura - LARGURA_LATERAL, height: altura } });
      else await p.screenshot({ path: arquivo });
      await p.close();
      return;
    } catch (e) {
      console.log(`  (tentativa ${tentativa} de ${nome} falhou: ${String(e).slice(0, 70)})`);
      try { await navegador.close(); } catch { /* já fechado */ }
      navegador = null;
    }
  }
  throw new Error(`Não consegui capturar ${nome}.`);
}

console.log(`Capturando ${TELAS.length} telas…`);
for (const t of TELAS) {
  if (t[0] === '41-reuniao-visao-geral') {
    const r = await api(DIRETOR, 'POST', '/reunioes/iniciar', {});
    reuniaoId = r.dados?.id ?? r.dados?.reuniao?.id;
    if (!reuniaoId) throw new Error('Não consegui iniciar a reunião para as telas da TV.');
  }
  await capturar(t);
  process.stdout.write('.');
}
console.log(' ok');
try { await navegador.close(); } catch { /* ok */ }
servidor.close(); await db.close();

// ---------------------------------------------------------------- 3. o documento
const { corpo, caps } = conteudo('img');
const secoes = corpo.split(/(?=<section class="cap")/);
if (secoes.length !== caps.length) throw new Error('Os capítulos não bateram com as seções do HTML.');
const css = fs.readFileSync(path.join(aqui, 'estilo.css'), 'utf8');
fs.copyFileSync(path.join(raiz, 'public/imagens/logo-agilis.png'), path.join(dirImg, 'logo.png'));
const edicao = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

function html({ ate = caps.length, paginas = {} } = {}) {
  const toc = caps.map(([id, t], i) => `<li><a href="#${id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${t}</span><span class="pg">${paginas[id] ?? ''}</span></a></li>`).join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Guia do Usuário — Agilis</title><style>${css}</style><body>
<div class="capa"><div class="logo"><img src="img/logo.png" alt="Agilis"></div><div style="position:relative"><h1>Guia do Usuário</h1><div class="sub">Acompanhamento semanal dos Centros do Departamento de Planejamento, Orçamento e Gestão</div></div><div class="meta">Sistema Agilis<br>Para Chefes, Membros, Diretor, Apoio, Consulta e Administradores<br>Edição de ${edicao}</div></div>
<div class="sumario"><h1>Sumário</h1><ol>${toc}</ol><p class="obs">As imagens usam dados fictícios de demonstração. Para o detalhamento técnico das regras, consulte a Documentação do SGC.</p></div>
${secoes.slice(0, ate).join('\n')}</body></html>`;
}

await abrirNavegador();
const pagina = await navegador.newPage();
let n = 0;
async function renderizar(conteudoHtml, { rodape }) {
  const arquivo = path.join(trabalho, `doc${++n}.html`);
  fs.writeFileSync(arquivo, conteudoHtml);
  await pagina.goto(pathToFileURL(arquivo).href, { waitUntil: 'networkidle0' });
  return pagina.pdf({
    format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: rodape, // as margens vêm do @page
    headerTemplate: '<span></span>',
    footerTemplate: rodape ? '<div style="width:100%;font:8px Arial;color:#6b7f84;padding:0 20mm 0 25mm;display:flex;justify-content:space-between"><span>Agilis · Guia do Usuário</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>' : '<span></span>',
  });
}
const contarPaginas = (buf) => (Buffer.from(buf).toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

// Cada capítulo começa em página nova: a página dele é 1 + o total de páginas de tudo o que vem antes (capa, sumário e capítulos anteriores).
console.log('Calculando as páginas do sumário…');
const paginas = {};
for (let k = 0; k < caps.length; k++) {
  const antes = k === 0 ? 2 : contarPaginas(await renderizar(html({ ate: k }), { rodape: false }));
  paginas[caps[k][0]] = antes + 1;
}
const pdf = await renderizar(html({ paginas }), { rodape: true });
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, pdf);
await navegador.close();
fs.rmSync(trabalho, { recursive: true, force: true });
console.log(`Guia gerado: ${saida} (${contarPaginas(pdf)} páginas, ${Math.round(pdf.length / 1024)} KB)`);
console.log('Para conferir as margens: python scripts/verificar-margens-pdf.py "' + saida + '"');
process.exit(0);
