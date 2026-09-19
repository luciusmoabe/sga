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
  try { localStorage.removeItem('agilis-usuario'); } catch { /* ignora */ }
}

export async function api(caminho, { method = 'GET', corpo } = {}) {
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
  return dados;
}
export const get = (c) => api(c);
export const post = (c, corpo = {}) => api(c, { method: 'POST', corpo });
export const patch = (c, corpo = {}) => api(c, { method: 'PATCH', corpo });
export const put = (c, corpo = {}) => api(c, { method: 'PUT', corpo });
export const del = (c) => api(c, { method: 'DELETE' });
