"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Esito = {
  nome: string;
  cognome: string;
  mansione: string | null;
  impresa: string | null;
  tipo_rapporto: string;
  valido: boolean;
};

type DocScheda = {
  id: string;
  categoria: string;
  tipo: string;
  data_rilascio: string | null;
  data_scadenza: string | null;
  ente_emittente: string | null;
  esito: string | null;
  ha_file: boolean;
};

type Scheda = {
  livello: "completo" | "cantiere";
  lavoratore: {
    nome: string;
    cognome: string;
    codice_fiscale: string | null;
    mansione: string | null;
    tipo_rapporto: string;
    tipo_contratto: string | null;
    livello: string | null;
    data_assunzione: string | null;
    committente: string | null;
    in_subappalto: boolean;
    autorizzazione_subappalto: string | null;
    attivo: boolean;
    ha_foto: boolean;
  };
  impresa: { nome: string | null; partita_iva: string | null; sede_legale: string | null };
  documenti: DocScheda[];
};

const ETICHETTE_ESITO: Record<string, string> = {
  idoneo: "Idoneo",
  idoneo_con_limitazioni: "Idoneo con limitazioni/prescrizioni",
  non_idoneo: "Non idoneo",
};

const GIORNI_PREAVVISO = 60;

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function giorniTra(da: string, a: string): number {
  const [y1, m1, d1] = da.split("-").map(Number);
  const [y2, m2, d2] = a.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function formatData(s: string | null): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function statoDoc(d: DocScheda): { testo: string; colore: string; sfondo: string; tipo: "ok" | "scadenza" | "scaduto" | "senza" } {
  if (!d.data_scadenza) return { testo: "Senza scadenza", colore: "#555", sfondo: "#eee", tipo: "senza" };
  const giorni = giorniTra(oggiRoma(), d.data_scadenza);
  if (giorni < 0) return { testo: `Scaduto da ${-giorni} gg`, colore: "#fff", sfondo: "#c0392b", tipo: "scaduto" };
  if (giorni <= GIORNI_PREAVVISO)
    return { testo: `Scade tra ${giorni} gg`, colore: "#5c3d00", sfondo: "#ffd666", tipo: "scadenza" };
  return { testo: "Valido", colore: "#fff", sfondo: "#16a34a", tipo: "ok" };
}

const stileCampo: React.CSSProperties = {
  width: "100%",
  padding: 10,
  boxSizing: "border-box",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 15,
  marginBottom: 8,
};

export default function VerificaTesserinoPage() {
  const params = useParams();
  const token = params.token as string;

  const [caricamento, setCaricamento] = useState(true);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState(false);

  const [loggato, setLoggato] = useState(false);
  const [statoScheda, setStatoScheda] = useState<"nessuna" | "caricamento" | "ok" | "non_autorizzato" | "errore">(
    "nessuna"
  );
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erroreLogin, setErroreLogin] = useState<string | null>(null);
  const [inAccesso, setInAccesso] = useState(false);
  const [erroreFile, setErroreFile] = useState<string | null>(null);

  async function chiediFile(corpo: Record<string, unknown>): Promise<string | null> {
    const { data: sessione } = await supabase.auth.getSession();
    const accessToken = sessione?.session?.access_token;
    if (!accessToken) return null;
    const risposta = await fetch("/api/controllo/file", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, ...corpo }),
    });
    const json = await risposta.json().catch(() => null);
    if (!risposta.ok || !json?.ok) return null;
    return json.url as string;
  }

  async function caricaScheda() {
    setStatoScheda("caricamento");
    const { data, error } = await supabase.rpc("scheda_controllo", { p_token: token });
    if (error || !data) {
      setStatoScheda("errore");
      return;
    }
    if (data.errore === "non_autorizzato") {
      setStatoScheda("non_autorizzato");
      return;
    }
    if (data.errore) {
      setStatoScheda("errore");
      return;
    }
    setScheda(data as Scheda);
    setStatoScheda("ok");
    if (data.lavoratore?.ha_foto) {
      const url = await chiediFile({ foto: true });
      setFotoUrl(url);
    }
  }

  useEffect(() => {
    async function inizio() {
      if (!token) return;
      const { data, error } = await supabase.rpc("verifica_tesserino", { p_token: token });
      if (error) {
        setErrore(true);
      } else {
        setEsito(data && data.length > 0 ? (data[0] as Esito) : null);
      }
      setCaricamento(false);

      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        setLoggato(true);
        caricaScheda();
      }
    }
    inizio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function accedi(e: React.FormEvent) {
    e.preventDefault();
    setErroreLogin(null);
    setInAccesso(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setInAccesso(false);
    if (error) {
      setErroreLogin("Email o password non corretti.");
      return;
    }
    setPassword("");
    setLoggato(true);
    caricaScheda();
  }

  async function esci() {
    await supabase.auth.signOut();
    setLoggato(false);
    setScheda(null);
    setFotoUrl(null);
    setStatoScheda("nessuna");
  }

  async function apriFile(idDocumento: string) {
    setErroreFile(null);
    // apro subito la scheda del browser, altrimenti il telefono può bloccarla
    const finestra = window.open("", "_blank");
    const url = await chiediFile({ documentoId: idDocumento });
    if (!url) {
      if (finestra) finestra.close();
      setErroreFile("Non è stato possibile aprire il documento.");
      return;
    }
    if (finestra) finestra.location.href = url;
    else window.location.href = url;
  }

  const colore = esito?.valido ? "#16a34a" : "#c0392b";
  const oggi = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });

  const documenti = scheda?.documenti ?? [];
  const idoneita = documenti.filter((d) => d.categoria === "idoneita_sanitaria");
  const formazione = documenti.filter((d) => d.categoria === "formazione");
  const scaduti = documenti.filter((d) => statoDoc(d).tipo === "scaduto").length;
  const inScadenza = documenti.filter((d) => statoDoc(d).tipo === "scadenza").length;
  const idoneitaValida = idoneita.some((d) => d.esito !== "non_idoneo" && statoDoc(d).tipo !== "scaduto");

  function ElencoDocumenti({ elenco }: { elenco: DocScheda[] }) {
    if (elenco.length === 0) return <p style={{ color: "#888", margin: "4px 0 12px" }}>Nessun documento registrato.</p>;
    return (
      <div style={{ marginBottom: 12 }}>
        {elenco.map((d) => {
          const s = statoDoc(d);
          return (
            <div key={d.id} style={{ borderTop: "1px solid #eee", padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div>
                  <strong>{d.tipo}</strong>
                  {d.esito && (
                    <div style={{ fontSize: 13, color: d.esito === "non_idoneo" ? "#c0392b" : "#555" }}>
                      {ETICHETTE_ESITO[d.esito]}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#777" }}>
                    Rilascio {formatData(d.data_rilascio)} · Scadenza {formatData(d.data_scadenza)}
                    {d.ente_emittente ? ` · ${d.ente_emittente}` : ""}
                  </div>
                </div>
                <span
                  style={{
                    backgroundColor: s.sfondo,
                    color: s.colore,
                    padding: "3px 8px",
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.testo}
                </span>
              </div>
              {d.ha_file && (
                <button
                  onClick={() => apriFile(d.id)}
                  style={{
                    marginTop: 6,
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Apri documento
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f6f8",
        fontFamily: "sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480, marginTop: 24 }}>
        <p style={{ textAlign: "center", fontWeight: 700, color: "#1a73e8", letterSpacing: 1, margin: "0 0 16px" }}>
          GENESIVOX · VERIFICA TESSERINO
        </p>

        {caricamento && <p style={{ textAlign: "center" }}>Verifica in corso...</p>}

        {!caricamento && errore && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <p style={{ color: "#c0392b", fontWeight: 700, fontSize: 18, marginTop: 0 }}>Verifica non riuscita</p>
            <p style={{ marginBottom: 0 }}>Controlla la connessione e scansiona di nuovo il QR.</p>
          </div>
        )}

        {!caricamento && !errore && !esito && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, textAlign: "center" }}>
            <p style={{ color: "#c0392b", fontWeight: 700, fontSize: 22, marginTop: 0 }}>TESSERINO NON VALIDO</p>
            <p style={{ marginBottom: 0 }}>Questo codice non risulta registrato su Genesivox.</p>
          </div>
        )}

        {!caricamento && !errore && esito && (
          <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
            <div style={{ backgroundColor: colore, color: "#fff", padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{esito.valido ? "✔ VALIDO" : "✖ NON VALIDO"}</div>
              {!esito.valido && (
                <div style={{ fontSize: 14, marginTop: 4 }}>Il lavoratore non risulta più attivo presso l&apos;impresa.</div>
              )}
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ margin: 0, fontSize: 24, fontWeight: 700, textTransform: "uppercase" }}>{esito.cognome}</p>
              <p style={{ margin: "0 0 12px", fontSize: 20 }}>{esito.nome}</p>
              {esito.mansione && (
                <p style={{ margin: "0 0 4px", color: "#444" }}>
                  <strong>Mansione:</strong> {esito.mansione}
                </p>
              )}
              <p style={{ margin: "0 0 4px", color: "#444" }}>
                <strong>{esito.tipo_rapporto === "autonomo" ? "Lavoratore autonomo" : "Impresa"}:</strong>{" "}
                {esito.impresa || "—"}
              </p>
            </div>
          </div>
        )}

        {/* Consultazione riservata */}
        {!caricamento && !errore && esito && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, marginTop: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}>
            <h3 style={{ margin: "0 0 4px" }}>Consultazione riservata</h3>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#666" }}>
              Per autorità di controllo, datore di lavoro e responsabili del cantiere in cui il lavoratore è assegnato. Ogni consultazione viene registrata (utente, data e ora).
            </p>

            {!loggato && (
              <form onSubmit={accedi}>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={stileCampo}
                  required
                  autoComplete="email"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={stileCampo}
                  required
                  autoComplete="current-password"
                />
                {erroreLogin && <p style={{ color: "red", margin: "0 0 8px" }}>{erroreLogin}</p>}
                <button
                  type="submit"
                  disabled={inAccesso}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#1a73e8",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {inAccesso ? "Accesso..." : "Accedi"}
                </button>
              </form>
            )}

            {loggato && statoScheda === "caricamento" && <p>Caricamento della scheda...</p>}

            {loggato && statoScheda === "non_autorizzato" && (
              <div>
                <p style={{ color: "#c0392b", fontWeight: 600 }}>Il tuo account non è abilitato alla consultazione.</p>
