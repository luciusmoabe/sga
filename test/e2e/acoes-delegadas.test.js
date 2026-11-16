// A ação da seção-mãe atribuída a alguém da subseção aparece para o responsável nas telas dele: Minhas ações (aba "Minhas"),
// Início ("Chegaram para você") e Agenda ("Só o que é meu").
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEFE_CPE, subir } from './ajuda.js';

const GABRIELA_IND = 9, MARINA = 31;
const TITULO = 'Lançar o aplicativo de atendimento';
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const texto = (p) => p.evaluate(() => document.querySelector('#conteudo').innerText);

test('responsável de uma subseção vê a ação delegada pela seção-mãe em Minhas ações, no Início e na Agenda', async (t) => {
  const app = await subir(t); if (!app) return;
  await app.db.prepare('insert into usuarios (id, nome, email, perfil, secao_id) values (?,?,?,?,?)').run(MARINA, 'Marina Costa', 'marina@exemplo.invalid', 'membro', 7);
  for (const resp of [MARINA, GABRIELA_IND]) {
    const r = await app.api(CHEFE_CPE, 'POST', '/acoes', { titulo: `${TITULO} (${resp})`, prazo: '2026-09-30', prioridade: 'alta', responsavel_id: resp });
    assert.equal(r.status, 201, JSON.stringify(r.dados));
  }

  // Membro da subseção: aba "Minhas".
  const m = await app.abrir(MARINA, '#/minhas-acoes');
  await m.waitForSelector('.cartao.acao');
  assert.ok((await texto(m)).includes(`${TITULO} (${MARINA})`), 'a ação dela aparece');
  assert.ok(!(await texto(m)).includes(`${TITULO} (${GABRIELA_IND})`), 'só a dela');
  await m.goto(`${app.base}/#/agenda`, { waitUntil: 'networkidle0' });
  await pausa(400);
  assert.deepEqual(m.errosDaPagina, []);

  // Chefe da subseção: Início (nova, com a sigla da seção de origem) e Minhas ações.
  const c = await app.abrir(GABRIELA_IND, '#/inicio');
  await c.waitForSelector('.novas-quadro');
  const inicio = await texto(c);
  assert.ok(inicio.includes(`${TITULO} (${GABRIELA_IND})`));
  assert.match(inicio, /CPE/, 'o quadro mostra de qual seção a ação veio');
  await c.goto(`${app.base}/#/minhas-acoes`, { waitUntil: 'networkidle0' });
  await c.waitForSelector('.cartao.acao');
  assert.ok((await texto(c)).includes(`${TITULO} (${GABRIELA_IND})`));
  assert.deepEqual(c.errosDaPagina, []);
});
