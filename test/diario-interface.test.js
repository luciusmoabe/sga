// Regras puras da interface do diário de progresso (public/js/diario.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_DIARIO, agruparPorDia, contagens, ehLink, filtrarDiario, FONTES_DA_LINHA, contagemPorFonte, destaquesParaRelato, eventosDaLinhaDoTempo, filtrarEventos, filtrarRegistros, haQuantoTempo, opcoesDosRegistros, resumir, resumoParaCopiar, rotuloDoDia, rotuloTipo, semRegistroRecente } from '../public/js/diario.js';

const HOJE = '2026-11-17';
let n = 0;
const reg = (o = {}) => ({ id: ++n, tipo: 'andamento', texto: `Registro ${n}`, data: HOJE, tarefa_id: null, tarefa_nome: null, ...o });

test('tipos e rótulos', () => {
  assert.deepEqual(TIPOS_DIARIO.map(([v]) => v), ['andamento', 'entrega', 'impedimento', 'observacao']);
  assert.equal(rotuloTipo('observacao'), 'Observação');
  assert.equal(rotuloTipo('desconhecido'), 'desconhecido');
});

test('filtro por tipo e por tarefa: todas, geral, excluídas e uma tarefa', () => {
  const geral = reg(), daT1 = reg({ tarefa_id: 7, tarefa_nome: 'Minuta' }), daT2 = reg({ tarefa_id: 8, tarefa_nome: 'Empenho', tipo: 'entrega' });
  const excluida = reg({ tarefa_id: null, tarefa_nome: 'Tarefa antiga' });
  const lista = [geral, daT1, daT2, excluida];
  const ids = (l) => l.map((r) => r.id);
  assert.deepEqual(ids(filtrarDiario(lista)), ids(lista));
  assert.deepEqual(ids(filtrarDiario(lista, { tipo: 'entrega' })), [daT2.id]);
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: 'geral' })), [geral.id], '"geral" não inclui os de tarefa excluída');
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: 'excluida' })), [excluida.id]);
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: '7' })), [daT1.id]);
  assert.deepEqual(ids(filtrarDiario(lista, { tarefa: '7', tipo: 'entrega' })), [], 'os dois filtros se combinam');
});

test('agrupar por dia mantém a ordem e junta os do mesmo dia', () => {
  const a = reg({ data: '2026-11-17' }), b = reg({ data: '2026-11-17' }), c = reg({ data: '2026-11-15' }), d = reg({ data: '2026-11-17' });
  const g = agruparPorDia([a, b, c, d]);
  assert.deepEqual(g.map((x) => [x.data, x.registros.length]), [['2026-11-17', 2], ['2026-11-15', 1], ['2026-11-17', 1]], 'só junta os vizinhos: a ordem recebida é a que vale');
  assert.deepEqual(agruparPorDia([]), []);
});

test('rótulo do dia e "há quanto tempo"', () => {
  assert.equal(rotuloDoDia('2026-11-17', HOJE), 'Hoje');
  assert.equal(rotuloDoDia('2026-11-16', HOJE), 'Ontem');
  assert.equal(rotuloDoDia('2026-11-13', HOJE), 'sexta, 13/11');
  assert.equal(rotuloDoDia('2025-12-30', HOJE), 'terça, 30/12/2025', 'com o ano quando não é o de hoje');
  assert.equal(haQuantoTempo('2026-11-17T08:30:00', HOJE), 'hoje');
  assert.equal(haQuantoTempo('2026-11-16T23:10:00', HOJE), 'ontem');
  assert.equal(haQuantoTempo('2026-11-12T09:00:00', HOJE), 'há 5 dias');
});

test('resumir corta em palavra inteira e tira quebras de linha', () => {
  assert.equal(resumir('Curto.'), 'Curto.');
  assert.equal(resumir('Linha um\n\nlinha   dois'), 'Linha um linha dois');
  const longo = resumir('palavra '.repeat(40), 50);
  assert.ok(longo.endsWith('…') && longo.length <= 51, longo);
  assert.ok(!/\s…$/.test(longo));
});

test('contagens por tipo, por tarefa, gerais e de tarefas excluídas', () => {
  const lista = [reg(), reg({ tipo: 'entrega', tarefa_id: 7, tarefa_nome: 'Minuta' }), reg({ tarefa_id: 7, tarefa_nome: 'Minuta' }), reg({ tarefa_nome: 'Antiga' })];
  const c = contagens(lista);
  assert.deepEqual(c.porTipo, { andamento: 3, entrega: 1 });
  assert.equal(c.porTarefa.get(7).n, 2);
  assert.equal(c.porTarefa.get(7).nome, 'Minuta');
  assert.equal(c.geral, 1);
  assert.equal(c.excluidas, 1);
});

