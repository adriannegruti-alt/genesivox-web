"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Richiesta = {
  id: string;
  ruolo: string;
  richiesto_il: string;
  stato: string;
  cantiere_membri: {
    profili: { email: string } | null;
    nome_impresa: string | null;
  } | null;
};

const ETICHETTA_RUOLO: Record<string, string> = {
  committente: "Committente",
  impresa_edile: "Impresa edile",
};

export default function RichiesteRuoloPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [richieste, setRichieste] = useState<Richiesta[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  async function carica() {
    setErrore(null);
    const { data, error } = await supabase
      .from("richieste_ruolo")
      .select(
        "id, ruolo, richiesto_il, stato, cantiere_membri!richieste_ruolo_membro_id_fkey(nome_impresa, profili!cantiere_membri_profilo_id_fkey(email))"
      )
      .eq("cantiere_id", cantiereId)
      .eq("stato", "in_attesa")
      .order("richiesto_il", { ascending: true });

    if (error) {
      setErrore(
        "Non riesci a vedere questa pagina (solo il creatore del cantiere o l'amministratore possono approvare le richieste), oppure: " +
          error.message
      );
      setCaricamento(false);
      return;
    }

    setRichieste((data as any) || []);
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  async function decidi(id: string, stato: "approvato" | "rifiutato") {
    setInCorso(id);
    setErrore(null);

    const { data, error } = await supabase.from("richieste_ruolo").update({ stato }).eq("id", id).select("id");

    if (error) {
      setErrore(error.message);
      setInCorso(null);
      return;
    }
    if (!data || data.length === 0) {
      setErrore("Non hai i permessi per approvare/rifiutare questa richiesta.");
      setInCorso(null);
      return;
    }

    setInCorso(null);
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Richieste di ruolo in attesa</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Qui vedi le richieste di diventare <strong>Committente</strong> o <strong>Impresa edile</strong> per questo
        cantiere. Questi due ruoli danno accesso a tutti i preventivi caricati, quindi vanno confermati a mano.
      </p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {richieste.length === 0 && !errore && <p>Nessuna richiesta in attesa al momento.</p>}

      {richieste.map((r) => (
        <div
          key={r.id}
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong>{r.cantiere_membri?.profili?.email ?? "Utente"}</strong>
            {r.cantiere_membri?.nome_impresa ? ` — ${r.cantiere_membri.nome_impresa}` : ""}
            <div style={{ fontSize: 13, color: "#666" }}>
              Richiede il ruolo: <strong>{ETICHETTA_RUOLO[r.ruolo] ?? r.ruolo}</strong>
              <br />
              Richiesto il {new Date(r.richiesto_il).toLocaleDateString("it-IT")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              disabled={inCorso === r.id}
              onClick={() => decidi(r.id, "approvato")}
              style={{
                padding: "8px 16px",
                backgroundColor: "#34a853",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ✅ Approva
            </button>
            <button
              disabled={inCorso === r.id}
              onClick={() => decidi(r.id, "rifiutato")}
              style={{
                padding: "8px 16px",
                backgroundColor: "#fff",
                color: "#c0392b",
                border: "1px solid #c0392b",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              ✕ Rifiuta
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
