// Filtros da tela "Minhas ações" (public/js/filtro-acoes.js): busca, atalhos de atenção com contagem e ordenação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATALHOS, ORDENS, aplicarFiltros, contarAtalhos, normalizar, ordenar } from '../public/js/filtro-acoes.js';

const HOJE = '2026-11-16';
const ctx = { hoje: HOJE };
let n = 0;
const acao = (o = {}) => ({ id: ++n, titulo: `Ação ${n}`, detalhe: '', status: 'em_andamento', prazo: '2026-12-30', prioridade: 'media', criada_em: `2026-11-0${(n % 9) + 1}T10:00:00`,
  encerrada: false, arquivada: false, atrasada: false, parada: false, nova: false, pedido_pendente: false, impedimentos_abertos: 0, aguardando_validacao: null, responsavel_nome: null, secao_sigla: 'DSI', ...o });
const ids = (l) => l.map((a) => a.id);

test('normalizar ignora maiúsculas e acentos', () => {
  assert.equal(normalizar('Orçamento ÁGIL'), 'orcamento agil');
  assert.equal(normalizar(null), '');
});

test('busca: todas as palavras, em qualquer ordem, em título, detalhe, responsável e seção; sem acento', () => {
  const a = acao({ titulo: 'Consolidar a proposta de remanejamento orçamentário', detalhe: 'Saldos por programa', responsavel_nome: 'Maj PM Denilson', secao_sigla: 'CDA' });
  const b = acao({ titulo: 'Enviar o plano de trabalho' });
  const lista = [a, b];
  assert.deepEqual(ids(aplicarFiltros(lista, { q: 'orcamentario' }, ctx)), [a.id], 'sem acento');
  assert.deepEqual(ids(aplicarFiltros(lista, { q: 'proposta saldos' }, ctx)), [a.id], 'título + detalhe, qualquer ordem');
  assert.deepEqual(ids(aplicarFiltros(lista, { q: 'denilson' }, ctx)), [a.id], 'responsável');
  assert.deepEqual(ids(aplicarFiltros(lista, { q: 'cda' }, ctx)), [a.id], 'seção');
  assert.deepEqual(ids(aplicarFiltros(lista, { q: 'proposta plano' }, ctx)), [], 'todas as palavras precisam casar');
  assert.deepEqual(ids(aplicarFiltros(lista, { q: '   ' }, ctx)), [a.id, b.id], 'busca vazia não filtra');
});

test('atalhos: cada um acha o que promete, e vários juntos mostram a união', () => {
  const atrasada = acao({ atrasada: true, prazo: '2026-11-10' });
  const vence = acao({ prazo: '2026-11-20' });
  const venceHoje = acao({ prazo: HOJE });
  const longe = acao({ prazo: '2026-12-30' });
  const concluidaNoPrazo = acao({ status: 'concluida', prazo: '2026-11-18' });
  const parada = acao({ parada: true });
  const imp = acao({ impedimentos_abertos: 2 });
  const validar = acao({ status: 'concluida', aguardando_validacao: 'chefe' });
  const nova = acao({ nova: true });
  const pedido = acao({ pedido_pendente: true });
  const todas = [atrasada, vence, venceHoje, longe, concluidaNoPrazo, parada, imp, validar, nova, pedido];
  const com = (atalhos) => ids(aplicarFiltros(todas, { atalhos }, ctx));

  assert.deepEqual(com(['atrasadas']), [atrasada.id]);
  assert.deepEqual(com(['vencem']), [vence.id, venceHoje.id], 'de hoje a 7 dias, só em curso (a concluída fica de fora)');
  assert.deepEqual(com(['paradas']), [parada.id]);
  assert.deepEqual(com(['impedimento']), [imp.id]);
  assert.deepEqual(com(['validar']), [validar.id]);
  assert.deepEqual(com(['novas']), [nova.id]);
  assert.deepEqual(com(['pedido']), [pedido.id]);
  assert.deepEqual(com(['atrasadas', 'paradas']), [atrasada.id, parada.id], 'união');
  assert.deepEqual(com([]), ids(todas), 'nenhum atalho: sem filtro');
  assert.deepEqual(com(['inexistente']), ids(todas), 'atalho desconhecido é ignorado');
  assert.equal(ATALHOS.length, 7);
});

test('busca e atalhos combinam (E): o atalho só vale dentro do que a busca achou', () => {
  const a = acao({ titulo: 'Relatório de execução', atrasada: true });
  const b = acao({ titulo: 'Relatório de metas', atrasada: false });
  const c = acao({ titulo: 'Plano de trabalho', atrasada: true });
  assert.deepEqual(ids(aplicarFiltros([a, b, c], { q: 'relatorio', atalhos: ['atrasadas'] }, ctx)), [a.id]);
});

test('contagem dos atalhos respeita a busca, mas não os outros atalhos', () => {
  const a = acao({ titulo: 'Relatório de execução', atrasada: true, parada: true });
  const b = acao({ titulo: 'Relatório de metas', parada: true });
  const c = acao({ titulo: 'Plano de trabalho', atrasada: true });
  const todos = contarAtalhos([a, b, c], {}, ctx);
  assert.deepEqual([todos.atrasadas, todos.paradas, todos.novas], [2, 2, 0]);
  const comBusca = contarAtalhos([a, b, c], { q: 'relatorio' }, ctx);
  assert.deepEqual([comBusca.atrasadas, comBusca.paradas], [1, 2]);
  // Marcar um atalho não muda o número dos outros chips.
  assert.deepEqual(contarAtalhos([a, b, c], { q: '', atalhos: ['atrasadas'] }, ctx), todos);
});

test('ordenação: padrão mantém a ordem do servidor; as demais são estáveis e não alteram a lista original', () => {
  const x = acao({ prazo: '2026-12-05', prioridade: 'baixa', criada_em: '2026-11-01T10:00:00', movimentada_em: '2026-11-10T10:00:00' });
  const y = acao({ prazo: '2026-11-20', prioridade: 'media', criada_em: '2026-11-05T10:00:00', movimentada_em: '2026-11-02T10:00:00' });
  const z = acao({ prazo: '2026-11-20', prioridade: 'alta', criada_em: '2026-11-03T10:00:00', movimentada_em: '2026-11-15T10:00:00' });
  const lista = [x, y, z];
  assert.deepEqual(ids(ordenar(lista)), [x.id, y.id, z.id], 'padrão = ordem recebida');
  assert.deepEqual(ids(ordenar(lista, 'prazo')), [y.id, z.id, x.id], 'prazo, desempate pelo id');
  assert.deepEqual(ids(ordenar(lista, 'prioridade')), [z.id, y.id, x.id], 'alta, média, baixa');
  assert.deepEqual(ids(ordenar(lista, 'parada')), [y.id, x.id, z.id], 'quem está há mais tempo sem movimento primeiro');
  assert.deepEqual(ids(ordenar(lista, 'recentes')), [y.id, z.id, x.id], 'criadas por último primeiro');
  assert.deepEqual(ids(lista), [x.id, y.id, z.id], 'a lista original não muda');
  assert.deepEqual(ORDENS.map(([v]) => v), ['padrao', 'prazo', 'prioridade', 'parada', 'recentes']);
});
