// Estado global da sessão e relógio sincronizado com o servidor (útil para demonstrações com SGC_NOW).
export const est = { user: null, boot: null, offset: 0, secoes: [] };

export const agora = () => new Date(Date.now() + est.offset);
const pad = (n) => String(n).padStart(2, '0');
export const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoje = () => isoDe(agora());
export const ehGestao = () => est.user && est.user.perfil !== 'chefe';
export const ehDiretor = () => est.user?.perfil === 'diretor';
