// Cálculo da tela "Gestão da seção" (public/js/gestao-calculo.js): radar, horizonte, semanas, carga por pessoa e conversas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITES, calcularGestao, conversas, entregasPorSemana, horizonte } from '../public/js/gestao-calculo.js';

const HOJE = '2026-09-22';
let n = 0;
const acao = (o = {}) => ({ id: ++n, titulo: `Ação ${n}`, status: 'em_andamento', prazo: '2026-10-30', encerrada: false, arquivada: false, secao_id: 2, secao_sigla: 'COF', responsavel_id: null, responsavel_nome: null, ...o });

test('radar: atrasadas e impedimento crítico deixam a seção vermelha e vêm primeiro; ordem por gravidade', () => {
  const g = calcularGestao({ hoje: HOJE, acoes: [
    acao({ prazo: '2026-09-18' }), acao({ impedimento_critico: true }), acao({ prazo: '2026-09-24' }), acao({ parada: true }),
    acao({ status: 'concluida', aguardando_validacao: 'chefe', concluida_em: '2026-09-21T10:00:00' }),
  ] });
  assert.equal(g.cor, 'vermelho');
  assert.deepEqual(g.radar.map((r) => r.chave), ['critico', 'atrasadas', 'validar', 'vencem', 'paradas']);
  assert.equal(g.radar.find((r) => r.chave === 'atrasadas').acoes[0].dias, 4);
  assert.equal(g.kpis.atrasadas, 1);
  assert.equal(g.kpis.validar, 1);
});

test('semáforo: amarelo com atualização pendente ou prazo em até 2 dias; verde no resto', () => {
  assert.equal(calcularGestao({ hoje: HOJE, acoes: [acao()] }).cor, 'verde');
  assert.equal(calcularGestao({ hoje: HOJE, acoes: [acao()], atualizacaoPendente: true }).cor, 'amarelo');
  assert.equal(calcularGestao({ hoje: HOJE, acoes: [acao({ prazo: '2026-09-24' })] }).cor, 'amarelo');
  assert.deepEqual(calcularGestao({ hoje: HOJE, acoes: [acao()] }).radar, []);
});

test('ações concluídas, encerradas e arquivadas não contam como em curso', () => {
  const g = calcularGestao({ hoje: HOJE, acoes: [acao({ status: 'concluida', prazo: '2026-09-01', concluida_em: '2026-09-10T10:00:00' }), acao({ arquivada: true, prazo: '2026-09-01' }), acao({ encerrada: true, prazo: '2026-09-01' })] });
  assert.equal(g.kpis.emCurso, 0);
  assert.equal(g.kpis.atrasadas, 0);
  assert.equal(g.cor, 'verde');
});

test('horizonte: faixas de prazo em relação a hoje', () => {
  const h = horizonte([acao({ prazo: '2026-09-21' }), acao({ prazo: '2026-09-22' }), acao({ prazo: '2026-09-24' }), acao({ prazo: '2026-09-25' }), acao({ prazo: '2026-09-29' }), acao({ prazo: '2026-10-06' }), acao({ prazo: '2026-10-07' })], HOJE);
  assert.deepEqual(h, { vencidas: 1, ate2: 2, de3a7: 2, de8a14: 1, depois: 1 });
});

test('entregas por semana: janelas de 7 dias terminando hoje, com as entregues no prazo', () => {
  const s = entregasPorSemana([
    acao({ status: 'concluida', prazo: '2026-09-20', concluida_em: '2026-09-20T09:00:00' }),
    acao({ status: 'concluida', prazo: '2026-09-10', concluida_em: '2026-09-22T09:00:00' }),
    acao({ status: 'concluida', prazo: '2026-09-30', concluida_em: '2026-09-12T09:00:00' }),
  ], HOJE);
  assert.equal(s.length, LIMITES.semanas);
  assert.deepEqual([s.at(-1).de, s.at(-1).ate, s.at(-1).entregas, s.at(-1).noPrazo], ['2026-09-16', '2026-09-22', 2, 1]);
  assert.equal(s.at(-2).entregas, 1);
  assert.equal(s.reduce((t, x) => t + x.entregas, 0), 3);
});

