// Minha equipe: o chefe exclui um membro sem histórico pela tela; com histórico a exclusão é recusada com a orientação de desativar.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_CPE, clicarTexto, esperarTexto, subir } from './ajuda.js';

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
// Só os membros: a chefe da subseção (Gabriela) também aparece na lista, sem o botão Excluir.
const linhas = (p) => p.$$eval('tr[data-id]', (trs) => trs.filter((tr) => tr.querySelector('[data-excluir]')).map((tr) => tr.querySelector('td b').textContent));

test('Chefe: exclui um membro sem histórico; com histórico a exclusão é recusada e o membro continua', async (t) => {
  const app = await subir(t); if (!app) return;
  const axe = fs.readFileSync(app.caminhoAxe, 'utf8');
  const ins = app.db.prepare('insert into usuarios (nome, email, perfil, secao_id) values (?, ?, ?, ?)');
  const limpo = (await ins.run('Marta Lima', 'marta@exemplo.invalid', 'membro', 1)).lastInsertRowid;
  const comHistorico = (await ins.run('Nuno Reis', 'nuno@exemplo.invalid', 'membro', 1)).lastInsertRowid;
  const r = await app.api(CHEFE_CPE, 'POST', '/acoes', { titulo: 'Ação do Nuno', prazo: '2026-12-31', responsavel_id: comHistorico });
  assert.equal(r.status, 201, JSON.stringify(r.dados));

  const p = await app.abrir(CHEFE_CPE, '#/equipe');
  await p.waitForSelector('tr[data-id]');
  assert.deepEqual((await linhas(p)).sort(), ['Marta Lima', 'Nuno Reis']);
  assert.ok(await p.$('tr[data-id] [data-excluir]'), 'há o botão Excluir');
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('tr[data-id]')].filter((tr) => tr.querySelector('td b').textContent === 'Gabriela Sena' && tr.querySelector('[data-excluir]')).length), 0, 'a chefe da subseção não tem Excluir');

  // Acessibilidade da tela com o botão novo.
  await p.evaluate(axe);
  const violacoes = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((v) => `${v.id}: ${v.nodes[0].target}`));
  assert.deepEqual(violacoes, [], 'Minha equipe sem violações de acessibilidade');

  // Quem não tem histórico: pede confirmação e some da lista.
  const excluir = async (nome) => p.evaluate((n) => [...document.querySelectorAll('tr[data-id]')].find((tr) => tr.querySelector('td b').textContent === n).querySelector('[data-excluir]').click(), nome);
  await excluir('Marta Lima');
  await esperarTexto(p, 'será excluído para sempre');
  await clicarTexto(p, 'dialog[open] button', 'Excluir membro');
  await p.waitForFunction(() => ![...document.querySelectorAll('tr[data-id] td b')].some((b) => b.textContent === 'Marta Lima'), { timeout: 8000 });
  assert.deepEqual(await linhas(p), ['Nuno Reis']);
  assert.equal(await app.db.prepare('select 1 as ok from usuarios where id = ?').get(limpo), undefined);

  // Quem tem histórico: o servidor recusa, a mensagem orienta a desativar e o membro continua.
  await excluir('Nuno Reis');
  await clicarTexto(p, 'dialog[open] button', 'Excluir membro');
  await esperarTexto(p, 'Use Desativar');
  await pausa(300);
  assert.deepEqual(await linhas(p), ['Nuno Reis']);
  assert.ok(await app.db.prepare('select 1 as ok from usuarios where id = ?').get(comHistorico));
  assert.deepEqual(p.errosDaPagina, []);
});
