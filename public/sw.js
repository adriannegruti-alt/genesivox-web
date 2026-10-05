// Service worker per GENESIVOX — app shell offline + notifiche push.
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

// ---------------------------------------------------------------------------
// Notifiche push
// ---------------------------------------------------------------------------

// Arriva una notifica dal server: la mostriamo, anche se l'app è chiusa.
self.addEventListener("push", (evento) => {
  let dati = {};
  try {
    dati = evento.data ? evento.data.json() : {};
  } catch (e) {
    dati = { titolo: "GENESIVOX", testo: evento.data ? evento.data.text() : "" };
  }

  const titolo = dati.titolo || "GENESIVOX";
  const opzioni = {
    body: dati.testo || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: dati.url || "/" },
  };

  evento.waitUntil(self.registration.showNotification(titolo, opzioni));
});

// L'utente tocca la notifica: apriamo (o riportiamo in primo piano)
// la pagina indicata.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const indirizzo = (evento.notification.data && evento.notification.data.url) || "/";
  const urlCompleto = new URL(indirizzo, self.location.origin).href;

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
      for (const finestra of finestre) {
        if (finestra.url === urlCompleto && "focus" in finestra) return finestra.focus();
      }
      return self.clients.openWindow(urlCompleto);
    })
  );
});
