// Testes de API do SGC. Usam banco em memória e uma data fixa (sábado, 19/09/2026).
process.env.SGC_NOW = '2026-09-19T10:00:00';

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

const { openDb } = await import('../server/db.js');
const { seed } = await import('../server/seed.js');
const { createApp } = await import('../server/app.js');

const db = openDb(':memory:');
await seed(db);
const server = createApp(db, { auth: { mode: 'demo' } }).listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
test.after(async () => {
  await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await db.close();
});

const DIRETOR = 1;
const APOIO = 2;
const CHEFE = { CPE: 3, COF: 4, CGP: 5, CIG: 6, CCP: 7, CPR: 8, IND: 9 };
const SEMANA = '2026-09-22';

async function call(uid, method, path, body) {
  const r = await fetch(base + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(uid ? { 'x-user-id': String(uid) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

test('exige um usuário e lista os perfis de demonstração', async () => {
  assert.equal((await call(null, 'GET', '/bootstrap')).status, 401);
  const u = await call(null, 'GET', '/usuarios-demo');
  assert.equal(u.status, 200);
  assert.equal(u.data[0].perfil, 'diretor');
  assert.ok(u.data.some((x) => x.perfil === 'apoio'));
});

test('a semana da reunião é a terça seguinte ao sábado', async () => {
  const b = await call(DIRETOR, 'GET', '/bootstrap');
  assert.equal(b.data.semana, SEMANA);
  assert.equal(b.data.fechamento, '2026-09-21T18:00:00');
});

test('painel: semáforo por Centro segue as regras do plano', async () => {
  const p = await call(DIRETOR, 'GET', `/painel?semana=${SEMANA}`);
  const cor = Object.fromEntries(p.data.itens.map((i) => [i.secao.sigla, i.cor]));
  assert.deepEqual(cor, { CPE: 'amarelo', COF: 'vermelho', CGP: 'vermelho', CIG: 'verde', CCP: 'vermelho', CPR: 'amarelo' });
  const cgp = p.data.itens.find((i) => i.secao.sigla === 'CGP');
  assert.equal(cgp.atrasadas_internas, 1, 'ação interna atrasada de subseção conta no resumo');
  assert.equal((await call(DIRETOR, 'GET', '/painel?semana=2026-09-23')).status, 400);
});

test('privacidade: o Diretor não vê ações internas de subseções, o chefe do Centro vê', async () => {
  const dir = await call(DIRETOR, 'GET', '/acoes?situacao=abertas');
  assert.ok(dir.data.every((a) => !a.interna));
  const cgp = await call(CHEFE.CGP, 'GET', '/acoes');
  assert.ok(cgp.data.some((a) => a.interna), 'chefe vê a ação interna da subseção');
  assert.ok(cgp.data.every((a) => ['CGP', 'MAP'].includes(a.secao_sigla)), 'chefe não vê outras seções');
});

test('Diretor direciona a todos os Centros, com prazo obrigatório', async () => {
  const semPrazo = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'X', destino: 'todos' });
  assert.equal(semPrazo.status, 400);
  const passado = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'X', destino: 'todos', prazo: '2026-09-01' });
  assert.equal(passado.status, 400);
  const ok = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Enviar minuta do decreto', destino: 'todos', prazo: '2026-10-05', prioridade: 'alta' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.acoes_criadas, 6, 'uma ação por Centro e Coordenação ativos');
  const esp = await call(APOIO, 'POST', '/diretrizes', { titulo: 'Revisar norma', destino: 'especificos', secoes: [1, 3], prazo: '2026-10-06' });
  assert.equal(esp.data.acoes_criadas, 2);
  const sub = await call(DIRETOR, 'POST', '/diretrizes', { titulo: 'Y', destino: 'especificos', secoes: [7], prazo: '2026-10-06' });
  assert.equal(sub.status, 400, 'o Diretor direciona a Centros, não a subseções');
  assert.equal((await call(CHEFE.CPE, 'POST', '/diretrizes', { titulo: 'Z', destino: 'todos', prazo: '2026-10-06' })).status, 403);
});

