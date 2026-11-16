// Em qual reunião cada ação do chefe é tratada (public/js/reuniao-da-acao.js): a da organização ou a da equipe, pela origem da cobrança.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nomeDaReuniao, reuniaoDaAcao } from '../public/js/reuniao-da-acao.js';

const ORG = '2026-11-23', EQUIPE = '2026-11-17', HOJE = '2026-11-16';
const EU = 3, MINHA_SECAO = 1;
const ctx = (extra = {}) => ({ semana: ORG, semanaEquipe: EQUIPE, hoje: HOJE, usuarioId: EU, secaoId: MINHA_SECAO, ...extra });
const acao = (o = {}) => ({ secao_id: MINHA_SECAO, responsavel_id: null, demandada_diretor: false, demandante_externo: null, demandada_chefe: false, interna: false, ...o });
const de = (a, extra) => reuniaoDaAcao(a, ctx(extra));

test('demanda do Diretor ou de entidade externa vai para a reunião da organização, qualquer que seja o responsável', () => {
  assert.deepEqual(de(acao({ demandada_diretor: true })), { tipo: 'organizacao', data: ORG });
  assert.deepEqual(de(acao({ demandada_diretor: true, responsavel_id: EU })), { tipo: 'organizacao', data: ORG }, 'o próprio chefe executa');
  assert.deepEqual(de(acao({ demandante_externo: 'Tribunal de Contas' })), { tipo: 'organizacao', data: ORG });
});

test('o que é tratado com a equipe vai para a reunião da equipe: interna, atribuída a outra pessoa, de uma subseção, direcionada às subseções', () => {
  const equipe = { tipo: 'equipe', data: EQUIPE };
  assert.deepEqual(de(acao({ interna: true })), equipe);
  assert.deepEqual(de(acao({ responsavel_id: 77 })), equipe, 'atribuída a um membro');
  assert.deepEqual(de(acao({ secao_id: 7 })), equipe, 'ação de uma subseção');
  assert.deepEqual(de(acao({ secao_id: 7, demandada_chefe: true })), equipe, 'direcionada pelo chefe às subseções');
});

test('demanda do Diretor delegada à equipe: vale a reunião mais próxima das duas', () => {
  const delegada = acao({ demandada_diretor: true, responsavel_id: 77 });
  assert.deepEqual(de(delegada), { tipo: 'equipe', data: EQUIPE }, 'a equipe se prepara antes');
  assert.deepEqual(de(delegada, { semana: '2026-11-17', semanaEquipe: '2026-11-24' }), { tipo: 'organizacao', data: '2026-11-17' }, 'a da organização é a primeira');
  // Se a da equipe já passou (data antes de hoje), vale a da organização.
  assert.deepEqual(de(delegada, { semanaEquipe: '2026-11-10' }), { tipo: 'organizacao', data: ORG });
  // As duas no mesmo dia: a da equipe (menor ou igual) aparece; empate resolvido de forma estável.
  assert.equal(de(delegada, { semana: '2026-11-17' }).data, '2026-11-17');
});

test('trabalho da própria unidade, sem a quem delegar, fica com a organização; sem equipe, tudo é da organização', () => {
  assert.deepEqual(de(acao()), { tipo: 'organizacao', data: ORG });
  assert.deepEqual(de(acao({ responsavel_id: EU })), { tipo: 'organizacao', data: ORG }, 'responsável é o próprio chefe');
  assert.deepEqual(de(acao({ interna: true }), { semanaEquipe: null }), { tipo: 'organizacao', data: ORG });
  assert.deepEqual(de(acao({ responsavel_id: 77 }), { semanaEquipe: undefined }), { tipo: 'organizacao', data: ORG });
});

test('nomeDaReuniao completa a frase "reunião ..."', () => {
  assert.equal(nomeDaReuniao({ tipo: 'equipe', data: EQUIPE }), 'da equipe');
  assert.equal(nomeDaReuniao({ tipo: 'organizacao', data: ORG }), 'da organização');
});
