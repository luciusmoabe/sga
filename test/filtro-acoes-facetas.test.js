// Filtros de "Minhas ações", segunda etapa (public/js/filtro-acoes.js): Responsável, Origem, Seção, Prazo, Status e Prioridade,
// cada opção com a contagem considerando os OUTROS filtros.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FACETAS, FILTRO_VAZIO, aplicarFiltros, contarAtalhos, contarAtivos, diaEData, opcoesDe } from '../public/js/filtro-acoes.js';

const HOJE = '2026-11-16';
const EU = 3, MINHA_SECAO = 1;
const ctx = { hoje: HOJE, usuarioId: EU, secaoId: MINHA_SECAO, semana: '2026-11-23', semanaEquipe: '2026-11-17', rotuloDiretor: 'Demandadas pelo Superintendente' };
let n = 0;
const acao = (o = {}) => ({ id: ++n, titulo: `Ação ${n}`, detalhe: '', status: 'em_andamento', prazo: '2026-12-30', prioridade: 'media', secao_id: MINHA_SECAO, secao_sigla: 'DSI',
  responsavel_id: null, responsavel_nome: null, criado_por: 99, demandada_diretor: false, demandada_chefe: false, demandante_externo: null, interna: false,
  encerrada: false, arquivada: false, atrasada: false, parada: false, nova: false, pedido_pendente: false, impedimentos_abertos: 0, aguardando_validacao: null, ...o });
const ids = (l) => l.map((a) => a.id);
const com = (lista, filtro) => ids(aplicarFiltros(lista, filtro, ctx));

test('responsável: comigo, sem responsável ou uma pessoa', () => {
  const minha = acao({ responsavel_id: EU, responsavel_nome: 'Eu' });
  const dela = acao({ responsavel_id: 77, responsavel_nome: 'Cap PM Alan' });
  const dele = acao({ responsavel_id: 78, responsavel_nome: 'Maj PM Denilson' });
  const ninguem = acao();
  const todas = [minha, dela, dele, ninguem];
  assert.deepEqual(com(todas, { responsavel: 'eu' }), [minha.id]);
  assert.deepEqual(com(todas, { responsavel: 'sem' }), [ninguem.id]);
  assert.deepEqual(com(todas, { responsavel: 'id:77' }), [dela.id]);
  const o = opcoesDe(todas, 'responsavel', FILTRO_VAZIO(), ctx);
  assert.deepEqual(o.map((x) => [x.valor, x.rotulo, x.n]), [['eu', 'Comigo', 1], ['sem', 'Sem responsável', 1], ['id:77', 'Cap PM Alan', 1], ['id:78', 'Maj PM Denilson', 1]], 'pessoas em ordem alfabética, sem repetir "eu"');
});

test('origem: Diretor, entidade externa, chefe acima, direcionadas por mim, internas e criadas por mim', () => {
  const diretor = acao({ demandada_diretor: true });
  const externa = acao({ demandante_externo: 'TCE' });
  const deCima = acao({ demandada_chefe: true, demandado_por_secao_id: 50 });
  const minhaDemanda = acao({ demandada_chefe: true, demandado_por_secao_id: MINHA_SECAO, secao_id: 7 });
  const interna = acao({ interna: true });
  const criada = acao({ criado_por: EU });
  const todas = [diretor, externa, deCima, minhaDemanda, interna, criada];
  assert.deepEqual(com(todas, { origem: 'diretor' }), [diretor.id]);
  assert.deepEqual(com(todas, { origem: 'externa' }), [externa.id]);
  assert.deepEqual(com(todas, { origem: 'chefe' }), [deCima.id], 'a que EU direcionei não é "do chefe acima"');
  assert.deepEqual(com(todas, { origem: 'minhas_demandas' }), [minhaDemanda.id]);
  assert.deepEqual(com(todas, { origem: 'interna' }), [interna.id]);
  assert.deepEqual(com(todas, { origem: 'criadas' }), [criada.id]);
  assert.equal(opcoesDe(todas, 'origem', FILTRO_VAZIO(), ctx)[0].rotulo, 'Demandadas pelo Superintendente', 'o nome do topo vem da empresa');
});

test('seção: só existe como filtro quando há mais de uma', () => {
  const a = acao(), b = acao({ secao_id: 7, secao_sigla: 'IND' });
  assert.deepEqual(opcoesDe([a, a], 'secao', FILTRO_VAZIO(), ctx), [], 'uma só seção: sem filtro');
  const o = opcoesDe([a, b], 'secao', FILTRO_VAZIO(), ctx);
  assert.deepEqual(o.map((x) => [x.valor, x.rotulo, x.n]), [['1', 'DSI', 1], ['7', 'IND', 1]]);
  assert.deepEqual(com([a, b], { secao: '7' }), [b.id]);
});