test('carga por pessoa: sinais, ordem e dados do período; "sem responsável" por último e só se a equipe usa responsáveis', () => {
  const ana = { responsavel_id: 10, responsavel_nome: 'Ana' }, bia = { responsavel_id: 11, responsavel_nome: 'Bia' };
  const acoes = [
    acao({ ...ana, prazo: '2026-09-15' }), acao({ ...ana, parada: true }), acao({ ...ana }), acao({ ...ana }), acao({ ...ana }),
    acao({ ...bia, status: 'a_fazer' }), acao({ ...bia, status: 'a_fazer' }), acao({ responsavel_id: null }),
  ];
  const g = calcularGestao({ hoje: HOJE, acoes, pessoasDoPeriodo: [{ id: 10, nome: 'Ana', atual: { concluidas: 4, minutos: 300, pontos: 8 } }, { id: 12, nome: 'Caio', atual: { concluidas: 1, minutos: 60, pontos: 1 } }] });
  assert.deepEqual(g.pessoas.map((p) => p.nome), ['Ana', 'Bia', 'Caio', 'Sem responsável atribuído']);
  const a = g.pessoas[0];
  assert.deepEqual([a.abertas, a.emAndamento, a.atrasadas, a.paradas, a.entregas, a.minutos], [5, 5, 1, 1, 4, 300]);
  assert.deepEqual(a.sinais, ['atrasada', 'parada', 'sobrecarga']);
  assert.ok(g.radar.some((r) => r.chave === 'sem-responsavel'));
  // Sem nenhuma ação atribuída, "sem responsável" não vira alerta (a seção não usa atribuição).
  assert.ok(!calcularGestao({ hoje: HOJE, acoes: [acao(), acao()] }).radar.some((r) => r.chave === 'sem-responsavel'));
});

test('conversas: apoiar, alinhar e reconhecer, nessa ordem, e nunca sobre "sem responsável"', () => {
  const base = { id: 1, nome: 'Ana', abertas: 0, aFazer: 0, emAndamento: 1, bloqueadas: 0, atrasadas: 0, paradas: 0, entregas: 0 };
  const lista = conversas([
    { ...base, id: 1, nome: 'Ana', entregas: LIMITES.reconhecer },
    { ...base, id: 2, nome: 'Bia', atrasadas: 2 },
    { ...base, id: 3, nome: 'Caio', emAndamento: LIMITES.emAndamentoPorPessoa + 1 },
    { ...base, id: 4, nome: 'Dani', emAndamento: 0, aFazer: 3 },
    { ...base, id: null, nome: 'Sem responsável atribuído', atrasadas: 5 },
  ]);
  assert.deepEqual(lista.map((c) => [c.tipo, c.nome]), [['apoiar', 'Bia'], ['alinhar', 'Caio'], ['alinhar', 'Dani'], ['reconhecer', 'Ana']]);
  assert.match(lista[0].texto, /2 atrasadas/);
  // Quem entregou muito mas tem atraso não é "reconhecido" na mesma frase.
  assert.deepEqual(conversas([{ ...base, entregas: 9, atrasadas: 1 }]).map((c) => c.tipo), ['apoiar']);
});

test('seções: só aparece a divisão por seção quando há mais de uma', () => {
  assert.deepEqual(calcularGestao({ hoje: HOJE, acoes: [acao(), acao()] }).secoes, []);
  const g = calcularGestao({ hoje: HOJE, acoes: [acao(), acao({ secao_id: 7, secao_sigla: 'IND', prazo: '2026-09-01' })] });
  assert.deepEqual(g.secoes.map((s) => [s.nome, s.abertas, s.atrasadas]), [['IND', 1, 1], ['COF', 1, 0]]);
});