test('concluir exige tempo em minutos; o tempo é somado em lançamentos', async () => {
  const acoes = await call(CHEFE.COF, 'GET', '/acoes');
  const nova = acoes.data.find((a) => a.titulo === 'Enviar minuta do decreto');
  assert.equal((await call(CHEFE.COF, 'PATCH', `/acoes/${nova.id}`, { status: 'concluida' })).status, 409, 'a_fazer não vai direto a concluída');
  assert.equal((await call(CHEFE.COF, 'PATCH', `/acoes/${nova.id}`, { status: 'em_andamento' })).status, 200);
  const sem = await call(CHEFE.COF, 'PATCH', `/acoes/${nova.id}`, { status: 'concluida' });
  assert.equal(sem.status, 422);
  assert.match(sem.data.erro, /tempo gasto/i);
  assert.equal((await call(CHEFE.COF, 'POST', `/acoes/${nova.id}/tempo`, { minutos: 0 })).status, 400);
  assert.equal((await call(CHEFE.COF, 'POST', `/acoes/${nova.id}/tempo`, { minutos: 12.5 })).status, 400);
  await call(CHEFE.COF, 'POST', `/acoes/${nova.id}/tempo`, { minutos: 30 });
  const t = await call(CHEFE.COF, 'POST', `/acoes/${nova.id}/tempo`, { minutos: 45, data: '2026-09-18' });
  assert.equal(t.data.tempo_total, 75);
  assert.equal((await call(CHEFE.COF, 'PATCH', `/acoes/${nova.id}`, { status: 'concluida' })).status, 200);
  assert.equal((await call(CHEFE.CIG, 'PATCH', `/acoes/${nova.id}`, { status: 'em_andamento' })).status, 404, 'outro Centro não vê a ação');
  assert.equal((await call(DIRETOR, 'PATCH', `/acoes/${nova.id}`, { status: 'em_andamento' })).status, 403);
  // O Diretor encerra; a ação sai da lista de abertas.
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${nova.id}/encerrar`)).status, 200);
  const enc = await call(DIRETOR, 'GET', '/acoes?situacao=encerradas');
  assert.ok(enc.data.some((a) => a.id === nova.id));
});

test('Diretor devolve uma ação concluída com comentário obrigatório', async () => {
  const c = (await call(DIRETOR, 'GET', '/acoes?situacao=concluidas')).data.find((a) => a.secao_sigla === 'CPE');
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${c.id}/devolver`, {})).status, 400);
  assert.equal((await call(DIRETOR, 'POST', `/acoes/${c.id}/devolver`, { comentario: 'Faltou o anexo de fontes.' })).status, 200);
  const d = await call(DIRETOR, 'GET', `/acoes/${c.id}`);
  assert.equal(d.data.status, 'em_andamento');
  assert.match(d.data.comentarios.at(-1).texto, /Faltou o anexo/);
});

test('pedido de novo prazo: chefe pede, Apoio só decide dentro da reunião, Diretor aprova', async () => {
  const ped = (await call(DIRETOR, 'GET', '/pedidos-prazo')).data;
  assert.equal(ped.length, 1);
  const p = ped[0];
  assert.equal((await call(APOIO, 'POST', `/pedidos-prazo/${p.id}/decidir`, { aprovar: true })).status, 403);
  assert.equal((await call(DIRETOR, 'POST', `/pedidos-prazo/${p.id}/decidir`, { aprovar: true })).status, 200);
  assert.equal((await call(DIRETOR, 'POST', `/pedidos-prazo/${p.id}/decidir`, { aprovar: true })).status, 409);
  const a = await call(CHEFE.CCP, 'GET', `/acoes/${p.acao_id}`);
  assert.equal(a.data.prazo, p.novo_prazo);
  assert.equal(a.data.prazo_original < a.data.prazo, true, 'o prazo original é preservado');
  assert.equal((await call(CHEFE.CCP, 'POST', `/acoes/${p.acao_id}/pedido-prazo`, { novo_prazo: '2026-09-01', justificativa: 'x' })).status, 400);
});

