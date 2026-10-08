import test from 'node:test';
import assert from 'node:assert/strict';
import { atualizacaoPendente, ehISO, semaforo } from '../server/logic.js';
import { refDiaReuniao } from '../server/logic.js';
import { dataNoFuso, instante, somarDias } from '../public/js/datas.js';
import { spawnSync } from 'node:child_process';

test('atualização fica pendente somente após o fechamento no horário da Bahia', () => {
  const semana = '2026-10-13';
  for (const horario of ['2026-10-12T20:59:59Z', '2026-10-12T21:00:00Z']) {
    const pendente = atualizacaoPendente(false, semana, new Date(horario));
    assert.equal(pendente, false);
    assert.equal(semaforo({ pendente, atrasadas: 0, vencendo: 0, critico: false }), 'verde');
  }
  const depois = new Date('2026-10-12T21:00:01Z');
  const pendente = atualizacaoPendente(false, semana, depois);
  assert.equal(pendente, true);
  assert.equal(semaforo({ pendente, atrasadas: 0, vencendo: 0, critico: false }), 'amarelo');
  assert.equal(atualizacaoPendente(true, semana, depois), false);
  assert.equal(atualizacaoPendente(false, '2026-10-20', depois), false);
  assert.equal(atualizacaoPendente(false, '2026-10-06', depois), true);
  assert.equal(atualizacaoPendente(false, '2026-10-09', new Date('2026-10-08T21:00:01Z')), true);
  assert.equal(semaforo({ pendente: false, atrasadas: 1, vencendo: 0, critico: false }), 'vermelho');
  assert.equal(semaforo({ pendente: false, atrasadas: 0, vencendo: 1, critico: false }), 'amarelo');
});

test('datas: rejeita normalização de dias e meses inexistentes', () => {
  for (const valor of ['2026-02-31', '2026-02-29', '2026-04-31', '2026-13-01', '2026-00-00', '2026-01-00', '1900-02-29', '2026-1-01', '', null, 20260922]) {
    assert.equal(ehISO(valor), false, String(valor));
  }
});

test('datas: aceita limites de mês e anos bissextos válidos', () => {
  for (const valor of ['2026-02-28', '2028-02-29', '2000-02-29', '2026-04-30', '2026-12-31']) {
    assert.equal(ehISO(valor), true, valor);
  }
});

test('calendário: Bahia determina a virada do dia e o corte semanal às 12h', () => {
  assert.equal(dataNoFuso(new Date('2026-09-22T02:59:59Z')), '2026-09-21');
  assert.equal(dataNoFuso(new Date('2026-09-22T03:00:00Z')), '2026-09-22');
  assert.equal(refDiaReuniao(new Date('2026-09-22T14:59:59Z')), '2026-09-22');
  assert.equal(refDiaReuniao(new Date('2026-09-22T15:00:00Z')), '2026-09-29');
  assert.equal(instante('2026-09-22T10:00:00').toISOString(), '2026-09-22T13:00:00.000Z');
  assert.equal(instante('2026-09-22T10:00:00.125').toISOString(), '2026-09-22T13:00:00.125Z');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(somarDias('2028-02-28', 1), '2028-02-29');
  assert.throws(() => instante('2026-09-22T25:00:00'), /inválidas/);
});

test('calendário: API e formatação da interface independem do fuso da máquina', () => {
  const script = `
    import { agora, hojeISO, refDiaReuniao } from './server/logic.js';
    import { dataHora, diaSemana, addDias, trilho } from './public/js/ui.js';
    import { atualizarSessao, est } from './public/js/estado.js';
    atualizarSessao({ user: { perfil: 'diretor' }, agora: '2026-09-19T22:00:00Z', semana: '2026-09-20', reuniao_dia: 0, reuniao_hora: '10:00' });
    const html = trilho(est.boot);
    console.log(JSON.stringify([
      agora().toISOString(), hojeISO(), refDiaReuniao(),
      dataHora('2026-09-22T02:30:00Z'), dataHora('2026-09-21T23:30:00'),
      diaSemana('2026-09-20'), addDias('2026-09-20', -1),
      html.includes('sábado 18h'), html.includes('correções disponíveis'), html.includes('undefined')
    ]));
  `;
  const resultados = ['UTC', 'America/Los_Angeles', 'Asia/Tokyo'].map(TZ => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8', env: { ...process.env, TZ, SGC_NOW: '2026-09-22T11:59:59' },
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim());
  });
  for (const resultado of resultados) {
    assert.deepEqual(resultado, ['2026-09-22T14:59:59.000Z', '2026-09-22', '2026-09-22',
      '21/09/2026 23:30', '21/09/2026 23:30', 'domingo', '2026-09-19', true, true, false]);
  }
});
