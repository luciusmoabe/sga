// Atualização semanal das seções subordinadas ao chefe: a seção relata, até a véspera da reunião da seção acima (fechamento às 18h),
// o que fez, o que vem e o que trava; o relato é montado pelo servidor a partir das ações (`montarRelato`) e a cópia enviada fica
// congelada em `atualizacoes_equipe`. É o equivalente, em nível de seção, de `GET/PUT /api/atualizacao` da organização.
import { subarvore } from './db.js';
import { empresaAtual } from './empresa.js';
import { falha, h, json, permit, texto } from './helpers.js';
import { assinatura, camposLegados, montarRelato, paraSnapshot } from './relato.js';
import { fechamentoDe } from './logic.js';

const linha = (row) => (row ? { ...row, feito: json(row.feito, { previstos: [], extras: [] }), proximo: json(row.proximo, []), impedimentos: json(row.impedimentos, []), critico: !!row.critico } : null);

export function relatoReuniaoEquipe(app, { db, q, q1, run, agoraISO, hoje, agendaDe }) {
  const soChefe = permit('chefe');

  /** A última versão enviada por `secaoId` para a reunião de `semana`. */
  const ultima = async (secaoId, semana) => linha(await q1(`select a.*, u.nome as usuario_nome from atualizacoes_equipe a left join usuarios u on u.id = a.usuario_id
    where a.secao_id = ? and a.semana = ? and a.empresa_id = ? order by a.versao desc limit 1`, secaoId, semana, empresaAtual()));

  /** A seção do chefe, a seção acima (cuja reunião recebe o relato) e a agenda dela. Sem chefe acima, não há reunião a relatar. */
  const contexto = async (user) => {
    if (!user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção. Peça {topo:ao} para atribuí-lo a uma seção.');
    const secao = await q1('select id, nome, sigla, pai_id from secoes where id = ? and empresa_id = ?', user.secao_id, empresaAtual());
    const pai = secao?.pai_id ? await q1('select id, nome, sigla, chefe_id from secoes where id = ? and ativa = 1 and empresa_id = ?', secao.pai_id, empresaAtual()) : null;
    if (!pai?.chefe_id) return { aplicavel: false };
    return { aplicavel: true, secao, pai, agenda: await agendaDe(pai.id) };
  };

  app.get('/api/reunioes-equipe/atualizacao', soChefe, h(async (req) => {
    const c = await contexto(req.user);
    if (!c.aplicavel) return { aplicavel: false };
    const { secao, pai, agenda } = c;
    const semana = agenda.semana;
    const resumo = req.query.resumo === '1'; // o Início só precisa do relato enviado
    const [atual, relato] = await Promise.all([ultima(secao.id, semana), resumo ? null : montarRelato(db, secao.id, semana, hoje(), agenda.intervalo)]);
    const enviado = atual?.feito?.snapshot;
    return {
      aplicavel: true, semana, hora: agenda.hora, fechamento: fechamentoDe(semana), pai: { id: pai.id, nome: pai.nome, sigla: pai.sigla },
      atual, relato, desatualizada: enviado && relato ? assinatura(paraSnapshot(relato, '', { todas: true })) !== assinatura(enviado) : null,
    };
  }));

  app.put('/api/reunioes-equipe/atualizacao', soChefe, h(async (req) => {
    const c = await contexto(req.user);
    if (!c.aplicavel) throw falha(409, 'A sua seção não tem uma seção acima com chefe, então não há reunião da equipe para relatar.');
    const { secao, agenda } = c;
    const semana = agenda.semana;
    const observacoes = texto(req.body?.observacoes, 600);
    return db.transaction(async () => {
      if (db.isPg) await q1('select id from secoes where id = ? and empresa_id = ? for update', secao.id, empresaAtual());
      const relato = await montarRelato(db, secao.id, semana, hoje(), agenda.intervalo);
      const snapshot = paraSnapshot(relato, observacoes, { todas: true });
      const total = ['concluidas', 'atrasadas', 'vencemAntes', 'programadas', 'impedimentos'].reduce((n, k) => n + relato[k].length, 0);
      if (!total && !observacoes) throw falha(400, 'Não há ações nem impedimentos para relatar nesta semana. Se houve algo fora das ações, escreva nas observações.');
      const legado = camposLegados(snapshot);
      const versao = Number((await q1('select coalesce(max(versao), 0) as v from atualizacoes_equipe where secao_id = ? and semana = ? and empresa_id = ?', secao.id, semana, empresaAtual())).v) + 1;
      await run(`insert into atualizacoes_equipe (empresa_id, secao_id, semana, versao, feito, proximo, impedimentos, critico, apoio, usuario_id, enviada_em) values (?,?,?,?,?,?,?,?,?,?,?)`,
        empresaAtual(), secao.id, semana, versao, JSON.stringify(legado.feito), JSON.stringify(legado.proximo), JSON.stringify(legado.impedimentos), legado.critico, legado.apoio, req.user.id, agoraISO());
      return await ultima(secao.id, semana);
    });
  }));

  return { ultima };
}
