// Tarefas na ficha da ação: a tarefa recém-criada, editada ou marcada continua com a caixa habilitada, sem reabrir a ficha. Antes, o servidor devolvia a tarefa
// sem a marca "pode marcar" e a tela a desenhava com a caixa desabilitada: não dava para concluir (nem desmarcar) até a ficha ser reaberta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_COF, subir } from './ajuda.js';

test('Ficha: adicionar, marcar, desmarcar e editar uma tarefa sem reabrir a ficha', async (t) => {
  const app = await subir(t); if (!app) return;
  const acao = (await app.api(CHEFE_COF, 'POST', '/acoes', { titulo: 'Ação com tarefas', prazo: '2026-12-31' })).dados.id;
  const p = await app.abrir(CHEFE_COF, `#/minhas-acoes?acao=${acao}`);
  await p.waitForSelector('dialog[open] [data-nova-tarefa] [data-texto-check]', { timeout: 10000 });

  // Adiciona duas tarefas pela própria ficha.
  for (const texto of ['Primeira tarefa', 'Segunda tarefa']) {
    await p.type('dialog[open] [data-nova-tarefa] [data-texto-check]', texto);
    await p.click('dialog[open] [data-add-check]');
    await p.waitForFunction((x) => [...document.querySelectorAll('dialog[open] .tarefa')].some((e) => e.innerText.includes(x)), {}, texto);
  }
  const caixas = () => p.$$eval('dialog[open] [data-marcar-check]', (cs) => cs.map((c) => ({ desabilitada: c.disabled, marcada: c.checked })));
  assert.deepEqual(await caixas(), [{ desabilitada: false, marcada: false }, { desabilitada: false, marcada: false }], 'as tarefas novas já podem ser marcadas');

  // Marca a primeira: ela continua habilitada, e dá para desmarcar.
  await p.click('dialog[open] [data-marcar-check]');
  await p.waitForFunction(() => document.querySelector('dialog[open] [data-marcar-check]')?.checked === true, { timeout: 5000 });
  assert.deepEqual((await caixas())[0], { desabilitada: false, marcada: true }, 'a tarefa marcada continua com a caixa habilitada');
  await p.waitForFunction(() => /1\/2 feitas/.test(document.querySelector('dialog[open] #acao-checklist-bloco')?.innerText || ''), { timeout: 5000 });
  await p.click('dialog[open] [data-marcar-check]');
  await p.waitForFunction(() => document.querySelector('dialog[open] [data-marcar-check]')?.checked === false, { timeout: 5000 });
  await p.waitForFunction(() => /0\/2 feitas/.test(document.querySelector('dialog[open] #acao-checklist-bloco')?.innerText || ''), { timeout: 5000 });

  // Editar o texto da tarefa também mantém a caixa habilitada.
  await p.click('dialog[open] [data-editar-check]');
  await p.waitForSelector('dialog[open] .tarefa-editando [data-texto-check]');
  await p.type('dialog[open] .tarefa-editando [data-texto-check]', ' (revisada)');
  await p.click('dialog[open] [data-salvar-check]');
  await p.waitForFunction(() => document.querySelector('dialog[open] #acao-checklist-bloco')?.innerText.includes('(revisada)'), { timeout: 5000 });
  assert.equal((await caixas()).every((c) => !c.desabilitada), true);
  assert.deepEqual((await app.api(CHEFE_COF, 'GET', `/acoes/${acao}`)).dados.checklist.map((c) => c.concluido), [false, false]);
  assert.deepEqual(p.errosDaPagina, []);
});
