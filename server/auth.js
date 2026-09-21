import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { falha, h } from './helpers.js';
import { TAM_SENHA } from '../public/js/regras.js';

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hash = valor => createHash('sha256').update(valor).digest('hex');
const aleatorio = () => randomBytes(32).toString('base64url');
const igual = (a, b) => typeof a === 'string' && typeof b === 'string'
  && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const segundos = () => Math.floor(Date.now() / 1000); // Segurança usa relógio real, nunca SGC_NOW.
// A sessão vale por 1 h sem atividade e é renovada ao usar o sistema, até 8 h desde o login.
export const SESSAO_OCIOSA = 3600;
export const SESSAO_MAXIMA = 8 * 3600;

export function origemValida(valor, { permitirLocal = false } = {}) {
  let url;
  try { url = new URL(valor); } catch { throw new Error('Informe uma origem válida.'); }
  const local = permitirLocal && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('Informe uma origem HTTPS sem caminho ou credenciais.');
  return url.origin;
}

export function configurarAuth(env = process.env) {
  const mode = env.SGC_AUTH_MODE || 'supabase';
  if (mode === 'demo') {
    if (env.NODE_ENV === 'production' || env.VERCEL) throw new Error('Login de demonstração é proibido em produção.');
    return { mode };
  }
  if (mode !== 'supabase') throw new Error('SGC_AUTH_MODE deve ser supabase ou demo.');
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key || !env.SGC_PUBLIC_ORIGIN) {
    throw new Error('Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) e SGC_PUBLIC_ORIGIN.');
  }
  let anon = false;
  try { anon = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* não é chave legada */ }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anon) throw new Error('Use chave publishable ou anon; chaves administrativas não são aceitas no login.');
  const permitirLocal = env.NODE_ENV !== 'production' && !env.VERCEL;
  const origin = origemValida(env.SGC_PUBLIC_ORIGIN, { permitirLocal });
  const supabaseUrl = origemValida(env.SUPABASE_URL, { permitirLocal });
  return { mode, origin, supabaseUrl, key, secure: origin.startsWith('https:') };
}

