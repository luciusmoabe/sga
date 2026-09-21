// Login por e-mail e senha usa cookie HttpOnly; IDs locais só existem no modo demo.
export const sessao = { userId: null, modo: null, csrf: null, geracao: 0 };
let configuracao;
export function modoAuth() {
  return configuracao ||= fetch('/api/auth/config', { cache: 'no-store' }).then(async r => {
    if (!r.ok) throw new Error('Não foi possível consultar a configuração de acesso.');
    const { modo } = await r.json();
    if (!['demo', 'supabase'].includes(modo)) throw new Error('Configuração de acesso inválida.');
    sessao.modo = modo;
    return modo;
  }).catch(e => { configuracao = null; throw e; });
}
try {
  sessao.userId = localStorage.getItem('agilis-usuario');
} catch { /* armazenamento indisponível: segue sem lembrar o usuário */ }

export function entrar(id) {
  if (sessao.modo !== 'demo') return;
  sessao.geracao++;
  _cache.clear();
  sessao.userId = String(id);
  try { localStorage.setItem('agilis-usuario', String(id)); } catch { /* ignora */ }
}
export function limparSessao() {
  sessao.geracao++;
  sessao.csrf = null;
  sessao.userId = null;
  _cache.clear();
  try { localStorage.removeItem('agilis-usuario'); } catch { /* ignora */ }
}
export async function entrarSenha(email, senha) {
  const dados = await post('/auth/entrar', { email, senha });
  limparSessao();
  sessao.csrf = dados.csrf;
}
export async function sair() {
  if (sessao.modo === 'supabase') {
    try { await post('/auth/sair'); }
    catch (e) { if (e.status !== 401) throw e; }
  }
  limparSessao();
  // Saída explícita: apaga rascunhos desta aba (a queda por expiração os preserva de propósito).
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('agilis-rascunho:')) sessionStorage.removeItem(k);
  } catch { /* ignora */ }
}

// ── Cache em memória para GETs (TTL = 5 segundos) ──────────────────────────
// Evita chamadas duplicadas durante navegações rápidas entre telas.
// Invalidado automaticamente em qualquer mutação (POST/PATCH/PUT/DELETE).
const _cache = new Map();
const TTL_MS = 5_000;

function _cacheKey(caminho) {
  return `${sessao.geracao}:${sessao.userId}:${caminho}`;
}

/** Contador de mutações: quem guarda dados derivados do servidor (ex.: o bootstrap) sabe quando revalidar. */
export const versao = { mutacoes: 0 };

function _invalidarCache() {
  versao.mutacoes++;
  _cache.clear();
}

function _getCache(caminho) {
  const entry = _cache.get(_cacheKey(caminho));
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { _cache.delete(_cacheKey(caminho)); return null; }
  return entry.dados;
}

function _setCache(caminho, dados) {
  _cache.set(_cacheKey(caminho), { dados, ts: Date.now() });
}
// ────────────────────────────────────────────────────────────────────────────

export async function api(caminho, { method = 'GET', corpo } = {}) {
  const geracao = sessao.geracao;
  // Serve do cache para GETs
  if (method === 'GET') {
    const cached = _getCache(caminho);
    if (cached !== null) return cached;
  }

  let r;
  try {
    r = await fetch(`/api${caminho}`, {
      method,
      cache: 'no-store', credentials: 'same-origin',
      headers: { 'content-type': 'application/json',
        ...(sessao.modo === 'demo' ? { 'x-user-id': sessao.userId || '' } : {}),
        ...(sessao.csrf ? { 'x-csrf-token': sessao.csrf } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique se o Agilis está em execução.');
  }
  const dados = await r.json().catch(() => ({}));
  if (geracao !== sessao.geracao) throw new Error('A sessão mudou. Atualize a tela.');
  if (!r.ok) {
    const e = new Error(dados.erro || 'Algo deu errado. Tente novamente.');
    e.status = r.status;
    e.dados = dados;
    throw e;
  }

  if (caminho === '/bootstrap') sessao.csrf = dados.csrf || null;
  if (method === 'GET') _setCache(caminho, dados);
  else _invalidarCache(); // mutação invalida todo o cache

  return dados;
}
export const get   = (c)         => api(c);
export const post  = (c, corpo = {}) => api(c, { method: 'POST',   corpo });
export const patch = (c, corpo = {}) => api(c, { method: 'PATCH',  corpo });
export const put   = (c, corpo = {}) => api(c, { method: 'PUT',    corpo });
export const del   = (c)         => api(c, { method: 'DELETE' });
