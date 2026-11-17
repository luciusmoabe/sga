// Exclusão de usuário: nunca com ações ou tarefas ligadas a ele (nem com qualquer outro histórico). Duas camadas:
//   1. a lista de vínculos (`REFERENCIAS_DE_USUARIO`) é comparada com o esquema: coluna de usuário nova que ficar de fora reprova;
//   2. cada forma de vínculo com ação ou tarefa é testada pela API, nas duas rotas que excluem (Diretor/Administrador e chefe).
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { createApp } from '../server/app.js';
import { LIMPEZA_NA_EXCLUSAO, REFERENCIAS_DE_USUARIO } from '../server/crud-cadastros.js';

const DIRETOR = 1, ANA_CPE = 3;
const CPE = 1;

test('toda coluna que aponta para um usuário é conferida na exclusão (ou limpa junto com a conta)', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  await seed(db);
  const tabelas = (await db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all()).map((x) => x.name);
  const colunas = [];
  for (const tabela of tabelas) {
    for (const c of await db.prepare(`pragma table_info(${tabela})`).all()) {
      if (tabela !== 'usuarios' && /(_por|usuario_id|responsavel_id)$/.test(c.name)) colunas.push(`${tabela}.${c.name}`);
    }
  }
  const cobertas = new Set([...REFERENCIAS_DE_USUARIO.map(([tab, col]) => `${tab}.${col}`), ...LIMPEZA_NA_EXCLUSAO]);
  const faltando = colunas.filter((c) => !cobertas.has(c));
  assert.deepEqual(faltando, [], `colunas de usuário que a exclusão não confere: ${faltando.join(', ')}. Acrescente em REFERENCIAS_DE_USUARIO (histórico) ou LIMPEZA_NA_EXCLUSAO (sai com a conta).`);
  // E o contrário: nenhuma entrada da lista aponta para uma coluna que não existe (erro de digitação).
  const existentes = new Set(colunas);
  const sobrando = [...cobertas].filter((c) => !existentes.has(c));
  assert.deepEqual(sobrando, [], `entradas da lista sem coluna correspondente no esquema: ${sobrando.join(', ')}`);
});