test('atualização semanal versiona correções e alimenta o painel', async () => {
  const antes = await call(CHEFE.COF, 'GET', `/atualizacao?semana=${SEMANA}`);
  assert.equal(antes.data.atual, null);
  assert.deepEqual(antes.data.anterior.proximo, ['Enviar a proposta de remanejamento ao Diretor']);
  assert.equal((await call(CHEFE.COF, 'PUT', '/atualizacao', { semana: SEMANA, feito: {}, proximo: [] })).status, 400);
  const v1 = await call(CHEFE.COF, 'PUT', '/atualizacao', {
    semana: SEMANA,
    feito: { previstos: [{ texto: 'Enviar a proposta de remanejamento ao Diretor', cumprido: true }], extras: [] },
    proximo: ['Ajustar a proposta'],
    impedimentos: ['Sistema lento'],
    critico: true,
    apoio: 'Preciso de acesso ao módulo de saldos.',
  });
  assert.equal(v1.data.versao, 1);
  const v2 = await call(CHEFE.COF, 'PUT', '/atualizacao', { semana: SEMANA, feito: { previstos: [], extras: ['Correção'] }, proximo: ['Ajustar'], impedimentos: [], critico: true });
  assert.equal(v2.data.versao, 2);
  assert.equal(v2.data.critico, false, 'sem impedimento não há impedimento crítico');
  const p = await call(DIRETOR, 'GET', `/painel?semana=${SEMANA}`);
  assert.equal(p.data.itens.find((i) => i.secao.sigla === 'COF').enviada, true);
  assert.equal((await call(DIRETOR, 'GET', `/painel?semana=${SEMANA}`)).data.resumo.pendentes, 2, 'CCP e CPR ainda pendentes');
});