test('só http e https viram link', () => {
  assert.equal(ehLink('https://sei.exemplo.gov.br/processo/1'), true);
  assert.equal(ehLink('http://x.y/z'), true);
  assert.equal(ehLink('SEI 052.3010.2026.0005350-55'), false);
  assert.equal(ehLink('javascript:alert(1)'), false);
  assert.equal(ehLink('https://a b'), false);
});

const dia = (o = {}) => ({ id: ++n, tipo: 'andamento', texto: 'Texto', data: HOJE, acao_id: 1, acao_titulo: 'Ação A', autor_id: 10, autor_nome: 'Bruno', tarefa_nome: null, minutos: null, referencia: null, ...o });

test('filtrarRegistros: por pessoa, ação e tipo, combinados', () => {
  const l = [dia({ autor_id: 10 }), dia({ autor_id: 11, acao_id: 2, acao_titulo: 'Ação B' }), dia({ autor_id: 10, acao_id: 2, acao_titulo: 'Ação B', tipo: 'entrega' })];
  assert.equal(filtrarRegistros(l).length, 3);
  assert.equal(filtrarRegistros(l, { pessoa: '10' }).length, 2);
  assert.equal(filtrarRegistros(l, { acao: '2' }).length, 2);
  assert.equal(filtrarRegistros(l, { pessoa: '10', acao: '2', tipo: 'entrega' }).length, 1);
  assert.equal(filtrarRegistros(l, { tipo: 'observacao' }).length, 0);
});

test('opcoesDosRegistros: só pessoas e ações que existem, em ordem alfabética, com a contagem', () => {
  const l = [dia({ autor_id: 11, autor_nome: 'Zélia', acao_id: 2, acao_titulo: 'Beta' }), dia({ autor_id: 10, autor_nome: 'Ana' }), dia({ autor_id: 10, autor_nome: 'Ana', acao_id: 2, acao_titulo: 'Beta' })];
  const o = opcoesDosRegistros(l);
  assert.deepEqual(o.pessoas.map((p) => [p.nome, p.n]), [['Ana', 2], ['Zélia', 1]]);
  assert.deepEqual(o.acoes.map((a) => [a.nome, a.n]), [['Ação A', 1], ['Beta', 2]]);
});

test('resumoParaCopiar: cabeçalho, total de tempo, um bloco por dia do mais antigo ao mais recente, e o caso vazio', () => {
  const l = [
    dia({ id: 3, data: '2026-11-17', texto: 'Enviei   o ofício.', tarefa_nome: 'Minuta', minutos: 90, referencia: 'SEI 123', tipo: 'entrega' }),
    dia({ id: 2, data: '2026-11-16', texto: 'Comecei.', autor_nome: 'Marina' }),
  ];
  const t = resumoParaCopiar(l, { de: '2026-11-11', ate: '2026-11-17', titulo: 'Meu diário' });
  assert.equal(t.split('\n')[0], 'Meu diário — 11/11 a 17/11');
  assert.match(t, /2 registros · 1 h 30 min lançados/);
  assert.ok(t.indexOf('\n16/11') < t.indexOf('\n17/11'), 'dia mais antigo primeiro');
  assert.match(t, /- Ação A \(tarefa: Minuta\): Enviei o ofício\. \[Entrega · 1 h 30 min · ref\. SEI 123\]/);
  assert.doesNotMatch(t, /Marina/, 'sem o autor no "meu diário"');
  assert.match(resumoParaCopiar(l, { de: '2026-11-11', ate: '2026-11-17', comAutor: true }), /\[Andamento · Marina\]/);
  assert.match(resumoParaCopiar([], { de: '2026-11-11', ate: '2026-11-17' }), /Nenhum registro no período\./);
});

