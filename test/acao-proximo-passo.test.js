// O próximo passo sugerido na ficha da ação (public/js/acao-proximo-passo.js): a primeira regra que vale, e nada quando não há o que sugerir.
import test from 'node:test';
import assert from 'node:assert/strict';
import { proximoPasso } from '../public/js/acao-proximo-passo.js';

const chave = (a, c) => proximoPasso({ status: 'em_andamento', prazo: '2026-12-31', ...a }, { hoje: '2026-11-17', ...c })?.chave ?? null;

test('sem sugestão: só leitura, ação encerrada, arquivada ou já concluída', () => {
  assert.equal(chave({}, { leitura: true }), null);
  assert.equal(chave({ encerrada: true }), null);
  assert.equal(chave({ arquivada: true }), null);
  assert.equal(chave({ status: 'concluida' }), null);
});

test('a ordem das regras: validação, impedimento crítico, atraso, pedido de prazo, impedimento, começar, parada', () => {
  assert.equal(chave({ aguardando_validacao: 'chefe', impedimento_critico: true }), 'validacao');
  assert.equal(chave({ status: 'concluida', aguardando_validacao: 'chefe' }), 'validacao');
  assert.equal(chave({ impedimento_critico: true, atrasada: true }), 'critico');
  assert.equal(chave({ atrasada: true, pedido_pendente: true, impedimentos_abertos: 2 }), 'atrasada');
  assert.equal(chave({ pedido_pendente: true, impedimentos_abertos: 2 }), 'pedido');
  assert.equal(chave({ impedimentos_abertos: 1 }), 'impedimento');
  assert.equal(chave({ status: 'a_fazer' }), 'comecar');
  assert.equal(chave({ checklist_total: 3, checklist_feitos: 1, parada: true }), 'parada', 'ação parada com tarefas pendentes: o que importa é voltar a movimentar');
});

test('tarefas: faltam algumas, todas feitas sem tempo, todas feitas com tempo', () => {
  assert.equal(chave({ checklist_total: 3, checklist_feitos: 1 }), 'tarefas');
  assert.match(proximoPasso({ status: 'em_andamento', checklist_total: 3, checklist_feitos: 1 }).texto, /Faltam 2 de 3 tarefas/);
  assert.equal(chave({ checklist_total: 2, checklist_feitos: 2, tempo_total: 0 }), 'tempo');
  assert.equal(chave({ checklist_total: 2, checklist_feitos: 2, tempo_total: 90 }), 'concluir');
});

test('parada e o caso comum', () => {
  assert.equal(chave({ parada: true }), 'parada');
  assert.equal(chave({}), 'registrar');
});

test('atraso diz há quantos dias, no singular e no plural, e muda a frase se já há pedido de prazo', () => {
  assert.match(proximoPasso({ status: 'em_andamento', atrasada: true, prazo: '2026-11-16' }, { hoje: '2026-11-17' }).texto, /atrasada há 1 dia\./);
  assert.match(proximoPasso({ status: 'em_andamento', atrasada: true, prazo: '2026-11-12' }, { hoje: '2026-11-17' }).texto, /atrasada há 5 dias\. Registre o andamento e, se precisar de mais tempo, peça um novo prazo/);
  assert.match(proximoPasso({ status: 'em_andamento', atrasada: true, prazo: '2026-11-12', pedido_pendente: true }, { hoje: '2026-11-17' }).texto, /aguarde a resposta ao pedido de novo prazo/);
});
