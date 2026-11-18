// Uso das telas: contagem anônima de aberturas (tabela `uso_telas`, migração 37). A interface avisa quando uma tela é aberta; o servidor
// soma 1 para a empresa, o dia, a tela, o perfil e a versão da interface. Não guarda quem abriu. O Diretor e o Administrador leem o total
// para decidir o que simplificar. Nada aqui muda regra de negócio, semáforo ou dado de ação.
import { addDays, ehISO } from './logic.js';
import { falha, h, permit } from './helpers.js';
import { empresaAtual } from './empresa.js';

const TELA = /^[a-z][a-z0-9-]{0,39}$/; // o nome da rota da interface: letras minúsculas, números e hífen
const DIAS_PADRAO = 28;
const DIAS_MAXIMO = 366;

export function rotasUso(app, { q, q1, run, hoje }) {
  // Qualquer perfil que usa a interface avisa a abertura (a Plataforma não usa as telas das empresas e fica de fora).
  app.post('/api/uso', h(async (req, res) => {
    const perfil = req.user.perfil;
    if (perfil === 'plataforma') return res.status(204).end();
    const tela = String(req.body?.tela ?? '');
    if (!TELA.test(tela)) throw falha(400, 'Informe o nome da tela.');
    const versao = req.body?.versao === 'nova' ? 'nova' : 'atual';
    await run(`insert into uso_telas (empresa_id, dia, tela, perfil, versao, aberturas) values (?,?,?,?,?,1)
      on conflict (empresa_id, dia, tela, perfil, versao) do update set aberturas = uso_telas.aberturas + 1`, empresaAtual(), hoje(), tela, perfil, versao);
    return res.status(204).end();
  }));

  // O total do período, por tela, perfil e versão. Só quem decide o que simplificar.
  app.get('/api/uso', permit('diretor', 'administrador'), h(async (req) => {
    const ate = req.query.ate || hoje();
    const de = req.query.de || addDays(ate, -(DIAS_PADRAO - 1));
    if (!ehISO(de) || !ehISO(ate) || de > ate) throw falha(400, 'Informe um período válido: a data inicial não pode ser depois da final.');
    if (addDays(de, DIAS_MAXIMO) < ate) throw falha(400, `Escolha um período de até ${DIAS_MAXIMO} dias.`);
    const linhas = await q(`select tela, perfil, versao, sum(aberturas) as aberturas, count(distinct dia) as dias from uso_telas
      where empresa_id = ? and dia >= ? and dia <= ? group by tela, perfil, versao order by tela, perfil, versao`, empresaAtual(), de, ate);
    const primeiro = await q1('select min(dia) as dia from uso_telas where empresa_id = ?', empresaAtual());
    return { de, ate, desde: primeiro?.dia ?? null, linhas: linhas.map((l) => ({ tela: l.tela, perfil: l.perfil, versao: l.versao, aberturas: Number(l.aberturas), dias: Number(l.dias) })) };
  }));
}
