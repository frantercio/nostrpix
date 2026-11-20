/* ZapPix / NostrPix — Service Worker v3
   Estratégia: Cache-First para assets estáticos locais,
   Network-First para APIs externas (BTC rate, NWC relay) */

const CACHE_NAME = 'zappix-nostrpix-cache-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// CDN assets — tentamos cachear mas não bloqueamos o install se falharem
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/nostr-tools@2.7.0/lib/nostr.bundle.js',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js'
];

// URLs que nunca devem ser servidas do cache (APIs dinâmicas)
const NETWORK_ONLY = [
  'economia.awesomeapi.com.br',
  'wss://',
  'ws://'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Assets locais: obrigatórios
      await cache.addAll(STATIC_ASSETS);
      // CDN assets: opcionais (não quebra o install se offline)
      await Promise.allSettled(
        CDN_ASSETS.map(url =>
          cache.add(url).catch(() => console.warn('[SW] Não foi possível cachear:', url))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Network-only para WebSockets e APIs dinâmicas
  if (NETWORK_ONLY.some(p => url.includes(p))) {
    return; // deixa o browser tratar normalmente
  }

  // Tailwind CDN: sempre rede (gera CSS dinamicamente)
  if (url.includes('cdn.tailwindcss.com')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Cache-First para tudo mais (assets, CDN libs)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((response) => {
          // Só cacheamos respostas válidas de origens seguras
          if (
            response &&
            response.status === 200 &&
            response.type !== 'opaque' &&
            e.request.method === 'GET'
          ) {
            const toCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, toCache));
          }
          return response;
        })
        .catch(() => {
          // Fallback para a página principal se offline
          if (e.request.destination === 'document') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
