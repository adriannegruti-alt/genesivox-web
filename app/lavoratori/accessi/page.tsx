"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Accesso = {
  id: string;
  quando: string;
  motivo: "scheda" | "file";
  ruolo: string | null;
  lavoratore: string;
  lavoratore_id: string;
  documento: string | null;
  chi: string;
  ente: string | null;
};

const stileCampo: React.CSSProperties = {
  padding: 8,
  boxSizing: "border-box",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
};

function formattaQuando(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function etichettaRuolo(ruolo: string | null): string {
  if (ruolo === "autorita_controllo") return "Autorità di controllo";
  if (ruolo === "cantiere") return "Ruolo di cantiere";
  return ruolo || "—";
}

export default function AccessiLavoratoriPage() {
  const [loggato, setLoggato] = useState<boolean | null>(null);
  const [accessi, setAccessi] = useState<Accesso[]>([]);
  const [giorni, setGiorni] = useState(90);
  const [cerca, setCerca] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica(g: number) {
    setCaricamento(true);
    setErrore(null);
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) {
      setLoggato(false);
      setCaricamento(false);
      return;
    }
    setLoggato(true);
    const { data, error } = await supabase.rpc("accessi_ai_miei_lavoratori", { p_giorni: g });
    if (error) {
      setErrore(error.message);
      setAccessi([]);
    } else {
      setAccessi((data as Accesso[]) || []);
    }
    setCaricamento(false);
  }

  useEffect(() => {
    carica(giorni);
  }, [giorni]);

  if (loggato === false) return <p style={{ padding: 24 }}>Devi accedere per vedere questa pagina.</p>;

  const testo = cerca.trim().toLowerCase();
  const visibili = accessi.filter((a) => {
    if (!testo) return true;
    return `${a.lavoratore} ${a.chi} ${a.ente ?? ""} ${a.documento ?? ""}`.toLowerCase().includes(testo);
  });

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 950 }}>
      <h1 style={{ marginBottom: 4 }}>Chi ha consultato i miei lavoratori</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Ogni volta che qualcuno, oltre a te, apre la scheda di un tuo lavoratore o un suo documento, qui resta la
        traccia: chi, quando e in quale ruolo. Le tue consultazioni non compaiono.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
        <select
          value={giorni}
          onChange={(e) => setGiorni(Number(e.target.value))}
          style={{ ...stileCampo, maxWidth: "100%" }}
        >
          <option value={30}>Ultimi 30 giorni</option>
          <option value={90}>Ultimi 90 giorni</option>
          <option value={365}>Ultimo anno</option>
        </select>
        <input
          placeholder="Cerca per lavoratore, persona, ente..."
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          style={{ ...stileCampo, width: 280, maxWidth: "100%" }}
        />
        <Link href="/lavoratori" style={{ fontSize: 14, color: "#1a73e8" }}>
          ← Torna ai lavoratori
        </Link>
      </div>

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {caricamento ? (
        <p>Caricamento...</p>
      ) : visibili.length === 0 ? (
        <p style={{ color: "#888" }}>
          {accessi.length === 0
            ? "Nessuna consultazione in questo periodo."
            : "Nessun risultato per la ricerca."}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "#666" }}>
            {visibili.length} {visibili.length === 1 ? "consultazione" : "consultazioni"}
            {accessi.length >= 500 ? " (mostrate le 500 più recenti)" : ""}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc", fontSize: 13 }}>
                  <th style={{ padding: 8 }}>Quando</th>
                  <th style={{ padding: 8 }}>Lavoratore</th>
                  <th style={{ padding: 8 }}>Cosa ha aperto</th>
                  <th style={{ padding: 8 }}>Chi</th>
                  <th style={{ padding: 8 }}>In qualità di</th>
                </tr>
              </thead>
              <tbody>
                {visibili.map((a) => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, fontSize: 13, whiteSpace: "nowrap" }}>{formattaQuando(a.quando)}</td>
                    <td style={{ padding: 8, fontWeight: 600 }}>{a.lavoratore}</td>
                    <td style={{ padding: 8, fontSize: 14 }}>
                      {a.motivo === "file" ? `Documento${a.documento ? `: ${a.documento}` : ""}` : "Scheda"}
                    </td>
                    <td style={{ padding: 8, fontSize: 14 }}>
                      {a.chi}
                      {a.ente && <div style={{ fontSize: 12, color: "#888" }}>{a.ente}</div>}
                    </td>
                    <td style={{ padding: 8, fontSize: 13 }}>
                      <span
                        style={{
                          backgroundColor: a.ruolo === "autorita_controllo" ? "#fff4d6" : "#eef3fb",
                          color: a.ruolo === "autorita_controllo" ? "#8a5a00" : "#1a4f9c",
                          padding: "3px 8px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {etichettaRuolo(a.ruolo)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ fontSize: 12, color: "#777", marginTop: 16 }}>
        Il registro serve a darti trasparenza su chi consulta i dati dei tuoi lavoratori. Se vedi un accesso che non
        riconosci, contatta Genesivox.
      </p>
    </div>
  );
}
