// Service worker do Agilis. Duas funções, e só estas:
//  1) existir, para o navegador considerar o Agilis instalável como aplicativo;
//  2) receber os avisos no celular (Web Push) e abrir a tela certa quando a pessoa toca neles.
//
// Não guarda nada em cache, de propósito — o sistema tem sessão, permissões e regras de negócio que mudam; servir uma versão
// antiga por engano seria pior que não ter cache nenhum. Toda requisição (páginas, módulos JS e /api) segue direto para a rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));
// Precisa existir para o navegador oferecer "Instalar app"; sem respondWith, a requisição segue normalmente.
self.addEventListener('fetch', () => {});

// Aviso recebido: { titulo, corpo, url }. A mensagem nunca traz dados das ações, só o texto do lembrete.
self.addEventListener('push', (evento) => {
  let dados = {};
  try { dados = evento.data ? evento.data.json() : {}; } catch { /* mensagem sem JSON: mostra o aviso genérico */ }
  evento.waitUntil(self.registration.showNotification(String(dados.titulo || 'Agilis').slice(0, 120), {
    body: String(dados.corpo || '').slice(0, 300),
    icon: '/imagens/icon-192.png',
    badge: '/imagens/icon-192.png',
    tag: 'agilis-aviso',  // um aviso novo substitui o anterior, em vez de empilhar
    renotify: true,
    data: { url: typeof dados.url === 'string' ? dados.url : '/' },
  }));
});

// Toque no aviso: foca o Agilis se já estiver aberto (indo para a tela do aviso) ou abre uma janela nova.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin);
  const alvo = destino.origin === self.location.origin ? destino.href : self.location.origin + '/'; // só dentro do próprio site
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((j) => new URL(j.url).origin === self.location.origin);
    if (aberta) {
      await aberta.focus();
      try { await aberta.navigate(alvo); } catch { /* alguns navegadores não deixam: a janela já está em foco */ }
      return;
    }
    await self.clients.openWindow(alvo);
  })());
});