test('prazo: hoje, até a reunião da equipe ou da organização, neste mês e intervalo', () => {
  const hoje = acao({ prazo: HOJE });
  const naEquipe = acao({ prazo: '2026-11-17' });
  const naOrg = acao({ prazo: '2026-11-20' });
  const depois = acao({ prazo: '2026-12-10' });
  const atrasada = acao({ prazo: '2026-11-10', atrasada: true });
  const concluida = acao({ prazo: '2026-11-18', status: 'concluida' });
  const todas = [hoje, naEquipe, naOrg, depois, atrasada, concluida];
  assert.deepEqual(com(todas, { prazo: 'hoje' }), [hoje.id]);
  assert.deepEqual(com(todas, { prazo: 'reuniao_equipe' }), [hoje.id, naEquipe.id], 'de hoje até a reunião da equipe, só em curso');
  assert.deepEqual(com(todas, { prazo: 'reuniao_org' }), [hoje.id, naEquipe.id, naOrg.id], 'a da organização é mais longe');
  assert.deepEqual(com(todas, { prazo: 'mes' }), [hoje.id, naEquipe.id, naOrg.id, atrasada.id, concluida.id], 'no mês de hoje, inclusive atrasada e concluída');
  assert.deepEqual(com(todas, { prazo: 'intervalo', prazoDe: '2026-11-18', prazoAte: '2026-12-31' }), [naOrg.id, depois.id, concluida.id]);
  assert.deepEqual(com(todas, { prazo: 'intervalo', prazoDe: '2026-12-01' }), [depois.id], 'só a data inicial');
  // As reuniões só viram opção quando existem (membro e chefe sem equipe não têm).
  const sem = opcoesDe(todas, 'prazo', FILTRO_VAZIO(), { ...ctx, semanaEquipe: null, semana: null }).map((x) => x.valor);
  assert.deepEqual(sem, ['hoje', 'mes', 'intervalo']);
  assert.equal(opcoesDe(todas, 'prazo', FILTRO_VAZIO(), ctx).find((x) => x.valor === 'reuniao_equipe').rotulo, 'Até a reunião da equipe (terça, 17/11)');
  assert.equal(diaEData('2026-11-23'), 'segunda, 23/11');
});

test('status e prioridade', () => {
  const a = acao({ status: 'a_fazer', prioridade: 'alta' }), b = acao({ status: 'bloqueada', prioridade: 'baixa' });
  assert.deepEqual(com([a, b], { status: 'bloqueada' }), [b.id]);
  assert.deepEqual(com([a, b], { prioridade: 'alta' }), [a.id]);
});

test('os filtros se combinam (E) com a busca e com os atalhos; a contagem de cada opção considera os OUTROS filtros', () => {
  const a = acao({ titulo: 'Relatório A', responsavel_id: 77, responsavel_nome: 'Alan', prioridade: 'alta', atrasada: true });
  const b = acao({ titulo: 'Relatório B', responsavel_id: 77, responsavel_nome: 'Alan', prioridade: 'baixa' });
  const c = acao({ titulo: 'Plano', responsavel_id: 78, responsavel_nome: 'Denilson', prioridade: 'alta', atrasada: true });
  const todas = [a, b, c];
  assert.deepEqual(com(todas, { q: 'relatorio', responsavel: 'id:77', prioridade: 'alta', atalhos: ['atrasadas'] }), [a.id]);
  // Escolhi "Alan": as opções de prioridade contam só as dele (a e b), não as de todo mundo.
  const prio = Object.fromEntries(opcoesDe(todas, 'prioridade', { ...FILTRO_VAZIO(), responsavel: 'id:77' }, ctx).map((x) => [x.valor, x.n]));
  assert.deepEqual([prio.alta, prio.media, prio.baixa], [1, 0, 1]);
  // E as opções de responsável ignoram o próprio filtro de responsável: continuam mostrando as duas pessoas.
  const resp = opcoesDe(todas, 'responsavel', { ...FILTRO_VAZIO(), responsavel: 'id:77', prioridade: 'alta' }, ctx).filter((x) => x.valor.startsWith('id:'));
  assert.deepEqual(resp.map((x) => [x.rotulo, x.n]), [['Alan', 1], ['Denilson', 1]]);
  // Os atalhos contam já respeitando as facetas.
  assert.equal(contarAtalhos(todas, { ...FILTRO_VAZIO(), responsavel: 'id:77' }, ctx).atrasadas, 1);
  assert.equal(contarAtalhos(todas, FILTRO_VAZIO(), ctx).atrasadas, 2);
});

test('contarAtivos conta as facetas escolhidas, não a busca nem os atalhos', () => {
  assert.equal(contarAtivos(FILTRO_VAZIO()), 0);
  assert.equal(contarAtivos({ ...FILTRO_VAZIO(), q: 'x', atalhos: ['atrasadas'], responsavel: 'eu', prazo: 'mes' }), 2);
  assert.equal(FACETAS.length, 6);
});