test('destaquesParaRelato: entregas primeiro, ação interna fora, cabe no limite', () => {
  const l = [
    dia({ id: 1, tipo: 'andamento', texto: 'Andei.', acao_titulo: 'Ação A' }),
    dia({ id: 2, tipo: 'entrega', texto: 'Entreguei o ofício.', acao_titulo: 'Ação B' }),
    dia({ id: 3, tipo: 'observacao', texto: 'Segredo.', acao_titulo: 'Interna', interna: true, compartilhada: false }),
    dia({ id: 4, tipo: 'impedimento', texto: 'Sem número no SEI.', acao_titulo: 'Ação C' }),
    dia({ id: 5, tipo: 'observacao', texto: 'Compartilhada.', acao_titulo: 'Ação D', interna: true, compartilhada: true }),
  ];
  const t = destaquesParaRelato(l);
  assert.deepEqual(t.split('\n'), ['- Ação B: Entreguei o ofício.', '- Ação C: Sem número no SEI.', '- Ação A: Andei.', '- Ação D: Compartilhada.']);
  assert.doesNotMatch(t, /Segredo|Interna/, 'registro de ação interna nunca entra');
  const curto = destaquesParaRelato(l, { max: 60 });
  assert.ok(curto.length <= 60, `cabe no limite (${curto.length})`);
  assert.equal(curto.split('\n').length, 2, 'para na linha que não cabe');
  assert.equal(destaquesParaRelato([], { max: 600 }), '');
  assert.ok(destaquesParaRelato([dia({ texto: 'x'.repeat(500) })], { max: 40 }).length <= 40, 'se nem a primeira cabe, corta');
});

test('semRegistroRecente: em andamento sem registro há 7 dias ou mais (ou nunca)', () => {
  const a = (o) => ({ status: 'em_andamento', ultimo_registro_em: null, ...o });
  const l = [
    a({ id: 1 }),
    a({ id: 2, ultimo_registro_em: '2026-11-17T09:00:00' }),
    a({ id: 3, ultimo_registro_em: '2026-11-11T09:00:00' }),
    a({ id: 4, ultimo_registro_em: '2026-11-10T09:00:00' }),
    a({ id: 5, status: 'a_fazer' }),
    a({ id: 6, status: 'concluida' }),
  ];
  assert.deepEqual(semRegistroRecente(l, HOJE).map((x) => x.id), [1, 4]);
  assert.deepEqual(semRegistroRecente(l, HOJE, 3).map((x) => x.id), [1, 3, 4]);
});

const ev = (o = {}) => ({ id: ++n, criado_em: '2026-11-17T10:00:00', ...o });

test('eventosDaLinhaDoTempo: junta as quatro fontes, do dia mais recente ao mais antigo, e no dia pela hora', () => {
  const e = eventosDaLinhaDoTempo({
    diario: [ev({ data: '2026-11-17', criado_em: '2026-11-17T09:00:00', texto: 'registro' }), ev({ data: '2026-11-12', criado_em: '2026-11-17T08:00:00', texto: 'antigo, lançado depois' })],
    impedimentos: [ev({ criado_em: '2026-11-17T14:00:00', descricao: 'trava' })],
    pontos: [ev({ criado_em: '2026-11-16T10:00:00', descricao: 'atenção' })],
    comentarios: [ev({ criado_em: '2026-11-17T11:00:00', texto: 'conversa' })],
  });
  assert.deepEqual(e.map((x) => x.fonte), ['impedimento', 'comentario', 'registro', 'ponto', 'registro']);
  assert.deepEqual(e.map((x) => x.data), ['2026-11-17', '2026-11-17', '2026-11-17', '2026-11-16', '2026-11-12'], 'o registro vale pelo dia do trabalho, não pelo dia em que foi lançado');
  assert.deepEqual(eventosDaLinhaDoTempo({}), []);
});

test('filtrarEventos e contagemPorFonte: por fonte e por tarefa (a tarefa só existe no diário)', () => {
  const e = eventosDaLinhaDoTempo({
    diario: [ev({ data: '2026-11-17', tipo: 'andamento', tarefa_id: 7, tarefa_nome: 'Minuta' }), ev({ data: '2026-11-17', tipo: 'entrega', tarefa_id: null, tarefa_nome: null })],
    impedimentos: [ev({})], comentarios: [ev({}), ev({})],
  });
  assert.deepEqual(contagemPorFonte(e), { registro: 2, impedimento: 1, ponto: 0, comentario: 2 });
  assert.equal(filtrarEventos(e, {}).length, 5);
  assert.equal(filtrarEventos(e, { fonte: 'comentario' }).length, 2);
  assert.equal(filtrarEventos(e, { tarefa: '7' }).length, 1, 'escolher uma tarefa mostra só os registros dela');
  assert.equal(filtrarEventos(e, { tarefa: 'geral' }).length, 1);
  assert.equal(filtrarEventos(e, { fonte: 'impedimento', tarefa: '7' }).length, 0, 'impedimento não aponta tarefa');
  assert.deepEqual(FONTES_DA_LINHA.map(([v]) => v), ['registro', 'impedimento', 'ponto', 'comentario']);
});
