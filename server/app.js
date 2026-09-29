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
import { cabecalhosSeguranca } from './seguranca-http.js';
import { configurarAuth, instalarAuth } from './auth.js';
import { administradorAuth } from './cadastro-chefes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Monta a aplicação. As rotas ficam por assunto: estrutura (seções e usuários), ações (diretrizes,
 * ações e pedidos de prazo), semana (sessão, atualização semanal e painel) e reuniões.
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

  rotasEstrutura(app, { ...ctx, auth, adminAuth: contas });
  const { criarDiretriz, SELECT_ACAO, acaoOut } = rotasAcoes(app, ctx);
  rotasSemana(app, { ...ctx, SELECT_ACAO, acaoOut });
  rotasReunioes(app, { ...ctx, criarDiretriz });

  // ---------- Erros ----------
  app.use('/api', (req, res, next) => next(falha(404, 'Rota não encontrada.')));
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ erro: status >= 500 ? 'Erro interno. Tente novamente.' : err.message, ...(err.extra || {}) });
  });

  return app;
}
