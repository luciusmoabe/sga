import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { falha } from './helpers.js';
import { rodarLembretes } from './lembretes.js';
import { rotasPush } from './push.js';
import { criarContexto } from './contexto.js';
import { rotasAcoes } from './rotas-acoes.js';
import { rotasEstrutura } from './rotas-estrutura.js';
import { rotasReunioesEquipe } from './reunioes-equipe.js';
import { rotasSemana } from './rotas-semana.js';
import { rotasReunioes } from './reunioes.js';
import { rotasAvisos } from './rotas-avisos.js';
import { rotasPlataforma } from './rotas-plataforma.js';
import { rotasProdutividade } from './rotas-produtividade.js';
import { rotasCabecalhoAta } from './ata-cabecalho.js';
import { cabecalhosSeguranca } from './seguranca-http.js';
import { configurarAuth, instalarAuth } from './auth.js';
import { administradorAuth } from './cadastro-chefes.js';
import { comEmpresa, escopoDaEmpresa, instalarLintDeEmpresa } from './empresa.js';
import { completarVocabulario, resolverTopo } from '../public/js/vocabulario.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Monta a aplicação. As rotas ficam por assunto: estrutura (seções e usuários), ações (diretrizes,
 * ações e pedidos de prazo), semana (sessão, atualização semanal e painel), reuniões e avisos.
 */
