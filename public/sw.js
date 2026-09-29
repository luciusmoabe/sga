// Service worker mínimo: existe só para o navegador considerar o Agilis instalável como aplicativo.
// Não guarda nada em cache, de propósito — o sistema tem sessão, permissões e regras de negócio que
// mudam; servir uma versão antiga por engano seria pior que não ter cache nenhum. Toda requisição
// (páginas, módulos JS e /api) segue direto para a rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));
// Precisa existir para o navegador oferecer "Instalar app"; sem respondWith, a requisição segue normalmente.
self.addEventListener('fetch', () => {});
