"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Membro = {
  profilo_id: string;
  nome_impresa: string | null;
  ruolo: string;
  email: string | null;
  nome: string | null;
  cognome: string | null;
};

type Presenza = {
  id: string;
  profilo_id: string;
  ora_ingresso: string;
  ora_uscita: string | null;
  metodo: string;
};

function oggiISO() {
  return new Date().toISOString().slice(0, 10);
}

function formattaOra(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function PresenzePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [data, setData] = useState(oggiISO());
  const [membri, setMembri] = useState<Membro[]>([]);
  const [presenze, setPresenze] = useState<Presenza[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [membroDaAggiungere, setMembroDaAggiungere] = useState("");

  async function carica() {
    setErrore(null);

    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: elencoMembri } = await supabase
      .from("cantiere_membri")
      .select("profilo_id, nome_impresa, ruolo, profili!cantiere_membri_profilo_id_fkey(email, nome, cognome)")
      .eq("cantiere_id", cantiereId);

    setMembri(
      (elencoMembri || []).map((m: any) => ({
        profilo_id: m.profilo_id,
        nome_impresa: m.nome_impresa,
        ruolo: m.ruolo,
        email: m.profili?.email ?? null,
        nome: m.profili?.nome ?? null,
        cognome: m.profili?.cognome ?? null,
      }))
    );

    const { data: elencoPresenze, error: errorePresenze } = await supabase
      .from("presenze")
      .select("id, profilo_id, ora_ingresso, ora_uscita, metodo")
      .eq("cantiere_id", cantiereId)
      .eq("data", data)
      .order("ora_ingresso", { ascending: true });

    if (errorePresenze) setErrore(errorePresenze.message);
    setPresenze(elencoPresenze || []);
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantiereId, data]);

  async function segnaPresente(profiloId: string) {
    setErrore(null);
    const { data: esistente } = await supabase
      .from("presenze")
      .select("id, ora_uscita")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", profiloId)
      .eq("data", data)
      .maybeSingle();

    if (!esistente) {
      const { error } = await supabase.from("presenze").insert({
        cantiere_id: cantiereId,
        profilo_id: profiloId,
        data,
        ora_ingresso: new Date().toISOString(),
        metodo: "manuale",
        registrato_da: profiloId,
      });
      if (error) {
        alert(`Non è stato possibile registrare la presenza: ${error.message}`);
        return;
      }
    } else if (!esistente.ora_uscita) {
      const { error } = await supabase
        .from("presenze")
        .update({ ora_uscita: new Date().toISOString() })
        .eq("id", esistente.id);
      if (error) {
        alert(`Non è stato possibile registrare l'uscita: ${error.message}`);
        return;
      }
    } else {
      alert("Questa persona ha già ingresso e uscita registrati per oggi.");
      return;
    }

    setMembroDaAggiungere("");
    carica();
  }

  function nomeVisualizzato(profiloId: string): string {
    const m = membri.find((x) => x.profilo_id === profiloId);
    if (!m) return "—";
    const nomeCompleto = [m.nome, m.cognome].filter(Boolean).join(" ");
    if (nomeCompleto) return nomeCompleto;
    return m.nome_impresa || m.email || "—";
  }

  function impresaVisualizzata(profiloId: string): string {
    const m = membri.find((x) => x.profilo_id === profiloId);
    return m?.nome_impresa || "—";
  }

  function ruoloVisualizzato(profiloId: string): string {
    const m = membri.find((x) => x.profilo_id === profiloId);
    return m?.ruolo || "—";
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  const eOggi = data === oggiISO();
  const membriSenzaPresenzaOggi = membri.filter((m) => !presenze.some((p) => p.profilo_id === m.profilo_id));

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800 }}>
      <h1>Presenze — {cantiere?.nome}</h1>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, color: "#666", marginRight: 8 }}>Giorno:</label>
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ padding: 6 }} />
        {!eOggi && (
          <button onClick={() => setData(oggiISO())} style={{ marginLeft: 8, padding: "6px 12px" }}>
            Torna a oggi
          </button>
        )}
      </div>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Persona</th>
            <th style={{ padding: 8 }}>Impresa</th>
            <th style={{ padding: 8 }}>Ruolo</th>
            <th style={{ padding: 8 }}>Ingresso</th>
            <th style={{ padding: 8 }}>Uscita</th>
            <th style={{ padding: 8 }}>Metodo</th>
          </tr>
        </thead>
        <tbody>
          {presenze.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{nomeVisualizzato(p.profilo_id)}</td>
              <td style={{ padding: 8 }}>{impresaVisualizzata(p.profilo_id)}</td>
              <td style={{ padding: 8 }}>{ruoloVisualizzato(p.profilo_id)}</td>
              <td style={{ padding: 8, color: "#16a34a", fontWeight: 600 }}>{formattaOra(p.ora_ingresso)}</td>
              <td style={{ padding: 8 }}>
                {p.ora_uscita ? (
                  formattaOra(p.ora_uscita)
                ) : (
                  <span style={{ color: "#c0392b" }}>Ancora in cantiere</span>
                )}
              </td>
              <td style={{ padding: 8, color: "#888", fontSize: 13 }}>
                {p.metodo === "qr" ? "QR code" : p.metodo === "manuale" ? "Manuale" : p.metodo}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {presenze.length === 0 && <p>Nessuna presenza registrata per questo giorno.</p>}

      {eOggi && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, backgroundColor: "#fafafa" }}>
          <h3 style={{ marginTop: 0 }}>Registra presenza manualmente</h3>
          <p style={{ fontSize: 13, color: "#666" }}>
            Per chi è entrato in cantiere senza scansionare il QR code.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={membroDaAggiungere}
              onChange={(e) => setMembroDaAggiungere(e.target.value)}
              style={{ flex: 1, padding: 8 }}
            >
              <option value="">Seleziona persona...</option>
              {membriSenzaPresenzaOggi.map((m) => (
                <option key={m.profilo_id} value={m.profilo_id}>
                  {[m.nome, m.cognome].filter(Boolean).join(" ") || m.nome_impresa || m.email} ({m.ruolo})
                </option>
              ))}
            </select>
            <button
              onClick={() => membroDaAggiungere && segnaPresente(membroDaAggiungere)}
              disabled={!membroDaAggiungere}
              style={{
                padding: "8px 20px",
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Segna presente
            </button>
          </div>
          {membriSenzaPresenzaOggi.length === 0 && (
            <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>Tutti i membri hanno già una presenza registrata oggi.</p>
          )}
        </div>
      )}
    </div>
  );
}