test('estrutura: limite de níveis, chefe único por seção e desativação segura', async () => {
  const nivel4 = await call(DIRETOR, 'POST', '/secoes', { nome: 'Subnúcleo', tipo: 'subsecao', pai_id: 9 });
  assert.equal(nivel4.status, 400);
  assert.match(nivel4.data.erro, /3 níveis/);
  const nova = await call(DIRETOR, 'POST', '/secoes', { nome: 'Centro de Estudos', sigla: 'ces', tipo: 'centro' });
  assert.equal(nova.status, 201);
  assert.equal(nova.data.sigla, 'CES');
  const sub = await call(DIRETOR, 'POST', '/secoes', { nome: 'Núcleo Legal', tipo: 'subsecao', pai_id: nova.data.id });
  assert.equal(sub.data.nivel, 2);
  const semPai = await call(DIRETOR, 'POST', '/secoes', { nome: 'X', tipo: 'subsecao' });
  assert.equal(semPai.status, 400);
  assert.equal((await call(CHEFE.CPE, 'POST', '/secoes', { nome: 'X', tipo: 'centro' })).status, 403);
  // Reatribuir o chefe libera o anterior.
  await call(DIRETOR, 'PATCH', `/secoes/${nova.data.id}`, { chefe_id: CHEFE.CPR });
  const cpr = (await call(DIRETOR, 'GET', '/usuarios')).data.find((u) => u.id === CHEFE.CPR);
  assert.equal(cpr.secao_id, nova.data.id);
  // Desativar exige subseções desativadas e ações resolvidas.
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${nova.data.id}`, { ativa: false })).status, 409);
  await call(DIRETOR, 'PATCH', `/secoes/${sub.data.id}`, { ativa: false });
  assert.equal((await call(DIRETOR, 'PATCH', `/secoes/${nova.data.id}`, { ativa: false })).status, 200);
  const cig = await call(DIRETOR, 'PATCH', '/secoes/4', { ativa: false });
  assert.equal(cig.status, 409, 'Centro com ações abertas não desativa');
  assert.equal(cig.data.pode_reatribuir, false);
  const cgpSub = await call(DIRETOR, 'PATCH', '/secoes/3', { ativa: false });
  assert.equal(cgpSub.status, 409, 'Centro com subseção ativa não desativa');
  // Reordenar move o Centro para cima.
  await call(DIRETOR, 'PATCH', '/secoes/3', { mover: 'cima' });
  const lista = (await call(DIRETOR, 'GET', '/secoes')).data.filter((s) => !s.pai_id && s.ativa);
  assert.equal(lista[1].sigla, 'CGP');
});

test('combinados: cadastro completo, arquivamento em vez de exclusão e aviso de limite', async () => {
  assert.equal((await call(CHEFE.CPE, 'POST', '/combinados', { texto: 'X' })).status, 403);
  const leitura = await call(CHEFE.CPE, 'GET', '/combinados?todos=1&arquivados=1');
  assert.equal(leitura.data.itens.length, 5, 'chefe só lê os ativos');
  assert.equal((await call(DIRETOR, 'POST', '/combinados', { texto: '  ' })).status, 400);
  for (const t of ['Pontualidade: começamos às 10h.', 'Uma pessoa fala por vez.']) {
    assert.equal((await call(APOIO, 'POST', '/combinados', { texto: t })).status, 201);
  }
  const c8 = await call(DIRETOR, 'POST', '/combinados', { texto: 'Pautas curtas.' });
  assert.match(c8.data.aviso, /8 combinados ativos/);
  const id = c8.data.combinado.id;
  const edit = await call(DIRETOR, 'PATCH', `/combinados/${id}`, { texto: 'Pautas curtas e objetivas.' });
  assert.equal(edit.data.combinado.texto, 'Pautas curtas e objetivas.');
  await call(DIRETOR, 'PATCH', `/combinados/${id}`, { mover: 'cima' });
  const arq = await call(DIRETOR, 'PATCH', `/combinados/${id}`, { arquivado: true });
  assert.equal(arq.data.combinado.ativo, false);
  assert.equal(arq.data.aviso, null);
  const gestao = await call(DIRETOR, 'GET', '/combinados?arquivados=1');
  assert.ok(gestao.data.itens.some((c) => c.id === id && c.arquivado), 'arquivado continua no histórico');
  assert.equal((await call(DIRETOR, 'DELETE', `/combinados/${id}`)).status, 404, 'não há exclusão definitiva');
  assert.equal((await call(DIRETOR, 'PUT', '/config', { combinados_frequencia: 'nunca' })).status, 400);
});

let reuniaoId;
test('reunião: abre com os combinados vigentes e a ata guarda o que valia naquela data', async () => {
  assert.equal((await call(CHEFE.CPE, 'POST', '/reunioes/iniciar')).status, 403);
  const ini = await call(APOIO, 'POST', '/reunioes/iniciar');
  assert.equal(ini.status, 201);
  assert.equal(ini.data.mostrar_combinados, true);
  reuniaoId = ini.data.reuniao.id;
  const n = ini.data.reuniao.combinados_snapshot.length;
  assert.equal(n, 7);
  // Mudar depois de iniciada não altera a reunião em curso.
  await call(DIRETOR, 'POST', '/combinados', { texto: 'Novo combinado depois de iniciar.' });
  const r = await call(DIRETOR, 'GET', `/reunioes/${reuniaoId}`);
  assert.equal(r.data.combinados_snapshot.length, n);
  const deNovo = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  assert.equal(deNovo.data.retomada, true);
  assert.equal(deNovo.data.reuniao.id, reuniaoId);
});

test('reunião: cartões por necessidade, sem ações internas e com o pedido pendente', async () => {
  const c = await call(DIRETOR, 'GET', `/reunioes/${reuniaoId}/cartoes`);
  const cores = c.data.cartoes.map((x) => x.cor);
  assert.deepEqual([...cores].sort((a, b) => ['vermelho', 'amarelo', 'verde'].indexOf(a) - ['vermelho', 'amarelo', 'verde'].indexOf(b)), cores, 'vermelhos primeiro, verdes por último');
  const cgp = c.data.cartoes.find((x) => x.secao.sigla === 'CGP');
  assert.ok(cgp.acoes.every((a) => a.titulo !== 'Mapear o processo de solicitação de diárias'), 'ações internas não vão para a TV');
  assert.equal(cgp.atualizacao.critico, true);
});

test('reunião: decisões, nova ação ao vivo, prazo por delegação do Apoio e ata em rascunho', async () => {
  assert.equal((await call(APOIO, 'POST', `/reunioes/${reuniaoId}/decisoes`, { texto: '' })).status, 400);
  assert.equal((await call(APOIO, 'POST', `/reunioes/${reuniaoId}/decisoes`, { secao_id: 2, texto: 'Priorizar o remanejamento.' })).status, 201);
  assert.equal((await call(DIRETOR, 'POST', `/reunioes/${reuniaoId}/decisoes`, { texto: 'Enviar ofício aos parceiros.' })).status, 201);
  const nova = await call(APOIO, 'POST', `/reunioes/${reuniaoId}/acoes`, { titulo: 'Entregar o relatório de riscos', destino: 'especificos', secoes: [2], prazo: '2026-09-30', prioridade: 'alta' });
  assert.equal(nova.status, 201);
  const pedido = await call(DIRETOR, 'POST', '/pedidos-prazo/999/decidir', {});
  assert.equal(pedido.status, 404);
  // Novo pedido criado pelo chefe e decidido pelo Apoio na reunião (delegação).
  const a = (await call(CHEFE.CIG, 'GET', '/acoes')).data.find((x) => x.status === 'em_andamento');
  assert.equal((await call(CHEFE.CIG, 'POST', `/acoes/${a.id}/pedido-prazo`, { novo_prazo: '2026-10-20', justificativa: 'Depende da carga de agosto.' })).status, 201);
  const pend = (await call(DIRETOR, 'GET', '/pedidos-prazo')).data[0];
  assert.equal((await call(APOIO, 'POST', `/pedidos-prazo/${pend.id}/decidir`, { aprovar: false, reuniao_id: reuniaoId })).status, 200);
  const enc = await call(APOIO, 'POST', `/reunioes/${reuniaoId}/encerrar`);
  assert.equal(enc.data.status, 'rascunho');
  assert.match(enc.data.ata_texto, /Priorizar o remanejamento/);
  assert.match(enc.data.ata_texto, /\[COF\] Entregar o relatório de riscos — prazo 30\/09\/2026 — prioridade alta/);
  assert.match(enc.data.ata_texto, /recusado/);
  assert.match(enc.data.ata_texto, /Uma pessoa fala por vez/);
  assert.equal((await call(APOIO, 'POST', `/reunioes/${reuniaoId}/decisoes`, { texto: 'tarde demais' })).status, 409);
});

test('ata: revisão, envio e visibilidade para os chefes', async () => {
  assert.equal((await call(CHEFE.CPE, 'GET', '/reunioes')).data.every((r) => r.status === 'enviada'), true);
  assert.equal((await call(CHEFE.CPE, 'GET', `/reunioes/${reuniaoId}`)).status, 404, 'rascunho não aparece para chefes');
  assert.equal((await call(DIRETOR, 'PUT', `/reunioes/${reuniaoId}/ata`, { ata_texto: '' })).status, 400);
  assert.equal((await call(DIRETOR, 'PUT', `/reunioes/${reuniaoId}/ata`, { ata_texto: 'Ata revisada.' })).status, 200);
  assert.equal((await call(APOIO, 'POST', `/reunioes/${reuniaoId}/enviar-ata`)).data.status, 'enviada');
  const vista = await call(CHEFE.CPE, 'GET', `/reunioes/${reuniaoId}`);
  assert.equal(vista.data.ata_texto, 'Ata revisada.');
  assert.equal(vista.data.decisoes, undefined, 'chefe só recebe a ata, não os dados internos');
});

test('frequência dos combinados: só quando mudarem', async () => {
  assert.equal((await call(DIRETOR, 'PUT', '/config', { combinados_frequencia: 'quando_mudarem' })).data.combinados_frequencia, 'quando_mudarem');
  const sem = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  assert.equal(sem.data.mostrar_combinados, false, 'nada mudou desde a última reunião');
  await call(DIRETOR, 'POST', `/reunioes/${sem.data.reuniao.id}/encerrar`);
  await new Promise((r) => setTimeout(r, 5));
  process.env.SGC_NOW = '2026-09-19T11:00:00';
  const c = await call(DIRETOR, 'POST', '/combinados', { texto: 'Mudou a regra.' });
  assert.equal(c.status, 201);
  const com = await call(DIRETOR, 'POST', '/reunioes/iniciar');
  assert.equal(com.data.mostrar_combinados, true, 'houve mudança depois da última reunião');
});

test('chefe cria ação, altera prioridade, arquiva, desarquiva e exclui ação da própria seção', async () => {
  const c = await call(CHEFE.CPE, 'POST', '/acoes', {
    titulo: 'Organizar arquivos internos da seção',
    prazo: '2026-09-30',
    prioridade: 'baixa',
    detalhe: 'Apenas organização interna',
  });
  assert.equal(c.status, 201);
  assert.equal(c.data.prioridade, 'baixa');
  assert.equal(c.data.demandada_diretor, false);
  const id = c.data.id;

  // Altera prioridade
  const p = await call(CHEFE.CPE, 'PATCH', `/acoes/${id}`, { prioridade: 'alta' });
  assert.equal(p.status, 200);
  assert.equal(p.data.prioridade, 'alta');

  // Arquiva
  const arq = await call(CHEFE.CPE, 'POST', `/acoes/${id}/arquivar`);
  assert.equal(arq.status, 200);
  assert.equal(arq.data.arquivada, true);

  // Ação arquivada não aparece em abertas
  const ab = await call(CHEFE.CPE, 'GET', '/acoes?situacao=abertas');
  assert.ok(!ab.data.some((a) => a.id === id));

  // Aparece em arquivadas
  const arqList = await call(CHEFE.CPE, 'GET', '/acoes?situacao=arquivadas');
  assert.ok(arqList.data.some((a) => a.id === id));

  // Desarquiva
  const desarq = await call(CHEFE.CPE, 'POST', `/acoes/${id}/desarquivar`);
  assert.equal(desarq.status, 200);
  assert.equal(desarq.data.arquivada, false);

  // Exclui
  const del = await call(CHEFE.CPE, 'DELETE', `/acoes/${id}`);
  assert.equal(del.status, 200);
  const check = await call(CHEFE.CPE, 'GET', `/acoes/${id}`);
  assert.equal(check.status, 404);
});

test('ações demandadas pelo Diretor NÃO podem ser arquivadas nem excluídas (retorna 403)', async () => {
  // Ação 1 é uma diretriz do Diretor para a seção 1 (CPE)
  const a1 = await call(CHEFE.CPE, 'GET', '/acoes/1');
  assert.equal(a1.status, 200);
  assert.equal(a1.data.demandada_diretor, true);

  // Tentativa de arquivar
  const arq = await call(CHEFE.CPE, 'POST', '/acoes/1/arquivar');
  assert.equal(arq.status, 403);
  assert.match(arq.data.erro, /Diretor/);

  // Tentativa de excluir
  const del = await call(CHEFE.CPE, 'DELETE', '/acoes/1');
  assert.equal(del.status, 403);
  assert.match(del.data.erro, /Diretor/);
});
