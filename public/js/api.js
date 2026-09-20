// Cliente da API. O "login" do protótipo só guarda o id do usuário escolhido.
export const sessao = { userId: null };
try {
  sessao.userId = localStorage.getItem('agilis-usuario');
} catch { /* armazenamento indisponível: segue sem lembrar o usuário */ }

export function entrar(id) {
  sessao.userId = String(id);
  try { localStorage.setItem('agilis-usuario', String(id)); } catch { /* ignora */ }
}
export function sair() {
  sessao.userId = null;
  _cache.clear();
  try { localStorage.removeItem('agilis-usuario'); } catch { /* ignora */ }
}

// ── Cache em memória para GETs (TTL = 5 segundos) ──────────────────────────
// Evita chamadas duplicadas durante navegações rápidas entre telas.
// Invalidado automaticamente em qualquer mutação (POST/PATCH/PUT/DELETE).
const _cache = new Map();
const TTL_MS = 5_000;

function _cacheKey(caminho) {
  return `${sessao.userId}:${caminho}`;
}

function _invalidarCache() {
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
  // Serve do cache para GETs
  if (method === 'GET') {
    const cached = _getCache(caminho);
    if (cached !== null) return cached;
  }

  let r;
  try {
    r = await fetch(`/api${caminho}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': sessao.userId || '' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique se o Agilis está em execução.');
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(dados.erro || 'Algo deu errado. Tente novamente.');
    e.status = r.status;
    e.dados = dados;
    throw e;
  }

  if (method === 'GET') _setCache(caminho, dados);
  else _invalidarCache(); // mutação invalida todo o cache

  return dados;
}
export const get   = (c)         => api(c);
export const post  = (c, corpo = {}) => api(c, { method: 'POST',   corpo });
export const patch = (c, corpo = {}) => api(c, { method: 'PATCH',  corpo });
export const put   = (c, corpo = {}) => api(c, { method: 'PUT',    corpo });
export const del   = (c)         => api(c, { method: 'DELETE' });
