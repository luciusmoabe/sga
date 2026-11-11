// Avisos no celular (Web Push): ativar neste aparelho, desativar e testar. O servidor está em server/push.js.
//
// Regras do navegador que a tela precisa respeitar:
//   - o pedido de permissão só funciona a partir de um toque do usuário (por isso é um botão, nunca automático);
//   - no iPhone/iPad os avisos só existem com o app INSTALADO na tela inicial (iOS 16.4 ou mais novo), aberto por esse ícone;
//   - se o usuário bloquear os avisos, só ele reverte, nas configurações do navegador ou do aparelho.
import { get, post } from './api.js';
import { $, abrirForm, esc, toast } from './ui.js';

const PERFIS_COM_AVISO = ['diretor', 'apoio', 'chefe', 'administrador'];
export const recebeAvisos = (perfil) => PERFIS_COM_AVISO.includes(perfil);

const rodandoComoApp = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const CHAVE_LEMBRADO = 'agilis-avisos-usuario';
const lembrar = (id) => { try { if (id == null) localStorage.removeItem(CHAVE_LEMBRADO); else localStorage.setItem(CHAVE_LEMBRADO, String(id)); } catch { /* sem armazenamento: segue sem lembrar */ } };
const lembrado = () => { try { return localStorage.getItem(CHAVE_LEMBRADO); } catch { return null; } };

