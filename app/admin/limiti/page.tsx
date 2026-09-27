"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Pagina Admin: quanto storage e quanti cantieri sta usando ogni account
// rispetto al limite del suo piano. Legge dalla vista "riepilogo_limiti_account"
// (creata in 0068_limiti_piano_storage_e_cantieri.sql), che calcola tutto al
// volo dai dati reali (nessun dato duplicato da mantenere aggiornato).
//
// Nota: qui il superamento della soglia è solo VISIVO (badge rosso/giallo in
// questa pagina). L'invio automatico di un'email di avviso al cliente è un
// passo successivo, che richiede il servizio SMTP dedicato (non ancora
// configurato) — vedi la conversazione sull'invio email.

type Riga = {
  profilo_id: string;
  email: string;
  piano: string | null;
  limite_cantieri: number | null;
  cantieri_usati: number;
  limite_storage_gb: number | null;
  storage_usato_gb: number;
  vicino_al_limite: boolean;
};

export default function AdminLimitiAccountPage() {
  const [caricamento, setCaricamento] = useState(true);
  const [autorizzato, setAutorizzato] = useState(false);
  const [righe, setRighe] = useState<Riga[]>([]);
  const [ricerca, setRicerca] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  async function carica() {
    setCaricamento(true);
    setErrore(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setCaricamento(false);
      return;
    }

    const { data: mioProfilo } = await supabase
      .from("profili")
      .select("ruolo")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (mioProfilo?.ruolo !== "admin") {
      setAutorizzato(false);
      setCaricamento(false);
      return;
    }
    setAutorizzato(true);

    const { data, error } = await supabase
      .from("riepilogo_limiti_account")
      .select("*")
      .order("vicino_al_limite", { ascending: false })
      .order("email", { ascending: true });

    if (error) {
      setErrore(error.message);
    } else {
      setRighe((data || []) as Riga[]);
    }
    setCaricamento(false);
  }

  useEffect(() => {
    carica();
  }, []);

  function percentuale(usato: number, limite: number | null) {
    if (limite === null || limite === 0) return null;
    return Math.min(100, Math.round((usato / limite) * 100));
  }

  function coloreBarra(pct: number | null) {
    if (pct === null) return "#34a853"; // illimitato: verde
    if (pct >= 100) return "#c0392b";
    if (pct >= 90) return "#e67e22";
    return "#1a73e8";
  }

  const righeFiltrate = righe.filter((r) =>
    r.email.toLowerCase().includes(ricerca.toLowerCase())
  );

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!autorizzato) return <p style={{ padding: 24, color: "red" }}>Accesso riservato agli amministratori.</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 1000 }}>
      <h1>Limiti account (cantieri e storage)</h1>
      <p style={{ color: "#666", fontSize: 13, marginTop: -8 }}>
        Confronta l'uso reale di ogni account con i limiti del suo piano (tabella "piani").
        Le righe con badge <span style={{ color: "#e67e22", fontWeight: "bold" }}>arancione/rosso</span> sono
        vicine o oltre il limite.
      </p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      <input
        placeholder="Cerca per email..."
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
        style={{ padding: 8, width: "100%", maxWidth: 320, marginBottom: 16 }}
      />

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: 8 }}>Account</th>
            <th style={{ padding: 8 }}>Piano</th>
            <th style={{ padding: 8 }}>Cantieri attivi</th>
            <th style={{ padding: 8 }}>Storage</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {righeFiltrate.map((r) => {
            const pctCantieri = percentuale(r.cantieri_usati, r.limite_cantieri);
            const pctStorage = percentuale(r.storage_usato_gb, r.limite_storage_gb);
            return (
              <tr key={r.profilo_id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{r.email}</td>
                <td style={{ padding: 8 }}>{r.piano ?? "—"}</td>
                <td style={{ padding: 8 }}>
                  {r.cantieri_usati} / {r.limite_cantieri ?? "∞"}
                  {pctCantieri !== null && (
                    <div style={{ height: 5, background: "#eee", borderRadius: 3, marginTop: 4, maxWidth: 100 }}>
                      <div
                        style={{
                          height: 5,
                          width: `${pctCantieri}%`,
                          background: coloreBarra(pctCantieri),
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {r.storage_usato_gb.toFixed(2)} GB / {r.limite_storage_gb ?? "∞"} GB
                  {pctStorage !== null && (
                    <div style={{ height: 5, background: "#eee", borderRadius: 3, marginTop: 4, maxWidth: 100 }}>
                      <div
                        style={{
                          height: 5,
                          width: `${pctStorage}%`,
                          background: coloreBarra(pctStorage),
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {r.vicino_al_limite && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                        background: "#fdecea",
                        color: "#c0392b",
                        border: "1px solid #c0392b",
                      }}
                    >
                      ⚠ vicino al limite
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {righeFiltrate.length === 0 && <p style={{ color: "#666", marginTop: 16 }}>Nessun account trovato.</p>}
    </div>
  );
}
