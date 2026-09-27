// Salva e legge file (disegni di esecuzione, documenti) in una cache locale
// sul dispositivo, usando il PERCORSO del file (storage_path) come chiave
// fissa — non l'URL firmato di Supabase, che cambia ogni volta che lo apri
// e quindi non può funzionare come chiave stabile.
//
// Va chiamato così:
//   - quando il file viene aperto CON connessione: salvaFileOffline(...)
//     dopo averlo scaricato, così resta disponibile per la prossima volta.
//   - quando il file viene aperto SENZA connessione: leggiFileOffline(...)
//     per recuperarlo, se era già stato salvato in precedenza.

const NOME_CACHE_FILE = "genesivox-file-offline-v1";

function chiaveCache(storagePath: string): Request {
  // URL "finto" e stabile, usato solo come chiave interna della cache.
  return new Request(`https://cache-locale.genesivox/file/${storagePath}`);
}

export async function salvaFileOffline(storagePath: string, blob: Blob): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await caches.open(NOME_CACHE_FILE);
    await cache.put(chiaveCache(storagePath), new Response(blob));
  } catch {
    // Se il salvataggio in cache fallisce (es. spazio esaurito sul
    // dispositivo), non blocchiamo la visualizzazione online del file.
  }
}

export async function leggiFileOffline(storagePath: string): Promise<Blob | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    const cache = await caches.open(NOME_CACHE_FILE);
    const risposta = await cache.match(chiaveCache(storagePath));
    if (!risposta) return null;
    return await risposta.blob();
  } catch {
    return null;
  }
}

// Utile in futuro per mostrare "quanti disegni hai già scaricati per
// l'offline" o per liberare spazio: elenca i percorsi salvati.
export async function elencaFileOffline(): Promise<string[]> {
  if (typeof window === "undefined" || !("caches" in window)) return [];
  try {
    const cache = await caches.open(NOME_CACHE_FILE);
    const richieste = await cache.keys();
    return richieste.map((r) => decodeURIComponent(r.url.replace("https://cache-locale.genesivox/file/", "")));
  } catch {
    return [];
  }
}