/** Chave pública VAPID (base64url) no formato que `subscribe` pede. */
export function chaveParaBinario(base64url) {
  const preenchida = base64url + '='.repeat((4 - (base64url.length % 4)) % 4);
  const bruto = atob(preenchida.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

const registro = () => navigator.serviceWorker.ready;
const assinaturaAtual = async () => (await registro()).pushManager.getSubscription();

/**
 * Situação dos avisos neste aparelho:
 *  nao-suportado | instalar (iPhone sem o app instalado) | indisponivel (servidor sem chaves) | bloqueado | pronto | ativo
 */
export async function estadoAvisos() {
  if (!suportado()) return { estado: ehIOS() && !rodandoComoApp() ? 'instalar' : 'nao-suportado' };
  let cfg;
  try { cfg = await get('/push/config'); } catch { return { estado: 'indisponivel' }; }
  if (!cfg.disponivel) return { estado: 'indisponivel' };
  if (Notification.permission === 'denied') return { estado: 'bloqueado' };
  const sub = Notification.permission === 'granted' ? await assinaturaAtual() : null;
  if (sub) {
    const c = await get(`/push/config?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (c.ativo) return { estado: 'ativo' };
  }
  return { estado: 'pronto', chave: cfg.chavePublica };
}

/** Pede a permissão e liga os avisos. Chame a partir de um toque do usuário. */
export async function ativarAvisos(chave, usuarioId) {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('Os avisos não foram permitidos. Para ativá-los, libere as notificações do Agilis nas configurações do navegador ou do aparelho.');
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  const opcoes = { userVisibleOnly: true, applicationServerKey: chaveParaBinario(chave) };
  try { sub = sub || await reg.pushManager.subscribe(opcoes); }
  catch { // assinatura antiga com outra chave do servidor: descarta e refaz
    await sub?.unsubscribe();
    sub = await reg.pushManager.subscribe(opcoes);
  }
  await post('/push/assinar', { assinatura: sub.toJSON() });
  lembrar(usuarioId);
}

/** Desliga os avisos neste aparelho (o servidor esquece o aparelho e o navegador cancela a assinatura). */
export async function desativarAvisos() {
  lembrar(null);
  if (!suportado()) return;
  const sub = await assinaturaAtual();
  if (!sub) return;
  try { await post('/push/cancelar', { endpoint: sub.endpoint }); } catch { /* o servidor limpa sozinho quando o aparelho some */ }
  await sub.unsubscribe();
}

/**
 * Ao sair da conta: o aparelho deixa de receber os avisos dessa pessoa (num aparelho compartilhado, o próximo a entrar não
 * veria os avisos do anterior). A assinatura do navegador fica; ao entrar de novo a mesma pessoa, `restaurarAvisos` a religa.
 */
export async function esquecerAvisosAoSair() {
  if (!suportado()) return;
  try {
    const sub = await assinaturaAtual();
    if (sub) await post('/push/cancelar', { endpoint: sub.endpoint });
  } catch { /* sair não pode falhar por causa disso */ }
}

/** Ao entrar: se esta pessoa já ativou os avisos neste aparelho, religa em silêncio (sem pedir nada). */
export async function restaurarAvisos(usuarioId) {
  try {
    if (!suportado() || Notification.permission !== 'granted' || lembrado() !== String(usuarioId)) return;
    const sub = await assinaturaAtual();
    if (!sub) return;
    const cfg = await get(`/push/config?endpoint=${encodeURIComponent(sub.endpoint)}`);
    if (cfg.disponivel && !cfg.ativo) await post('/push/assinar', { assinatura: sub.toJSON() });
  } catch { /* é um favor: se falhar, o botão "Avisos no celular" continua disponível */ }
}

const TEXTOS = {
  'nao-suportado': 'Este navegador não permite avisos no celular. Tente o Chrome (Android) ou o Safari (iPhone) atualizados.',
  instalar: 'No iPhone e no iPad os avisos só funcionam com o Agilis instalado: toque em Compartilhar, depois em "Adicionar à Tela de Início", e abra o Agilis pelo ícone novo. Depois volte aqui.',
  indisponivel: 'Os avisos no celular ainda não foram ativados neste sistema. Fale com quem administra o Agilis.',
  bloqueado: 'Os avisos estão bloqueados neste aparelho. Para usá-los, libere as notificações do Agilis nas configurações do navegador (ou do aparelho) e volte aqui.',
  pronto: 'Receba no celular o lembrete de enviar a atualização da semana (sexta 15h e segunda 12h) e, para quem conduz a reunião, o resumo de quem não enviou (segunda 18h). Nenhum dado das ações vai na mensagem.',
  ativo: 'Os avisos estão ativos neste aparelho. Use o teste para conferir que chegam.',
};

/** Tela "Avisos no celular": mostra a situação deste aparelho e o botão certo para ela. */
export async function abrirAvisosNoCelular(usuarioId) {
  const dlg = abrirForm({
    titulo: 'Avisos no celular',
    corpo: '<div id="avisos-conteudo" aria-live="polite"><p class="suave">Verificando este aparelho…</p></div>',
    semEnvio: true, cancelar: 'Fechar',
  });
  const area = $('#avisos-conteudo', dlg);
  const pintar = async () => {
    let e;
    try { e = await estadoAvisos(); } catch (ex) { e = { estado: 'indisponivel' }; }
    const botoes = e.estado === 'pronto' ? '<button type="button" class="btn btn-primario" data-avisos="ativar">Ativar avisos neste aparelho</button>'
      : e.estado === 'ativo' ? '<button type="button" class="btn btn-sec" data-avisos="testar">Enviar um aviso de teste</button> <button type="button" class="btn btn-fantasma" data-avisos="desativar">Desativar neste aparelho</button>' : '';
    area.innerHTML = `<p>${esc(TEXTOS[e.estado])}</p><div class="linha" style="margin-top:12px;flex-wrap:wrap;gap:8px">${botoes}</div>`;
    area.dataset.chave = e.chave || '';
  };
  area.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-avisos]');
    if (!b) return;
    b.disabled = true;
    b.textContent = b.dataset.avisos === 'ativar' ? 'Ativando…' : b.dataset.avisos === 'testar' ? 'Enviando…' : 'Desativando…'; // o serviço do navegador pode levar alguns segundos
    try {
      if (b.dataset.avisos === 'ativar') { await ativarAvisos(area.dataset.chave, usuarioId); toast('Avisos ativados neste aparelho.'); }
      else if (b.dataset.avisos === 'desativar') { await desativarAvisos(); toast('Avisos desativados neste aparelho.'); }
      else { const r = await post('/push/teste'); toast(r.entregues > 1 ? 'Aviso de teste enviado aos seus aparelhos.' : 'Aviso de teste enviado. Ele deve chegar em instantes.'); }
    } catch (ex) { toast(ex.message, 'erro'); }
    await pintar();
  });
  await pintar();
  return dlg;
}

// ---------- Lembretes com o app aberto (sem agendador) ----------
// Enquanto o Agilis está aberto, a tela pergunta ao servidor se há lembrete na hora (atualização da semana, últimas horas,
// fechamento). Cada um chega uma vez por semana. Aparece uma faixa na tela e, se a pessoa permitiu notificações, também o aviso do aparelho.
const INTERVALO_LEMBRETES = 5 * 60 * 1000;
let relogioLembretes = null;

function mostrarLembrete(a) {
  const el = document.createElement('div');
  el.className = 'toast lembrete-app';
  el.setAttribute('role', 'status');
  el.innerHTML = `<b>${esc(a.titulo)}</b><br>${esc(a.corpo)} <a href="${esc(a.url)}">Abrir</a> <button type="button" class="btn btn-fantasma btn-mini" aria-label="Fechar o lembrete">Fechar</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  el.querySelector('a').addEventListener('click', () => el.remove());
  $('#toasts').append(el);
  try {
    if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification(a.titulo, { body: a.corpo, icon: '/imagens/icon-192.png', badge: '/imagens/icon-192.png', tag: 'agilis-aviso', data: { url: a.url } }));
    }
  } catch { /* o aviso na tela já foi mostrado */ }
}

async function verificarLembretes() {
  try { for (const a of (await post('/lembretes/verificar')).avisos || []) mostrarLembrete(a); } catch { /* sem rede ou sessão vencida: tenta na próxima */ }
}

/** Liga a verificação enquanto o app estiver aberto: ao entrar, a cada 5 minutos e ao voltar para a aba. */
export function iniciarLembretesDoApp(perfil) {
  pararLembretesDoApp();
  if (!recebeAvisos(perfil)) return;
  verificarLembretes();
  relogioLembretes = setInterval(() => { if (!document.hidden) verificarLembretes(); }, INTERVALO_LEMBRETES);
  document.addEventListener('visibilitychange', aoVoltar);
}
const aoVoltar = () => { if (!document.hidden) verificarLembretes(); };
export function pararLembretesDoApp() {
  clearInterval(relogioLembretes); relogioLembretes = null;
  document.removeEventListener('visibilitychange', aoVoltar);
}
