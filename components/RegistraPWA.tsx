"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { registraServiceWorker } from "@/lib/registraServiceWorker";
import { supabase } from "@/lib/supabaseClient";

const CHIAVE_PUBBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const CHIAVE_NASCONDI = "genesivox-push-nascondi";

function pushSupportato(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function bannerNascosto(): boolean {
  try {
    return window.localStorage.getItem(CHIAVE_NASCONDI) === "1";
  } catch {
    return false;
  }
}

function nascondiBanner() {
  try {
    window.localStorage.setItem(CHIAVE_NASCONDI, "1");
  } catch {
    // niente: il banner ricomparirà alla prossima visita
  }
}

function chiaveInBytes(base64: string): Uint8Array {
  const riempimento = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + riempimento).replace(/-/g, "+").replace(/_/g, "/");
  const testo = window.atob(b64);
  const bytes = new Uint8Array(testo.length);
  for (let i = 0; i < testo.length; i++) bytes[i] = testo.charCodeAt(i);
  return bytes;
}

// Iscrive questo dispositivo alle notifiche e lo collega all'utente loggato.
// Restituisce l'id dell'utente se tutto è andato bene, altrimenti stringa vuota.
async function iscriviDispositivo(): Promise<string> {
  try {
    if (!CHIAVE_PUBBLICA) return "";
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const idUtente = data.session?.user?.id || "";
    if (!token || !idUtente) return "";

    const registrazione = await navigator.serviceWorker.ready;
    let sottoscrizione = await registrazione.pushManager.getSubscription();
    if (!sottoscrizione) {
      sottoscrizione = await registrazione.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chiaveInBytes(CHIAVE_PUBBLICA) as any,
      });
    }

    const risposta = await fetch("/api/push/iscriviti", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sottoscrizione: sottoscrizione.toJSON() }),
    });
    return risposta.ok ? idUtente : "";
  } catch {
    return "";
  }
}

// Scollega questo dispositivo dall'utente che sta uscendo.
async function scollegaDispositivo() {
  try {
    if (!pushSupportato()) return;
    const registrazione = await navigator.serviceWorker.ready;
    const sottoscrizione = await registrazione.pushManager.getSubscription();
    if (!sottoscrizione) return;
    await fetch("/api/push/iscriviti", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sottoscrizione.endpoint }),
      keepalive: true,
    });
  } catch {
    // nessun problema: al prossimo login il dispositivo viene ricollegato
  }
}

// Componente "invisibile": attiva il service worker e, ad ogni cambio
// di pagina, chiede in background di salvarla in cache — necessario
// perché la navigazione interna dell'app (click sui link) non genera
// mai una richiesta "vera" che il service worker possa intercettare da solo.
// In più, a chi ha fatto il login propone di attivare le notifiche push.
export default function RegistraPWA() {
  const percorsoAttuale = usePathname();
  const [mostraBanner, setMostraBanner] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [messaggio, setMessaggio] = useState("");
  // Id dell'utente a cui questo dispositivo è attualmente collegato
  const utenteCollegato = useRef("");

  useEffect(() => {
    registraServiceWorker();
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    if (!percorsoAttuale) return;
    fetch(percorsoAttuale, { method: "GET" }).catch(() => {
      // Se la richiesta fallisce (es. offline), non è un problema:
      // semplicemente quella pagina non verrà aggiornata in cache ora.
    });
  }, [percorsoAttuale]);

  useEffect(() => {
    if (!pushSupportato()) return;
    let attivo = true;

    async function valuta() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!attivo) return;
        const idUtente = data.session?.user?.id || "";
        if (!idUtente) {
          setMostraBanner(false);
          return;
        }
        if (Notification.permission === "granted") {
          setMostraBanner(false);
          if (utenteCollegato.current !== idUtente) {
            utenteCollegato.current = idUtente;
            const esito = await iscriviDispositivo();
            if (!esito) utenteCollegato.current = "";
          }
        } else if (Notification.permission === "default" && !bannerNascosto()) {
          setMostraBanner(true);
        }
      } catch {
        // nessun problema: il banner semplicemente non compare
      }
    }

    valuta();
    const { data: ascolto } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") {
        utenteCollegato.current = "";
        setMostraBanner(false);
        scollegaDispositivo();
        return;
      }
      valuta();
    });
    return () => {
      attivo = false;
      ascolto.subscription.unsubscribe();
    };
  }, []);

  async function attiva() {
    setOccupato(true);
    setMessaggio("");
    try {
      const permesso = await Notification.requestPermission();
      if (permesso === "granted") {
        const idUtente = await iscriviDispositivo();
        if (idUtente) {
          utenteCollegato.current = idUtente;
          setMostraBanner(false);
        } else {
          setMessaggio("Non è stato possibile attivare le notifiche. Riprova più tardi.");
        }
      } else {
        setMessaggio("Notifiche non attivate. Puoi riattivarle dalle impostazioni del browser.");
        nascondiBanner();
      }
    } catch {
      setMessaggio("Non è stato possibile attivare le notifiche.");
    }
    setOccupato(false);
  }

  function chiudi() {
    nascondiBanner();
    setMostraBanner(false);
  }

  if (!mostraBanner) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 1000,
        maxWidth: 520,
        margin: "0 auto",
        background: "#fff",
        border: "1px solid #d6e6fb",
        borderRadius: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        padding: "14px 16px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200, fontSize: 14, color: "#3c4149" }}>
        <strong>Attiva le notifiche</strong>
        <div>Ricevi un avviso quando vengono caricati documenti nei tuoi cantieri.</div>
        {messaggio && <div style={{ marginTop: 6, color: "#c0392b" }}>{messaggio}</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={attiva}
          disabled={occupato}
          style={{
            background: "#1a73e8",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {occupato ? "Attivo..." : "Attiva"}
        </button>
        <button
          onClick={chiudi}
          style={{
            background: "#fff",
            color: "#3c4149",
            border: "1px solid #e4e7ec",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Non ora
        </button>
      </div>
    </div>
  );
}