async function demo(t) {
  const db = openDb(':memory:');
  await seed(db);
  const novo = async (nome, perfil = 'membro', secao = CPE) => (await db.prepare('insert into usuarios (nome, email, perfil, secao_id) values (?, ?, ?, ?)')
    .run(nome, `${nome.toLowerCase().replace(/ /g, '.')}@exemplo.invalid`, perfil, secao)).lastInsertRowid;
  const server = createApp(db, { auth: { mode: 'demo' } }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise((ok) => server.close(ok)); await db.close(); });
  const call = async (uid, method, caminho, body) => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${caminho}`, {
      method, headers: { 'x-user-id': String(uid), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  };
  const acaoDoChefe = async (extra = {}) => (await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Ação do CPE', prazo: '2026-12-31', ...extra })).data.id;
  const existe = async (id) => !!(await db.prepare('select 1 as ok from usuarios where id = ?').get(id));
  /** Tenta excluir pelas duas rotas e confere que NENHUMA exclui. */
  const naoExclui = async (id, trecho) => {
    for (const [uid, caminho] of [[DIRETOR, `/usuarios/${id}`], [ANA_CPE, `/equipe/${id}`]]) {
      const r = await call(uid, 'DELETE', caminho);
      assert.equal(r.status, 409, `${caminho}: ${JSON.stringify(r.data)}`);
      assert.match(r.data.erro, trecho);
      assert.match(r.data.erro, /Desativar/);
      assert.equal(await existe(id), true, `${caminho} não pode apagar a conta`);
    }
  };
  return { db, call, novo, acaoDoChefe, existe, naoExclui };
}

test('não exclui quem é responsável por uma ação, aberta, concluída ou arquivada', async (t) => {
  const { db, novo, acaoDoChefe, naoExclui } = await demo(t);
  const aberta = await novo('Marta Lima');
  await acaoDoChefe({ responsavel_id: aberta });
  await naoExclui(aberta, /ações sob sua responsabilidade/);

  const concluida = await novo('Nuno Reis');
  const idC = await acaoDoChefe({ responsavel_id: concluida });
  await db.prepare("update acoes set status = 'concluida', concluida_em = '2026-09-18T10:00:00' where id = ?").run(idC);
  await naoExclui(concluida, /ações sob sua responsabilidade/);

  const arquivada = await novo('Olga Dias');
  const idA = await acaoDoChefe({ responsavel_id: arquivada });
  await db.prepare('update acoes set arquivada = 1 where id = ?').run(idA);
  await naoExclui(arquivada, /ações sob sua responsabilidade/);
});

test('não exclui quem criou uma ação, nem o chefe que atribuiu ações a outros', async (t) => {
  const { call, novo, naoExclui } = await demo(t);
  const autor = await novo('Paulo Reis');
  assert.equal((await call(autor, 'POST', '/acoes', { titulo: 'Ação do Paulo', prazo: '2026-12-31' })).status, 201);
  await naoExclui(autor, /ações criadas/);
  // O chefe tem ações criadas e atribuídas: o Diretor não o exclui.
  await call(ANA_CPE, 'POST', '/acoes', { titulo: 'Atribuída', prazo: '2026-12-31', responsavel_id: await novo('Rita Alves') });
  const r = await call(DIRETOR, 'DELETE', `/usuarios/${ANA_CPE}`);
  assert.equal(r.status, 409);
  assert.match(r.data.erro, /ações que atribuiu/);
});

test('não exclui quem tem tarefa: responsável, quem a criou ou quem a concluiu', async (t) => {
  const { db, call, novo, acaoDoChefe, naoExclui } = await demo(t);
  const acao = await acaoDoChefe();

  const responsavel = await novo('Marta Lima');
  assert.equal((await call(ANA_CPE, 'POST', `/acoes/${acao}/checklist`, { texto: 'Levantar dados', responsavel_id: responsavel })).status, 201);
  await naoExclui(responsavel, /tarefas sob sua responsabilidade/);

  const criador = await novo('Nuno Reis');
  await db.prepare("insert into acao_checklist (acao_id, texto, criado_em, criado_por) values (?, 'Tarefa criada por ele', '2026-09-18T09:00:00', ?)").run(acao, criador);
  await naoExclui(criador, /itens de checklist criados/);

  const conclusor = await novo('Olga Dias');
  await db.prepare("insert into acao_checklist (acao_id, texto, criado_em, concluido, concluido_por, concluido_em) values (?, 'Tarefa concluída por ele', '2026-09-18T09:00:00', 1, ?, '2026-09-18T11:00:00')").run(acao, conclusor);
  await naoExclui(conclusor, /itens de checklist concluídos/);
});

test('não exclui quem tem tempo, comentário, impedimento, ponto de atenção ou ciência numa ação', async (t) => {
  const { db, novo, acaoDoChefe, naoExclui } = await demo(t);
  const acao = await acaoDoChefe();
  const caso = async (nome, sql, trecho) => { const id = await novo(nome); await db.prepare(sql).run(acao, id); await naoExclui(id, trecho); };
  await caso('Tempo Souza', "insert into tempo (acao_id, usuario_id, minutos, data, criado_em) values (?, ?, 30, '2026-09-18', '2026-09-18T10:00:00')", /lançamentos de tempo/);
  await caso('Comenta Souza', "insert into acao_comentarios (acao_id, usuario_id, texto, criado_em) values (?, ?, 'oi', '2026-09-18T10:00:00')", /comentários/);
  await caso('Impede Souza', "insert into impedimentos (acao_id, descricao, criado_por, criado_em) values (?, 'trava', ?, '2026-09-18T10:00:00')", /impedimentos registrados/);
  await caso('Diario Souza', "insert into acao_diario (acao_id, texto, data, criado_em, criado_por) values (?, 'registro', '2026-09-18', '2026-09-18T10:00:00', ?)", /registros do diário de progresso/);
  await caso('Ponto Souza', "insert into pontos_atencao (acao_id, descricao, criado_por, criado_em) values (?, 'atenção', ?, '2026-09-18T10:00:00')", /pontos de atenção registrados/);
  await caso('Ativa Souza', "insert into pontos_atencao (acao_id, descricao, situacao_por, criado_em) values (?, 'atenção', ?, '2026-09-18T10:00:00')", /pontos de atenção ativados ou inativados/);
  await caso('Vista Souza', "insert into acao_vistas (acao_id, usuario_id, vista_em) values (?, ?, '2026-09-18T10:00:00')", /ciência de ações recebidas/);
});

test('quem nunca teve vínculo é excluído, e os lembretes enviados saem junto com a conta', async (t) => {
  const { db, call, novo, existe } = await demo(t);
  const livre = await novo('Livre Souza');
  await db.prepare("insert into lembretes_enviados (empresa_id, semana, tipo, usuario_id, modo, enviado_em) values (1, '2026-09-22', 'sexta', ?, 'app', '2026-09-18T15:00:00')").run(livre);
  assert.equal((await call(ANA_CPE, 'DELETE', `/equipe/${livre}`)).status, 200);
  assert.equal(await existe(livre), false);
  assert.equal((await db.prepare('select count(*) as n from lembretes_enviados where usuario_id = ?').get(livre)).n, 0);
  const outro = await novo('Outro Souza');
  assert.equal((await call(DIRETOR, 'DELETE', `/usuarios/${outro}`)).status, 200);
});
