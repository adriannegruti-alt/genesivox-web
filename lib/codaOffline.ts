// Coda di invio e copia locale dei dati, per usare l'app anche senza connessione.
//
// Come funziona:
//  - Quando l'utente salva qualcosa (voce di diario, attività, verbale), l'operazione viene
//    SEMPRE messa prima nella coda del dispositivo (IndexedDB) e poi inviata appena possibile.
//    Così il percorso è uno solo, sia con sia senza connessione.
//  - Ogni operazione ha un identificativo creato sul dispositivo: se un invio viene ripetuto
//    (connessione che cade a metà) non si creano doppioni.
//  - Le ultime liste caricate con connessione restano in una copia locale, per rivederle offline.

import { supabase } from "@/lib/supabaseClient";

const NOME_DB = "genesivox-offline";
const VERSIONE_DB = 1;

export type TipoOperazione = "diario_nuova" | "attivita_nuova" | "attivita_stato" | "verbale_nuovo";

export type Operazione = {
  id: string;
  tipo: TipoOperazione;
  cantiereId: string;
  etichetta: string; // testo breve mostrato all'utente
  payload: any;
  foto?: Blob[];
  fotoCaricate?: string[];
  creatoIl: number;
  stato: "in_attesa" | "errore";
  tentativi: number;
  ultimoErrore?: string;
};

type Esito = { esito: "ok" } | { esito: "rete" } | { esito: "errore"; messaggio: string };

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

function apriDb(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    if (typeof indexedDB === "undefined") {
      rifiuta(new Error("IndexedDB non disponibile"));
      return;
    }
    const richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result;
      if (!db.objectStoreNames.contains("coda")) db.createObjectStore("coda", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache", { keyPath: "chiave" });
    };
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}

async function operazioneDb<T>(
  archivio: "coda" | "cache",
  modo: IDBTransactionMode,
  azione: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await apriDb();
  return new Promise<T>((risolvi, rifiuta) => {
    const transazione = db.transaction(archivio, modo);
    const richiesta = azione(transazione.objectStore(archivio));
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
    transazione.oncomplete = () => db.close();
    transazione.onabort = () => rifiuta(transazione.error);
  });
}

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------

export function nuovoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // riserva per browser molto vecchi
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function inOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function eErroreDiRete(e: unknown): boolean {
  const testo = e instanceof Error ? e.message : typeof e === "string" ? e : (e as any)?.message || "";
  return e instanceof TypeError || /failed to fetch|network|load failed|fetch failed|timeout|offline/i.test(String(testo));
}

