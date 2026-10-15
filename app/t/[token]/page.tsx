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

export default function VerificaTesserinoPage() {
  const params = useParams();
  const token = params.token as string;

  const [caricamento, setCaricamento] = useState(true);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    async function verifica() {
      if (!token) return;
      const { data, error } = await supabase.rpc("verifica_tesserino", { p_token: token });
      if (error) {
        setErrore(true);
      } else {
        setEsito(data && data.length > 0 ? (data[0] as Esito) : null);
      }
      setCaricamento(false);
    }
    verifica();
  }, [token]);

  const colore = esito?.valido ? "#16a34a" : "#c0392b";
  const oggi = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });

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
      <div style={{ width: "100%", maxWidth: 420, marginTop: 24 }}>
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

        <p style={{ textAlign: "center", fontSize: 12, color: "#777", marginTop: 16 }}>
          Verifica effettuata il {oggi}.
          <br />
          Questa è una verifica di base del tesserino. Non sostituisce i controlli di legge sulla documentazione.
        </p>
      </div>
    </div>
  );
}