export function criarProvedorSupabase(config, { fetchImpl = fetch } = {}) {
  const consultar = async (caminho, opcoes = {}) => {
    let resposta;
    try {
      resposta = await fetchImpl(`${config.supabaseUrl}/auth/v1${caminho}`, {
        ...opcoes, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: config.key, 'content-type': 'application/json', ...opcoes.headers },
      });
    } catch { throw falha(503, 'Login indisponível no momento. Tente novamente mais tarde.'); }
    if (resposta.status === 429) throw falha(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
    if (resposta.status >= 500) throw falha(503, 'Login indisponível no momento. Tente novamente mais tarde.');
    if (!resposta.ok) throw falha(401, 'E-mail, senha ou acesso inválidos.');
    try { return await resposta.json(); } catch { throw falha(503, 'Login indisponível no momento.'); }
  };
  return {
    async autenticar(email, senha) {
      const dados = await consultar('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: senha }) });
      if (typeof dados.access_token !== 'string' || !Number.isFinite(dados.expires_in) || dados.expires_in <= 0) {
        throw falha(503, 'Login indisponível no momento.');
      }
      const user = await consultar('/user', { headers: { authorization: `Bearer ${dados.access_token}` } });
      if (!GUID.test(user.id) || user.is_anonymous || !user.email_confirmed_at || user.id !== dados.user?.id) {
        throw falha(401, 'E-mail, senha ou acesso inválidos.');
      }
      // Tokens e senha são descartados. Só emitimos nossa própria sessão opaca.
      return { subject: user.id.toLowerCase(), expires: segundos() + Math.min(dados.expires_in, 3600) };
    },
  };
}

async function limitarTentativas(db, email, ip) {
  const agora = segundos(), janela = Math.floor(agora / 900) * 900;
  const bloqueado = await db.transaction(async () => {
    await db.prepare('delete from auth_tentativas where janela < ?').run(janela);
    let excedeu = false;
    for (const [tipo, valor, limite] of [['conta', email, 10], ['origem', ip, 100]]) {
      const id = hash(`${tipo}:${valor}`);
      await db.prepare(`insert into auth_tentativas (id, janela, tentativas) values (?, ?, 1)
        on conflict(id) do update set janela = excluded.janela,
        tentativas = case when auth_tentativas.janela = excluded.janela then auth_tentativas.tentativas + 1 else 1 end`).run(id, janela);
      const r = await db.prepare('select tentativas from auth_tentativas where id = ?').get(id);
      if (r.tentativas > limite) excedeu = true;
    }
    return excedeu;
  });
  if (bloqueado) throw falha(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
}

function cookie(req, nome) {
  const valores = (req.headers.cookie || '').split(';').map(c => c.trim()).filter(c => c.startsWith(`${nome}=`));
  if (valores.length !== 1) return '';
  const valor = valores[0].slice(nome.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(valor) ? valor : '';
}

// Enquanto a senha inicial não for trocada, só estas rotas respondem.
const LIBERADAS_NA_TROCA = new Set(['GET /bootstrap', 'POST /auth/sair', 'POST /auth/trocar-senha']);

export function instalarAuth(app, db, config, provedor, contas) {
  const q1 = (sql, ...args) => db.prepare(sql).get(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  app.get('/api/auth/config', (req, res) => res.json({ modo: config.mode }));
  if (config.mode === 'demo') {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new Error('Login de demonstração é proibido em produção.');
    app.get('/api/usuarios-demo', h(() => db.prepare(`select u.id, u.nome, u.perfil, u.secao_id, s.nome as secao_nome, s.sigla as secao_sigla
      from usuarios u left join secoes s on s.id = u.secao_id where u.ativo = 1
      order by case u.perfil when 'diretor' then 0 when 'apoio' then 1 when 'administrador' then 2 else 3 end, u.nome`).all()));
    app.use('/api', async (req, res, next) => {
      try {
        const valor = req.get('x-user-id') || '';
        const u = /^\d+$/.test(valor) ? await q1('select * from usuarios where id = ? and ativo = 1', Number(valor)) : null;
        if (!u) throw falha(401, 'Escolha um usuário para entrar.');
        req.user = u;
        next();
      } catch (err) { next(err); }
    });
    return;
  }
  const supabase = provedor || criarProvedorSupabase(config);
  const sessaoCookie = config.secure ? '__Host-sgc_senha' : 'sgc_senha';
  const opcoes = { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' };
  app.get('/api/usuarios-demo', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  // A integração OAuth anterior foi removida, inclusive seus endpoints públicos.
  app.get(['/api/auth/entrar', '/api/auth/retorno'], (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.post('/api/auth/entrar', h(async (req, res) => {
    if (req.get('origin') !== config.origin || !req.is('application/json')) throw falha(403, 'Requisição de login inválida.');
    const { email, senha } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || typeof senha !== 'string' || !senha.length || senha.length > 1024) throw falha(400, 'Informe e-mail e senha válidos.');
    const normalizado = email.trim().toLowerCase();
    await limitarTentativas(db, normalizado, req.ip || 'desconhecido');
    let identidade;
    try { identidade = await supabase.autenticar(normalizado, senha); }
    catch (err) {
      if (err.status === 429) throw falha(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
      if (err.status === 401) throw falha(401, 'E-mail, senha ou acesso inválidos.');
      throw falha(503, 'Login indisponível no momento. Tente novamente mais tarde.');
    }
    if (!GUID.test(identidade.subject) || !Number.isFinite(identidade.expires) || identidade.expires <= segundos()) {
      throw falha(401, 'E-mail, senha ou acesso inválidos.');
    }
    const token = aleatorio(), csrf = aleatorio();
    const expira = Math.min(identidade.expires, segundos() + SESSAO_OCIOSA);
    await db.transaction(async () => {
      const vinculo = await q1(`select c.id from auth_contas c join usuarios u on u.id = c.usuario_id
        where c.projeto = ? and c.subject = ? and u.ativo = 1`, config.supabaseUrl, identidade.subject);
      if (!vinculo) throw falha(401, 'E-mail, senha ou acesso inválidos.');
      await run('delete from auth_sessoes_senha where expira_em <= ?', segundos());
      const anterior = cookie(req, sessaoCookie);
      if (anterior) await run('delete from auth_sessoes_senha where id = ?', hash(anterior));
      await run('insert into auth_sessoes_senha (id, conta_id, csrf, expira_em, criada_em) values (?, ?, ?, ?, ?)', hash(token), vinculo.id, csrf, expira, segundos());
    });
    res.cookie(sessaoCookie, token, { ...opcoes, maxAge: (expira - segundos()) * 1000 });
    return { ok: true, csrf };
  }));
  app.use('/api', async (req, res, next) => {
    try {
      const token = cookie(req, sessaoCookie);
      const sessao = token ? await q1(`select s.id, s.csrf, s.expira_em, s.criada_em, i.usuario_id from auth_sessoes_senha s
        join auth_contas i on i.id = s.conta_id where s.id = ? and s.expira_em > ? and i.projeto = ?`,
      hash(token), segundos(), config.supabaseUrl) : null;
      const u = sessao ? await q1('select * from usuarios where id = ? and ativo = 1', sessao.usuario_id) : null;
      if (!u) throw falha(401, 'Entre com seu e-mail e senha.');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)
        && (req.get('origin') !== config.origin || !igual(req.get('x-csrf-token'), sessao.csrf))) {
        throw falha(403, 'Requisição inválida. Atualize a página e tente novamente.');
      }
      // Renova só quando falta menos da metade da janela: no máximo uma gravação a cada 30 min por sessão.
      const agora = segundos();
      if (sessao.criada_em > 0 && sessao.expira_em - agora < SESSAO_OCIOSA / 2) {
        const nova = Math.min(agora + SESSAO_OCIOSA, sessao.criada_em + SESSAO_MAXIMA);
        if (nova > sessao.expira_em) {
          await run('update auth_sessoes_senha set expira_em = ? where id = ?', nova, sessao.id);
          res.cookie(sessaoCookie, token, { ...opcoes, maxAge: (nova - agora) * 1000 });
          sessao.expira_em = nova;
        }
      }
      req.user = u;
      req.csrf = sessao.csrf;
      req.authSession = sessao.id;
      if (u.trocar_senha && !LIBERADAS_NA_TROCA.has(`${req.method} ${req.path}`)) {
        const e = falha(403, 'Troque a senha inicial antes de continuar.');
        e.extra = { trocar_senha: true };
        throw e;
      }
      next();
    } catch (err) { next(err); }
  });
  // Troca da própria senha. Vale para a troca obrigatória do primeiro acesso e para qualquer troca voluntária.
  // Confirma a senha atual no Supabase e a grava pela API administrativa; as demais sessões da conta são encerradas.
  app.post('/api/auth/trocar-senha', h(async (req) => {
    const { senha_atual: atual, senha_nova: nova } = req.body || {};
    if (typeof atual !== 'string' || !atual.length || atual.length > 1024) throw falha(400, 'Informe a senha atual.');
    if (typeof nova !== 'string' || nova.length < TAM_SENHA.min || nova.length > TAM_SENHA.max) {
      throw falha(400, `A nova senha deve ter entre ${TAM_SENHA.min} e ${TAM_SENHA.max} caracteres.`);
    }
    if (nova === atual) throw falha(400, 'A nova senha precisa ser diferente da atual.');
    if (!contas) throw falha(503, 'Troca de senha indisponível: o servidor não tem a configuração administrativa do Supabase.');
    const conta = await q1('select id, subject from auth_contas where usuario_id = ? and projeto = ?', req.user.id, config.supabaseUrl);
    const email = (req.user.email || '').toLowerCase();
    if (!conta || !email) throw falha(409, 'Esta conta não tem login vinculado. Peça ao administrador.');
    await limitarTentativas(db, email, req.ip || 'desconhecido');
    let identidade;
    try { identidade = await supabase.autenticar(email, atual); }
    catch (err) {
      if (err.status === 429) throw falha(429, 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
      if (err.status === 401) throw falha(400, 'A senha atual não confere.');
      throw falha(503, 'Troca de senha indisponível no momento. Tente novamente mais tarde.');
    }
    if (identidade.subject !== conta.subject) throw falha(400, 'A senha atual não confere.');
    await contas.atualizar(conta.subject, { password: nova });
    await db.transaction(async () => {
      await run('update usuarios set trocar_senha = 0 where id = ?', req.user.id);
      await run('delete from auth_sessoes_senha where conta_id = ? and id != ?', conta.id, req.authSession);
    });
    return { ok: true };
  }));
  app.post('/api/auth/sair', h(async (req, res) => {
    await run('delete from auth_sessoes_senha where id = ?', req.authSession);
    res.clearCookie(sessaoCookie, opcoes);
    return { ok: true };
  }));
}