// L'utente connesso, letto dal dispositivo (non dal server): funziona anche senza rete.
export async function utenteLocale(): Promise<{ id: string; email: string } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const u = data?.session?.user;
    if (u) {
      const ris = { id: u.id, email: u.email || "" };
      try {
        localStorage.setItem("gx_utente", JSON.stringify(ris));
      } catch {}
      return ris;
    }
  } catch {}
  // Senza sessione valida: se siamo offline usiamo l'ultimo utente noto su questo dispositivo
  if (inOffline()) {
    try {
      const grezzo = localStorage.getItem("gx_utente");
      if (grezzo) return JSON.parse(grezzo);
    } catch {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// Copia locale dei dati
// ---------------------------------------------------------------------------

export async function salvaCache(chiave: string, valore: any): Promise<void> {
  try {
    await operazioneDb("cache", "readwrite", (s) => s.put({ chiave, valore, aggiornato: Date.now() }));
  } catch {}
}

export async function leggiCache<T = any>(chiave: string): Promise<{ valore: T; aggiornato: number } | null> {
  try {
    const r: any = await operazioneDb("cache", "readonly", (s) => s.get(chiave));
    return r ? { valore: r.valore as T, aggiornato: r.aggiornato as number } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Coda
// ---------------------------------------------------------------------------

const ascoltatori = new Set<() => void>();

export function iscriviCoda(callback: () => void): () => void {
  ascoltatori.add(callback);
  return () => ascoltatori.delete(callback);
}

function avvisaCambiamento() {
  ascoltatori.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export async function accoda(
  op: Omit<Operazione, "creatoIl" | "stato" | "tentativi">
): Promise<void> {
  const completa: Operazione = { ...op, creatoIl: Date.now(), stato: "in_attesa", tentativi: 0 };
  await operazioneDb("coda", "readwrite", (s) => s.put(completa));
  avvisaCambiamento();
}

async function salvaOperazione(op: Operazione): Promise<void> {
  await operazioneDb("coda", "readwrite", (s) => s.put(op));
}

export async function elencaCoda(cantiereId?: string): Promise<Operazione[]> {
  try {
    const tutte = (await operazioneDb<Operazione[]>("coda", "readonly", (s) => s.getAll())) || [];
    return tutte
      .filter((o) => !cantiereId || o.cantiereId === cantiereId)
      .sort((a, b) => a.creatoIl - b.creatoIl);
  } catch {
    return [];
  }
}

export async function rimuoviOperazione(id: string): Promise<void> {
  try {
    await operazioneDb("coda", "readwrite", (s) => s.delete(id));
  } catch {}
  avvisaCambiamento();
}

export async function riprovaOperazione(id: string): Promise<void> {
  try {
    const op = await operazioneDb<Operazione | undefined>("coda", "readonly", (s) => s.get(id));
    if (op) {
      op.stato = "in_attesa";
      op.ultimoErrore = undefined;
      await salvaOperazione(op);
    }
  } catch {}
  avvisaCambiamento();
  void eseguiSincronizzazione();
}

// ---------------------------------------------------------------------------
// Invio delle operazioni
// ---------------------------------------------------------------------------

async function token(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function esitoDaErrore(error: { message?: string; code?: string } | null): Esito {
  if (!error) return { esito: "ok" };
  if (error.code === "23505") return { esito: "ok" }; // già inviata in un tentativo precedente
  if (eErroreDiRete(error)) return { esito: "rete" };
  return { esito: "errore", messaggio: error.message || "Errore sconosciuto" };
}

async function inviaDiario(op: Operazione): Promise<Esito> {
  const t = await token();
  if (!t) return { esito: "rete" }; // sessione non ancora disponibile: riproviamo più tardi
  const blobs = op.foto || [];
  op.fotoCaricate = op.fotoCaricate || [];
  for (let i = op.fotoCaricate.length; i < blobs.length; i++) {
    const form = new FormData();
    form.append("cantiereId", op.cantiereId);
    form.append("file", new File([blobs[i]], `foto_${i + 1}.jpg`, { type: blobs[i].type || "image/jpeg" }));
    let risposta: Response;
    try {
      risposta = await fetch("/api/diario", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
    } catch {
      return { esito: "rete" };
    }
    const json = await risposta.json().catch(() => null);
    if (risposta.status === 401) return { esito: "rete" };
    if (!risposta.ok || !json?.ok) {
      return { esito: "errore", messaggio: json?.errore || `Foto non caricata (errore ${risposta.status})` };
    }
    op.fotoCaricate.push(json.percorso);
    await salvaOperazione(op); // ricorda le foto già caricate
  }
  const { error } = await supabase.from("diario_cantiere").insert({
    id: op.id,
    cantiere_id: op.cantiereId,
    data: op.payload.data,
    meteo: op.payload.meteo,
    testo: op.payload.testo,
    foto: op.fotoCaricate,
    creato_da: op.payload.creato_da,
  });
  return esitoDaErrore(error);
}

async function avvisaAttivita(attivitaId: string, evento: "assegnata" | "chiusa") {
  try {
    const t = await token();
    if (!t) return;
    await fetch("/api/attivita/notifica", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify({ attivitaId, evento }),
    });
  } catch {
    // l'avviso è un extra
  }
}

async function inviaAttivitaNuova(op: Operazione): Promise<Esito> {
  const p = op.payload;
  const { error } = await supabase.from("attivita_cantiere").insert({
    id: op.id,
    cantiere_id: op.cantiereId,
    tipo: p.tipo,
    titolo: p.titolo,
    descrizione: p.descrizione,
    gravita: p.gravita,
    assegnata_a: p.assegnata_a,
    scadenza: p.scadenza,
    creato_da: p.creato_da,
  });
  const esito = esitoDaErrore(error);
  if (esito.esito === "ok" && p.assegnata_a && p.assegnata_a !== p.creato_da && !error) {
    await avvisaAttivita(op.id, "assegnata");
  }
  return esito;
}

async function inviaAttivitaStato(op: Operazione): Promise<Esito> {
  const p = op.payload;
  const { data, error } = await supabase
    .from("attivita_cantiere")
    .update({ stato: p.stato, chiusa_il: p.chiusa_il, nota_chiusura: p.nota_chiusura })
    .eq("id", p.attivitaId)
    .select("id");
  if (error) return esitoDaErrore(error);
  if (!data || data.length === 0) {
    return { esito: "errore", messaggio: "Voce non trovata o permessi insufficienti" };
  }
  if (p.stato === "chiusa") await avvisaAttivita(p.attivitaId, "chiusa");
  return { esito: "ok" };
}

async function inviaVerbale(op: Operazione): Promise<Esito> {
  const p = op.payload;
  // Se un invio precedente è andato a buon fine ma la risposta non è arrivata, non duplichiamo
  const { data: esistente, error: errCerca } = await supabase
    .from("verbali_cse")
    .select("id")
    .eq("cantiere_id", op.cantiereId)
    .filter("contenuto->>client_id", "eq", op.id)
    .limit(1);
  if (errCerca) return esitoDaErrore(errCerca);
  if (esistente && esistente.length > 0) return { esito: "ok" };

  const { data, error } = await supabase
    .from("verbali_cse")
    .insert({
      cantiere_id: op.cantiereId,
      tipo: p.tipo,
      data: p.data,
      ora: p.ora,
      contenuto: { ...p.contenuto, client_id: op.id },
      creato_da: p.creato_da,
      destinatario_membro_id: p.destinatario_membro_id,
    })
    .select("id");
  if (error) return esitoDaErrore(error);
  if (!data || data.length === 0) {
    return { esito: "errore", messaggio: "Permessi insufficienti: solo il CSE/CSP assegnato può creare verbali" };
  }
  return { esito: "ok" };
}

let sincronizzazioneInCorso = false;

// Invia tutte le operazioni in attesa, in ordine. Si ferma se manca la connessione.
export async function eseguiSincronizzazione(): Promise<void> {
  if (sincronizzazioneInCorso || inOffline()) return;
  sincronizzazioneInCorso = true;
  try {
    const coda = (await elencaCoda()).filter((o) => o.stato === "in_attesa");
    for (const op of coda) {
      let esito: Esito;
      try {
        if (op.tipo === "diario_nuova") esito = await inviaDiario(op);
        else if (op.tipo === "attivita_nuova") esito = await inviaAttivitaNuova(op);
        else if (op.tipo === "attivita_stato") esito = await inviaAttivitaStato(op);
        else if (op.tipo === "verbale_nuovo") esito = await inviaVerbale(op);
        else esito = { esito: "errore", messaggio: "Tipo di operazione sconosciuto" };
      } catch (e) {
        esito = eErroreDiRete(e) ? { esito: "rete" } : { esito: "errore", messaggio: (e as Error)?.message || "Errore" };
      }

      if (esito.esito === "ok") {
        await rimuoviOperazione(op.id);
      } else if (esito.esito === "rete") {
        op.tentativi += 1;
        await salvaOperazione(op);
        avvisaCambiamento();
        break; // senza rete è inutile provare le altre
      } else {
        op.stato = "errore";
        op.ultimoErrore = esito.messaggio;
        op.tentativi += 1;
        await salvaOperazione(op);
        avvisaCambiamento();
      }
    }
  } finally {
    sincronizzazioneInCorso = false;
    avvisaCambiamento();
  }
}
