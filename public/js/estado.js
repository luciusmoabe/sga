// Estado global da sessão e relógio sincronizado com o servidor (útil para demonstrações com SGC_NOW).
import { dataNoFuso } from './datas.js';
export const est = { user: null, boot: null, offset: 0, secoes: [] };

export const agora = () => new Date(Date.now() + est.offset);
export const isoDe = dataNoFuso;
export const hoje = () => isoDe(agora());
export const ehGestao = () => est.user && est.user.perfil !== 'chefe';
/** Tem poderes de Diretor (aceitar, devolver e decidir): o Diretor e o Administrador. */
export const ehDiretor = () => ['diretor', 'administrador'].includes(est.user?.perfil);
export const ehAdmin = () => est.user?.perfil === 'administrador';
/** Registra e decide: Diretor, Apoio e Administrador (acesso total). */
export const podeOperar = () => ['diretor', 'apoio', 'administrador'].includes(est.user?.perfil);

export function atualizarSessao(boot) {
  est.boot = boot;
  est.user = boot.user;
  est.offset = new Date(boot.agora).getTime() - Date.now();
}
