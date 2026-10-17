"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type RuoloCantiere = { cantiere: string; ruolo: string };

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
  ruoli_cantiere: RuoloCantiere[] | null;
};

const ETICHETTE_RUOLO: Record<string, string> = {
  committente: "Committente",
  responsabile_lavori: "Responsabile dei lavori",
  impresa_edile: "Impresa edile",
  cse_csp: "Coordinatore sicurezza (CSE/CSP)",
  capocantiere: "Capocantiere / preposto",
  rspp: "RSPP",
  responsabile_cantiere: "Responsabile del cantiere",
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

  function testoRuoli(a: Accesso): string {
    if (a.ruolo === "autorita_controllo") return "Autorità di controllo";
    const elenco = (a.ruoli_cantiere || []).map(
      (r) => `${ETICHETTE_RUOLO[r.ruolo] || r.ruolo} ${r.cantiere}`
    );
    return elenco.join(" ");
  }

  const testo = cerca.trim().toLowerCase();
  const visibili = accessi.filter((a) => {
    if (!testo) return true;
    return `${a.lavoratore} ${a.chi} ${a.ente ?? ""} ${a.documento ?? ""} ${testoRuoli(a)}`
      .toLowerCase()
      .includes(testo);
  });

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 1000 }}>
      <h1 style={{ marginBottom: 4 }}>Chi ha consultato i miei lavoratori</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Ogni volta che qualcuno, oltre a te, apre la scheda di un tuo lavoratore o un suo documento, qui resta la
        traccia: chi, quando e con quale ruolo. Le tue consultazioni non compaiono.
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
          placeholder="Cerca per lavoratore, persona, ruolo, cantiere..."
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          style={{ ...stileCampo, width: 320, maxWidth: "100%" }}
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
                  <th style={{ padding: 8 }}>Ruolo</th>
                </tr>
              </thead>
              <tbody>
                {visibili.map((a) => {
                  const autorita = a.ruolo === "autorita_controllo";
                  const elenco = a.ruoli_cantiere || [];
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
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
                        {autorita ? (
                          <span
                            style={{
                              backgroundColor: "#fff4d6",
                              color: "#8a5a00",
                              padding: "3px 8px",
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Autorità di controllo
                          </span>
                        ) : elenco.length > 0 ? (
                          elenco.map((r, i) => (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <span
                                style={{
                                  backgroundColor: "#eef3fb",
                                  color: "#1a4f9c",
                                  padding: "3px 8px",
                                  borderRadius: 12,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {ETICHETTE_RUOLO[r.ruolo] || r.ruolo}
                              </span>
                              <span style={{ marginLeft: 6, fontSize: 12, color: "#666" }}>{r.cantiere}</span>
                            </div>
                          ))
                        ) : (
                          <span style={{ color: "#888", fontSize: 12 }}>Ruolo di cantiere (non più rilevabile)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p style={{ fontSize: 12, color: "#777", marginTop: 16 }}>
        Il ruolo mostrato è quello che la persona ha oggi nei cantieri dove il lavoratore è assegnato. Il registro serve
        a darti trasparenza su chi consulta i dati dei tuoi lavoratori: se vedi un accesso che non riconosci,
        contatta Genesivox.
      </p>
    </div>
  );
}
