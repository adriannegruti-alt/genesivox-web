"use client";

import { useEffect, useState } from "react";
import { elencaCoda, eseguiSincronizzazione, iscriviCoda } from "@/lib/codaOffline";

// Striscia in alto: dice se sei offline e quante cose aspettano di essere inviate.
// Avvia anche l'invio automatico quando torna la connessione.
export default function StatoConnessione() {
  const [offline, setOffline] = useState(false);
  const [inAttesa, setInAttesa] = useState(0);
  const [conErrore, setConErrore] = useState(0);
  const [invio, setInvio] = useState(false);

  async function aggiorna() {
    const coda = await elencaCoda();
    setInAttesa(coda.filter((o) => o.stato === "in_attesa").length);
    setConErrore(coda.filter((o) => o.stato === "errore").length);
  }

  async function inviaOra() {
    setInvio(true);
    await eseguiSincronizzazione();
    await aggiorna();
    setInvio(false);
  }

  useEffect(() => {
    setOffline(!navigator.onLine);
    aggiorna();
    const annulla = iscriviCoda(aggiorna);

    function tornaOnline() {
      setOffline(false);
      void eseguiSincronizzazione();
    }
    function vaOffline() {
      setOffline(true);
    }
    function visibile() {
      if (document.visibilityState === "visible" && navigator.onLine) void eseguiSincronizzazione();
    }
    window.addEventListener("online", tornaOnline);
    window.addEventListener("offline", vaOffline);
    document.addEventListener("visibilitychange", visibile);

    // All'avvio, e ogni minuto, prova a inviare quello che è rimasto in coda
    if (navigator.onLine) void eseguiSincronizzazione();
    const timer = setInterval(() => {
      if (navigator.onLine) void eseguiSincronizzazione();
    }, 60000);

    // Con connessione, salva una copia della pagina aperta, così si può riaprire anche offline
    if (navigator.onLine && /^\/(cantieri|dashboard)/.test(window.location.pathname)) {
      fetch(window.location.pathname, { headers: { Accept: "text/html" } }).catch(() => null);
    }

    return () => {
      annulla();
      clearInterval(timer);
      window.removeEventListener("online", tornaOnline);
      window.removeEventListener("offline", vaOffline);
      document.removeEventListener("visibilitychange", visibile);
    };
  }, []);

  if (!offline && inAttesa === 0 && conErrore === 0) return null;

  const stile: React.CSSProperties = {
    padding: "8px 16px",
    fontSize: 14,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    background: conErrore > 0 && !offline ? "#fdecea" : "#fff7e0",
    borderBottom: "1px solid " + (conErrore > 0 && !offline ? "#f5c2bd" : "#ffd666"),
    color: "#3c4149",
  };

  return (
    <div style={stile}>
      {offline && <strong>Sei offline.</strong>}
      {offline && <span>Quello che salvi resta sul dispositivo e parte da solo appena torna la connessione.</span>}
      {inAttesa > 0 && (
        <span>
          ⏳ {inAttesa} {inAttesa === 1 ? "elemento" : "elementi"} da inviare
        </span>
      )}
      {conErrore > 0 && (
        <span style={{ color: "#c0392b" }}>
          ⚠ {conErrore} non {conErrore === 1 ? "inviato" : "inviati"}: apri la pagina del modulo per vedere il motivo
        </span>
      )}
      {!offline && inAttesa > 0 && (
        <button
          onClick={inviaOra}
          disabled={invio}
          style={{ padding: "4px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer" }}
        >
          {invio ? "Invio..." : "Invia ora"}
        </button>
      )}
    </div>
  );
}
