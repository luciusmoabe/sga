// Relato semanal montado a partir das ações e dos impedimentos da seção (e de suas subseções).
// A tela do chefe mostra o relato "ao vivo"; ao enviar, uma cópia é congelada em atualizacoes.feito.snapshot
// para que o histórico e a reunião não mudem depois. Ações internas entram só como contagem na cópia.
import { subarvore } from './db.js';
import { dataNoFuso, instante } from '../public/js/datas.js';
import { addDays, hojeISO, parseISO } from './logic.js';
import { marks } from './helpers.js';

/** Segunda-feira da semana (segunda a domingo) que contém a data. */
export const segundaDe = (data) => addDays(data, -((parseISO(data).getUTCDay() + 6) % 7));

/** Janelas do relato para a reunião de `semana` (data ISO do dia da reunião), vistas em `hoje`.
 *  Concluídas: da segunda-feira da semana anterior até a véspera da reunião.
 *  Atrasadas: prazo anterior a hoje (a mesma regra do semáforo), ainda não concluídas.
 *  Programadas: prazo de hoje até o domingo da semana da reunião. */
export function janelasDoRelato(semana, hoje = hojeISO()) {
  const segunda = segundaDe(semana);
  return {
    concluidas: { de: addDays(segunda, -7), ate: addDays(semana, -1) },
    programadas: { de: hoje, ate: addDays(segunda, 6) },
    atrasadas: { antes: hoje },
  };
}

/** Visível ao Diretor e ao Apoio (mesma regra de `visiveisAcoes`). */
export const ehPublica = (a) => !a.interna || !!a.compartilhada;

const acaoOut = (a) => ({
  id: a.id, titulo: a.titulo, prazo: a.prazo, status: a.status, prioridade: a.prioridade,
  secao_id: a.secao_id, secao_sigla: a.secao_sigla,
  interna: !!a.interna, compartilhada: !!a.compartilhada,
  ...(a.concluida_em ? { concluida_em: a.concluida_em } : {}),
});

/** Relato ao vivo de uma seção: quatro blocos e as janelas usadas. Inclui ações internas (marcadas). */
export async function montarRelato(db, secaoId, semana, hoje = hojeISO()) {
  const janelas = janelasDoRelato(semana, hoje);
  const ids = await subarvore(db, secaoId);
  const lugares = marks(ids);
  const base = `select a.id, a.titulo, a.prazo, a.status, a.prioridade, a.secao_id, a.interna, a.compartilhada, a.concluida_em,
      s.sigla as secao_sigla from acoes a join secoes s on s.id = a.secao_id`;
  const [abertas, concluidasBrutas, impedimentos] = await Promise.all([
    db.prepare(`${base} where a.secao_id in (${lugares}) and a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0
      and a.prazo <= ? order by a.prazo, a.id`).all(...ids, janelas.programadas.ate),
    // Margem de um dia em cada ponta: o corte exato é feito abaixo, no fuso da Bahia.
    db.prepare(`${base} where a.secao_id in (${lugares}) and a.status = 'concluida' and a.concluida_em is not null
      and substr(a.concluida_em, 1, 10) >= ? and substr(a.concluida_em, 1, 10) <= ? order by a.concluida_em, a.id`)
      .all(...ids, addDays(janelas.concluidas.de, -1), addDays(janelas.concluidas.ate, 1)),
    db.prepare(`select i.id, i.acao_id, i.descricao, i.critico, i.apoio, i.criado_em, a.titulo as acao_titulo,
        a.status as acao_status, a.interna, a.compartilhada, a.secao_id, s.sigla as secao_sigla
      from impedimentos i join acoes a on a.id = i.acao_id join secoes s on s.id = a.secao_id
      where i.resolvido_em is null and a.secao_id in (${lugares}) and a.status != 'concluida' and a.encerrada = 0 and a.arquivada = 0
      order by i.critico desc, i.criado_em, i.id`).all(...ids),
  ]);
  const concluidas = concluidasBrutas.filter((a) => {
    const dia = dataNoFuso(instante(a.concluida_em));
    return dia >= janelas.concluidas.de && dia <= janelas.concluidas.ate;
  });
  return {
    semana,
    janelas,
    concluidas: concluidas.map(acaoOut),
    atrasadas: abertas.filter((a) => a.prazo < janelas.atrasadas.antes).map(acaoOut),
    programadas: abertas.filter((a) => a.prazo >= janelas.programadas.de && a.prazo <= janelas.programadas.ate).map(acaoOut),
    impedimentos: impedimentos.map((i) => ({
      id: i.id, acao_id: i.acao_id, acao_titulo: i.acao_titulo, acao_status: i.acao_status,
      secao_sigla: i.secao_sigla, descricao: i.descricao, apoio: i.apoio, criado_em: i.criado_em,
      critico: !!i.critico, interna: !!i.interna, compartilhada: !!i.compartilhada,
    })),
  };
}

/** Cópia congelada para o histórico e para o Diretor: só o que ele pode ver, mais a contagem do que é interno. */
export function paraSnapshot(relato, observacoes = '') {
  const publicos = (lista) => lista.filter(ehPublica);
  const internas = (lista) => lista.length - publicos(lista).length;
  return {
    formato: 2,
    janelas: relato.janelas,
    concluidas: publicos(relato.concluidas),
    atrasadas: publicos(relato.atrasadas),
    programadas: publicos(relato.programadas),
    impedimentos: publicos(relato.impedimentos),
    internas: {
      concluidas: internas(relato.concluidas), atrasadas: internas(relato.atrasadas),
      programadas: internas(relato.programadas), impedimentos: internas(relato.impedimentos),
    },
    observacoes,
  };
}

/** Assinatura de um snapshot, para saber se o relato mudou desde o último envio. */
export const assinatura = (s) => JSON.stringify([
  ['concluidas', 'atrasadas', 'programadas'].map((k) => (s[k] || []).map((a) => `${a.id}:${a.status}:${a.prazo}`)),
  (s.impedimentos || []).map((i) => i.id),
  s.internas || {},
]);

const CAMPOS_LEGADOS = ['feito', 'proximo', 'impedimentos', 'apoio', 'critico'];
/** O corpo é do formato antigo (listas em texto livre) quando traz algum campo do relato manual. */
export const ehCorpoLegado = (corpo) => CAMPOS_LEGADOS.some((k) => k in (corpo || {}));

/** Campos antigos derivados da cópia, para as telas que ainda leem o relato no formato de listas de texto.
 *  A marca "crítico" do relato não é mais usada: o semáforo lê os impedimentos das ações. */
export function camposLegados(snapshot, apoioMax = 600) {
  const apoio = snapshot.impedimentos.filter((i) => i.apoio).map((i) => `${i.acao_titulo}: ${i.apoio}`).join('\n').slice(0, apoioMax);
  return {
    feito: { previstos: [], extras: snapshot.concluidas.map((a) => a.titulo), snapshot },
    proximo: snapshot.programadas.map((a) => a.titulo),
    impedimentos: snapshot.impedimentos.map((i) => `${i.acao_titulo}: ${i.descricao}`),
    critico: 0,
    apoio: apoio || null,
  };
}
