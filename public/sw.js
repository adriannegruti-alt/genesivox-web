// Service worker per GENESIVOX — app shell offline.
//
// Strategia: rete prima, cache come riserva. Ogni pagina o file statico
// dell'app (JS, CSS, ecc.) che l'utente ha già visitato con connessione
// resta disponibile anche offline.
//
// I file di Supabase Storage (disegni di esecuzione, documenti) NON
// passano da qui: hanno un URL "firmato" che cambia ogni volta che li apri,
// quindi vengono salvati e letti a parte con la Cache Storage API diretta
// (vedi lib/cacheOffline.ts), usando il percorso del file come chiave fissa
// invece dell'URL.

const NOME_CACHE = "genesivox-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((chiavi) =>
      Promise.all(
        chiavi
          .filter((chiave) => chiave.startsWith("genesivox-shell-") && chiave !== NOME_CACHE)
          .map((chiave) => caches.delete(chiave))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;

  // Solo richieste GET dello stesso sito: lasciamo passare tutto il resto
  // (in particolare le chiamate a Supabase, che sono su un altro dominio)
  // senza toccarlo.
  if (richiesta.method !== "GET") return;
  if (new URL(richiesta.url).origin !== self.location.origin) return;

  evento.respondWith(
    fetch(richiesta)
      .then((risposta) => {
        const copia = risposta.clone();
        caches.open(NOME_CACHE).then((cache) => cache.put(richiesta, copia));
        return risposta;
      })
      .catch(() => caches.match(richiesta))
  );
});
