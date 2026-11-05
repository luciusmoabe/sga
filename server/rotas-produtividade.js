// Produtividade das unidades: GET /api/produtividade?de=AAAA-MM-DD&ate=AAAA-MM-DD[&secao=ID]. Só leitura.
// Diretor, Administrador e Apoio veem as unidades de acompanhamento (o Apoio sem os números por pessoa); o chefe vê a própria
// unidade, com as pessoas dela. Membro, Consulta e Plataforma não entram (listas fechadas em app.js).
import { addDays, ehISO } from './logic.js';
import { falha, h, permit } from './helpers.js';
import { DIAS_MAX_PERIODO, calcularProdutividade, diasEntre, unidadesDoUsuario } from './produtividade.js';

export function rotasProdutividade(app, { db, hoje, visiveisAcoes }) {
  app.get('/api/produtividade', permit('diretor', 'apoio', 'administrador', 'chefe'), h(async (req) => {
    const agora = hoje();
    const ate = req.query.ate ?? agora;
    const de = req.query.de ?? addDays(ate, -27);
    if (!ehISO(de) || !ehISO(ate)) throw falha(400, 'Informe o período em datas válidas (AAAA-MM-DD).');
    if (de > ate) throw falha(400, 'A data inicial não pode vir depois da final.');
    if (ate > agora) throw falha(400, 'O período não pode terminar no futuro.');
    if (diasEntre(de, ate) + 1 > DIAS_MAX_PERIODO) throw falha(400, `O período deve ter no máximo ${DIAS_MAX_PERIODO} dias.`);
    const secao = req.query.secao === undefined ? null : Number(req.query.secao);
    if (secao !== null && !Number.isSafeInteger(secao)) throw falha(400, 'Unidade inválida.');
    if (req.user.perfil === 'chefe' && !req.user.secao_id) throw falha(409, 'Você ainda não está vinculado a uma seção. Peça ao Diretor para atribuí-lo.');
    const unidades = await unidadesDoUsuario(db, req.user, secao);
    if (unidades === null || (secao !== null && !unidades.length)) throw falha(404, 'Unidade não encontrada.');
    const r = await calcularProdutividade(db, { visiveis: await visiveisAcoes(req.user), de, ate, hoje: agora, unidades });
    return { periodo: { de, ate, dias: diasEntre(de, ate) + 1 }, hoje: agora, pode_ver_pessoas: ['diretor', 'administrador', 'chefe'].includes(req.user.perfil), ...r };
  }));
}
