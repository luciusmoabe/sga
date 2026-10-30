import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { falha } from './helpers.js';
import { criarContexto } from './contexto.js';
import { rotasAcoes } from './rotas-acoes.js';
import { rotasEstrutura } from './rotas-estrutura.js';
import { rotasSemana } from './rotas-semana.js';
import { rotasReunioes } from './reunioes.js';
import { rotasAvisos } from './rotas-avisos.js';
import { rotasCabecalhoAta } from './ata-cabecalho.js';
import { cabecalhosSeguranca } from './seguranca-http.js';
import { configurarAuth, instalarAuth } from './auth.js';
import { administradorAuth } from './cadastro-chefes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Monta a aplicação. As rotas ficam por assunto: estrutura (seções e usuários), ações (diretrizes,
 * ações e pedidos de prazo), semana (sessão, atualização semanal e painel), reuniões e avisos.
 */
export function createApp(db, { auth = configurarAuth(), provedor, adminAuth } = {}) {
  const app = express();
  // Atrás do proxy da Vercel (ou de outro proxy confiável), o IP real vem de X-Forwarded-For.
  // Sem isso o limite de tentativas de login trataria todos os usuários como um só IP.
  if (process.env.VERCEL || process.env.SGC_TRUST_PROXY) app.set('trust proxy', Number(process.env.SGC_TRUST_PROXY) || 1);
  app.disable('x-powered-by');
  app.use(cabecalhosSeguranca({ https: !!auth?.secure }));
  app.use(compression({ threshold: 512 })); // gzip/brotli: reduz JSON em ~70-80%
  app.use(express.json({ limit: '200kb' }));
  // Fontes vendorizadas nunca mudam sob o mesmo nome: cache longo é seguro. Demais estáticos (JS, CSS,
  // ícones) não têm nome com hash de conteúdo — evite cache longo neles, para não servir versão antiga
  // depois de um deploy. Só vale para uso local (npm start): na Vercel os estáticos vão direto pelo
  // @vercel/static, sem passar por aqui — o cabeçalho equivalente está em vercel.json (headers). Veja VERCEL.md.
  app.use('/fontes', express.static(path.join(raiz, 'public/fontes'), { maxAge: '30d', immutable: true }));
  app.use(express.static(path.join(raiz, 'public')));

  const ctx = criarContexto(db);
  // API administrativa do Supabase (criação de contas e troca de senha); só existe no modo institucional.
  const contas = adminAuth || (auth.mode === 'supabase' ? administradorAuth(auth) : null);
  instalarAuth(app, db, auth, provedor, contas);
  // Perfil Consulta: só lê as ações. Lista fechada, para que nenhuma rota, atual ou futura, fique aberta a ele por
  // descuido. Entrar, sair e trocar a senha são atendidos antes, em instalarAuth.
  const LEITURA_CONSULTA = [/^\/bootstrap$/, /^\/acoes$/, /^\/acoes\/\d+$/, /^\/tarefas$/];
  app.use('/api', (req, res, next) => {
    if (req.user?.perfil !== 'consulta' || (req.method === 'GET' && LEITURA_CONSULTA.some((r) => r.test(req.path)))) return next();
    next(falha(403, 'O perfil Consulta só permite ler as ações dos Centros.'));
  });
  // Membro da equipe: lê as ações e tarefas da sua seção e age só no que é dele. Lista fechada, como a da Consulta: o
  // que não está aqui (relatos, reuniões, atas, combinados, estrutura, contas, aceite, validação, arquivar, redirecionar e
  // pedir prazo) responde 403 mesmo que a rota, por descuido, não confira o perfil. Quem pode o quê em cada ação é
  // decidido dentro das rotas (executa/ehAutor em rotas-acoes.js).
  const ROTAS_MEMBRO = [
    ['GET', /^\/(bootstrap|secoes|tarefas|avisos\/atual)$/],
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
  const { criarDiretriz, SELECT_ACAO, acaoOut } = rotasAcoes(app, ctx);
  rotasSemana(app, { ...ctx, SELECT_ACAO, acaoOut });
  rotasReunioes(app, { ...ctx, criarDiretriz });
  rotasAvisos(app, ctx);
  rotasCabecalhoAta(app, ctx);

  // ---------- Erros ----------
  app.use('/api', (req, res, next) => next(falha(404, 'Rota não encontrada.')));
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ erro: status >= 500 ? 'Erro interno. Tente novamente.' : err.message, ...(err.extra || {}) });
  });

  return app;
}
