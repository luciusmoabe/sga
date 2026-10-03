// Quadro de avisos: uma mensagem administrativa do Diretor ou do Administrador, com janela de vigência
// (data_inicio/data_fim), mostrada na tela Início do chefe e da Diretoria Adjunta. Histórico simples:
// ao contrário de combinados e decisões, não é documento de reunião, então a exclusão é definitiva.
import { ehISO } from './logic.js';
import { falha, h, permit, texto } from './helpers.js';

export function rotasAvisos(app, { q, q1, run, hoje, agoraISO }) {
  const gestao = permit('diretor', 'administrador');
  const fmt = (a) => (a ? { ...a, ativo: !!a.ativo } : null);

  app.get('/api/avisos', gestao, h(async () => {
    const h0 = hoje();
    return (await q('select a.*, u.nome criado_por_nome from avisos a left join usuarios u on u.id = a.criado_por order by a.id desc'))
      .map((a) => ({ ...a, ativo: !!a.ativo, vigente: !!a.ativo && a.data_inicio <= h0 && a.data_fim >= h0 }));
  }));

  // Qualquer perfil autenticado lê o aviso vigente: é ele que aparece na tela Início.
  app.get('/api/avisos/atual', h(async () => {
    const h0 = hoje();
    const atual = await q1(
      'select * from avisos where ativo = 1 and data_inicio <= ? and data_fim >= ? order by id desc limit 1', h0, h0,
    );
    return { aviso: fmt(atual) };
  }));

  app.post('/api/avisos', gestao, h(async (req, res) => {
    const t = texto(req.body?.texto, 300);
    if (!t) throw falha(400, 'Escreva o aviso.');
    const dataInicio = req.body?.data_inicio || hoje();
    const dataFim = req.body?.data_fim;
    if (!ehISO(dataInicio)) throw falha(400, 'Informe uma data de início válida (AAAA-MM-DD).');
    if (!ehISO(dataFim)) throw falha(400, 'Informe a data em que o aviso deve parar de aparecer.');
    if (dataFim < dataInicio) throw falha(400, 'A data final não pode vir antes da data de início.');
    if (dataFim < hoje()) throw falha(400, 'A data final não pode ser no passado.');
    const id = (await run(
      'insert into avisos (texto, data_inicio, data_fim, ativo, criado_por, criado_em) values (?,?,?,?,?,?)',
      t, dataInicio, dataFim, 1, req.user.id, agoraISO(),
    )).lastInsertRowid;
    res.status(201);
    return { aviso: fmt(await q1('select * from avisos where id = ?', id)) };
  }));

  app.patch('/api/avisos/:id', gestao, h(async (req) => {
    const id = Number(req.params.id);
    const a = await q1('select * from avisos where id = ?', id);
    if (!a) throw falha(404, 'Aviso não encontrado.');
    const b = req.body || {};
    const dataInicio = 'data_inicio' in b ? b.data_inicio : a.data_inicio;
    const dataFim = 'data_fim' in b ? b.data_fim : a.data_fim;
    if ('data_inicio' in b || 'data_fim' in b) {
      if (!ehISO(dataInicio)) throw falha(400, 'Informe uma data de início válida (AAAA-MM-DD).');
      if (!ehISO(dataFim)) throw falha(400, 'Informe a data em que o aviso deve parar de aparecer.');
      if (dataFim < dataInicio) throw falha(400, 'A data final não pode vir antes da data de início.');
    }
    if ('texto' in b) {
      const t = texto(b.texto, 300);
      if (!t) throw falha(400, 'O aviso não pode ficar vazio.');
      await run('update avisos set texto = ? where id = ?', t, id);
    }
    if ('data_inicio' in b || 'data_fim' in b) await run('update avisos set data_inicio = ?, data_fim = ? where id = ?', dataInicio, dataFim, id);
    if ('ativo' in b) await run('update avisos set ativo = ? where id = ?', b.ativo ? 1 : 0, id);
    return { aviso: fmt(await q1('select * from avisos where id = ?', id)) };
  }));

  app.delete('/api/avisos/:id', gestao, h(async (req) => {
    const r = await run('delete from avisos where id = ?', Number(req.params.id));
    if (!r.changes) throw falha(404, 'Aviso não encontrado.');
    return { ok: true };
  }));
}