export function createApp(db, { auth = configurarAuth(), provedor, adminAuth, emissorPush } = {}) {
  const app = express();
  // Atrás do proxy da Vercel (ou de outro proxy confiável), o IP real vem de X-Forwarded-For.
  // Sem isso o limite de tentativas de login trataria todos os usuários como um só IP.
  if (process.env.VERCEL || process.env.SGC_TRUST_PROXY) app.set('trust proxy', Number(process.env.SGC_TRUST_PROXY) || 1);
  app.disable('x-powered-by');
  // Identificador por requisição: vai no cabeçalho `X-Request-Id` e nos registros de erro, para ligar o que a pessoa viu ao que o servidor registrou.
  app.use((req, res, next) => {
    const recebido = req.get('x-request-id');
    req.id = recebido && /^[\w.-]{8,64}$/.test(recebido) ? recebido : randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });
  // Lembretes da semana: chamado por um agendador (cron da hospedagem), sem sessão, só com o segredo no cabeçalho
  // `Authorization: Bearer ...`. Sem SGC_CRON_SECRET (ou CRON_SECRET, que a Vercel envia sozinha) a rota não existe.
  // `?ensaio=1` só calcula o que seria enviado. Não devolve e-mails, só contagens e identificadores.
  const resumoDe = (s) => createHash('sha256').update(String(s)).digest();
  const lembretes = async (req, res, next) => {
    try {
      const segredo = process.env.SGC_CRON_SECRET || process.env.CRON_SECRET || '';
      res.set('Cache-Control', 'no-store');
      if (!segredo) return res.status(404).json({ erro: 'Rota não encontrada.' });
      const enviado = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!timingSafeEqual(resumoDe(enviado), resumoDe(segredo))) return res.status(401).json({ erro: 'Não autorizado.' });
      const resultado = await rodarLembretes(db, { ensaio: req.query.ensaio === '1', origem: process.env.SGC_PUBLIC_ORIGIN || '' });
      res.json({ ok: true, empresas: resultado });
    } catch (e) { next(e); }
  };
  app.get('/api/interno/lembretes', lembretes);
  app.post('/api/interno/lembretes', lembretes);
  // Verificação de saúde (sem sessão e sem dados): serve a monitores e à implantação. Confere só que o banco responde.
  app.get('/api/saude', async (req, res) => {
    try { await db.prepare('select 1 as ok').get(); res.set('Cache-Control', 'no-store').json({ ok: true }); }
    catch { res.status(503).set('Cache-Control', 'no-store').json({ ok: false }); }
  });
  app.use(cabecalhosSeguranca({ https: !!auth?.secure }));
  app.use(compression({ threshold: 512 })); // gzip/brotli: reduz JSON em ~70-80%
  app.use(express.json({ limit: '200kb' }));
  // Fontes vendorizadas nunca mudam sob o mesmo nome: cache longo é seguro. Demais estáticos (JS, CSS,
  // ícones) não têm nome com hash de conteúdo — evite cache longo neles, para não servir versão antiga
  // depois de um deploy. Só vale para uso local (npm start): na Vercel os estáticos vão direto pelo
  // @vercel/static, sem passar por aqui — o cabeçalho equivalente está em vercel.json (headers). Veja VERCEL.md.
  app.use('/fontes', express.static(path.join(raiz, 'public/fontes'), { maxAge: '30d', immutable: true }));
  app.use(express.static(path.join(raiz, 'public')));

  if (process.env.SGC_LINT_EMPRESA) instalarLintDeEmpresa(db);
  const ctx = criarContexto(db);
  // API administrativa do Supabase (criação de contas e troca de senha); só existe no modo institucional.
  const contas = adminAuth || (auth.mode === 'supabase' ? administradorAuth(auth) : null);
  instalarAuth(app, db, auth, provedor, contas);
  // Daqui em diante toda consulta roda na empresa de quem está logado (server/empresa.js).
  app.use('/api', escopoDaEmpresa);
  // Perfil Consulta: só lê as ações. Lista fechada, para que nenhuma rota, atual ou futura, fique aberta a ele por
  // descuido. Entrar, sair e trocar a senha são atendidos antes, em instalarAuth.
  const LEITURA_CONSULTA = [/^\/bootstrap$/, /^\/acoes$/, /^\/acoes\/\d+$/, /^\/tarefas$/];
  app.use('/api', (req, res, next) => {
    if (req.user?.perfil !== 'consulta' || (req.method === 'GET' && LEITURA_CONSULTA.some((r) => r.test(req.path)))) return next();
    next(falha(403, 'O perfil Consulta só permite ler as ações das unidades.'));
  });
  // Perfil Plataforma: administra as empresas e não toca em dados de negócio. Lista fechada, como as outras: só o bootstrap e as
  // rotas /plataforma respondem; qualquer outra rota (atual ou futura) responde 403 a ele.
  app.use('/api', (req, res, next) => {
    if (req.user?.perfil !== 'plataforma' || (req.method === 'GET' && req.path === '/bootstrap') || req.path.startsWith('/plataforma/')) return next();
    next(falha(403, 'O perfil Plataforma só administra as empresas.'));
  });
  // Membro da equipe: lê as ações e tarefas da sua seção e age só no que é dele. Lista fechada, como a da Consulta: o
  // que não está aqui (relatos, reuniões, atas, combinados, estrutura, contas, aceite, validação, arquivar, redirecionar e
  // pedir prazo) responde 403 mesmo que a rota, por descuido, não confira o perfil. Quem pode o quê em cada ação é
  // decidido dentro das rotas (executa/ehAutor em rotas-acoes.js).
  const ROTAS_MEMBRO = [
    ['GET', /^\/(bootstrap|secoes|tarefas|avisos\/atual)$/],
    ['GET', /^\/reunioes-equipe(\/\d+)?$/], // as atas das reuniões da equipe de que participou
    ['GET', /^\/acoes(\/\d+(\/(responsaveis|executores))?)?$/],
    ['POST', /^\/acoes$/],
    ['PATCH', /^\/acoes\/\d+$/],
    ['DELETE', /^\/acoes\/\d+$/],
    ['POST', /^\/acoes\/\d+\/(tempo|comentarios|vista|checklist|impedimentos|impedimentos\/\d+\/resolver)$/],
    ['PATCH', /^\/acoes\/\d+\/checklist\/\d+$/],
    ['DELETE', /^\/acoes\/\d+\/checklist\/\d+$/],
  ];
  app.use('/api', (req, res, next) => {
    if (req.user?.perfil !== 'membro' || ROTAS_MEMBRO.some(([metodo, rota]) => req.method === metodo && rota.test(req.path))) return next();
    next(falha(403, 'O seu perfil de membro da equipe não dá acesso a esta função. Fale com o chefe da seção.'));
  });

  rotasEstrutura(app, { ...ctx, auth, adminAuth: contas });
  rotasReunioesEquipe(app, ctx);
  rotasPush(app, { db, emissor: emissorPush });
  const { criarDiretriz, SELECT_ACAO, acaoOut, visiveisAcoes } = rotasAcoes(app, ctx);
  rotasProdutividade(app, { ...ctx, visiveisAcoes });
  rotasSemana(app, { ...ctx, SELECT_ACAO, acaoOut });
  rotasReunioes(app, { ...ctx, criarDiretriz });
  rotasAvisos(app, ctx);
  rotasPlataforma(app, { ...ctx, auth, adminAuth: contas });
  rotasCabecalhoAta(app, ctx);

  // ---------- Erros ----------
  app.use('/api', (req, res, next) => next(falha(404, 'Rota não encontrada.')));
  app.use(async (err, req, res, next) => {
    const status = err.status || 500;
    // Registro estruturado (uma linha JSON): fácil de filtrar nos logs da hospedagem. Sem corpo da requisição nem dados pessoais.
    if (status >= 500) console.error(JSON.stringify({ nivel: 'erro', id: req.id, metodo: req.method, rota: req.path, usuario: req.user?.id ?? null, empresa: req.user?.empresa_id ?? null, mensagem: err.message, pilha: String(err.stack || '').split(/\r?\n/).slice(0, 6) }));
    let erro = status >= 500 ? 'Erro interno. Tente novamente.' : err.message;
    // As mensagens escrevem o topo da empresa como {topo:o}, {topo:do}…; aqui viram o nome que a empresa de quem recebe escolheu.
    if (typeof erro === 'string' && erro.includes('{topo')) {
      let v;
      try { v = req.user ? await comEmpresa(req.user.empresa_id, () => ctx.vocabularioAtual()) : completarVocabulario(null); } catch { v = completarVocabulario(null); }
      erro = resolverTopo(erro, v);
    }
    res.status(status).json({ erro, ...(status >= 500 ? { id: req.id } : {}), ...(err.extra || {}) });
  });

  return app;
}
