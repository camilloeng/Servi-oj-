const CACHE_NAME = 'servicoja-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/cadastro-cliente.html',
  '/cadastro-profissional.html',
  '/publicar-pedido.html',
  '/pedidos-profissional.html',
  '/meus-pedidos-cliente.html',
  '/chat.html',
  '/dashboard-profissional.html',
  '/perfil-publico.html',
  '/notificacoes.html',
  '/cobranca-profissional.html',
  '/manifest.json'
];

// Instala e faz cache dos arquivos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Ativa e limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Serve do cache, fallback para rede
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => caches.match('/index.html'));
    })
  );
});
