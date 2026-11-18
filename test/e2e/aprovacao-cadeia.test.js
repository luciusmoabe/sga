// Aprovação em cadeia pela tela: a demanda do Diretor concluída por um membro da subseção aparece, na vez de cada chefe, em "Aguardando sua validação"
// (primeiro a chefe da subseção, depois a do Centro), e o Diretor só vê o aceite depois das duas aprovações.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRETOR, CHEFE_CPE, subir } from './ajuda.js';

const GABRIELA_IND = 9, TEO = 51;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const violacoes = (p, axe, raiz = 'document') => p.evaluate(async (js, r) => { eval(js); return (await window.axe.run(r === 'document' ? document : document.querySelector(r), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`); }, axe, raiz);

test('Cada chefe aprova na sua vez; o Diretor só aceita depois', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  await app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(TEO, 'Teo Alves', 'teo@exemplo.invalid', 'membro', 7);
  const dir = (await app.api(DIRETOR, 'POST', '/diretrizes', { titulo: 'Levantar os indicadores do trimestre', prazo: '2026-12-31', destino: 'especificos', secoes: [1] })).dados;
  const id = (await app.db.prepare('select id from acoes where diretriz_id = ? and secao_id = 1').get(dir.id)).id;
  assert.equal((await app.api(CHEFE_CPE, 'PATCH', `/acoes/${id}`, { responsavel_id: TEO })).status, 200);
  assert.equal((await app.api(TEO, 'PATCH', `/acoes/${id}`, { status: 'em_andamento' })).status, 200);
  assert.equal((await app.api(TEO, 'POST', `/acoes/${id}/tempo`, { minutos: 30 })).status, 201);
  assert.equal((await app.api(TEO, 'PATCH', `/acoes/${id}`, { status: 'concluida' })).status, 200);

  // Primeiro, a chefe da subseção (Gabriela): vê a ação no quadro, com o botão Aprovar.
  const g = await app.abrir(GABRIELA_IND, '#/inicio');
  await g.waitForSelector('#validar-titulo', { timeout: 10000 });
  const quadro = await g.$eval('[data-validar-item]', (e) => e.innerText);
  assert.match(quadro, /Levantar os indicadores do trimestre/);
  assert.match(quadro, /Aprovar/);
  assert.deepEqual(await violacoes(g, axe, '[aria-labelledby="validar-titulo"]'), [], 'o quadro não tem violações de acessibilidade');
  await g.click('[data-validar-q]');
  await g.waitForFunction(() => !document.querySelector('#validar-titulo'), { timeout: 10000 });
  assert.equal((await app.api(DIRETOR, 'GET', `/acoes/${id}`)).dados.aguardando_validacao, 'chefe', 'ainda falta a chefe do Centro');

  // Depois, a chefe do Centro (Ana): o quadro dela mostra a ação, e a ficha explica a etapa.
  const a = await app.abrir(CHEFE_CPE, '#/inicio');
  await a.waitForSelector('#validar-titulo', { timeout: 10000 });
  await a.click('[data-abrir-q]');
  await a.waitForSelector('dialog[open] .aviso-validacao', { timeout: 10000 });
  const aviso = await a.$eval('dialog[open] .aviso-validacao', (e) => e.innerText);
  assert.match(aviso, /Aguardando a aprovação do chefe de Centro de Planejamento Estratégico/);
  assert.match(aviso, /Etapa 2 de 2/);
  assert.ok(await a.$('dialog[open] [data-validar]'), 'é a vez dela: o botão aparece');
  await a.click('dialog[open] [data-validar]');
  await pausa(800);
  assert.equal((await app.api(DIRETOR, 'GET', `/acoes/${id}`)).dados.aguardando_validacao, 'diretor');

  // O Diretor vê o aceite dele, agora.
  const d = await app.abrir(DIRETOR, `#/acoes?acao=${id}`);
  await d.waitForSelector('dialog[open] .aviso-validacao', { timeout: 10000 });
  assert.match(await d.$eval('dialog[open] .aviso-validacao', (e) => e.innerText), /Aguardando o aceite/);
  assert.ok(await d.$('dialog[open] [data-encerrar]'));
  assert.deepEqual(a.errosDaPagina, []);
  assert.deepEqual(g.errosDaPagina, []);
});
