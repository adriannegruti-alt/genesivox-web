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
  // Data di oggi in ora italiana (non UTC)
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function formattaOra(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

function formattaDurata(ms: number) {
  const minutiTotali = Math.max(0, Math.round(ms / 60000));
  const ore = Math.floor(minutiTotali / 60);
  const minuti = minutiTotali % 60;
  return ore > 0 ? `${ore}h ${minuti}min` : `${minuti}min`;
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

  // Registra un ingresso (se la persona è fuori) o l'uscita (se è dentro)
  async function registraIngressoOUscita(profiloId: string) {
    setErrore(null);

    // C'è un ingresso ancora aperto (senza uscita) per questa persona oggi?
    const { data: aperta, error: erroreRicerca } = await supabase
      .from("presenze")
      .select("id")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", profiloId)
      .eq("data", data)
      .is("ora_uscita", null)
      .order("ora_ingresso", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroreRicerca) {
      alert(`Non è stato possibile controllare la presenza: ${erroreRicerca.message}`);
      return;
    }

    if (!aperta) {
      // Nuovo ingresso (anche se ce ne sono già di chiusi nella giornata)
      const { error } = await supabase.from("presenze").insert({
        cantiere_id: cantiereId,
        profilo_id: profiloId,
        data,
        ora_ingresso: new Date().toISOString(),
        metodo: "manuale",
        registrato_da: profiloId,
      });
      if (error) {
        if ((error as any).code === "23505") {
          alert("Questa persona risulta già dentro il cantiere. Registra prima l'uscita.");
        } else {
          alert(`Non è stato possibile registrare l'ingresso: ${error.message}`);
        }
        return;
      }
    } else {
      const { error } = await supabase
        .from("presenze")
        .update({ ora_uscita: new Date().toISOString() })
        .eq("id", aperta.id);
      if (error) {
        alert(`Non è stato possibile registrare l'uscita: ${error.message}`);
        return;
      }
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

  // Chi è dentro adesso (ha un ingresso senza uscita)
  const dentro = new Set(presenze.filter((p) => !p.ora_uscita).map((p) => p.profilo_id));
  const selezionatoDentro = dentro.has(membroDaAggiungere);

  // Totali per persona (somma dei giri chiusi)
  const totali: { profiloId: string; giri: number; ms: number; inCorso: boolean }[] = [];
  for (const p of presenze) {
    let riga = totali.find((t) => t.profiloId === p.profilo_id);
    if (!riga) {
      riga = { profiloId: p.profilo_id, giri: 0, ms: 0, inCorso: false };
      totali.push(riga);
    }
    riga.giri += 1;
    if (p.ora_uscita) {
      riga.ms += new Date(p.ora_uscita).getTime() - new Date(p.ora_ingresso).getTime();
    } else {
      riga.inCorso = true;
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 900 }}>
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

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Persona</th>
            <th style={{ padding: 8 }}>Impresa</th>
            <th style={{ padding: 8 }}>Ruolo</th>
            <th style={{ padding: 8 }}>N.</th>
            <th style={{ padding: 8 }}>Ingresso</th>
            <th style={{ padding: 8 }}>Uscita</th>
            <th style={{ padding: 8 }}>Durata</th>
            <th style={{ padding: 8 }}>Metodo</th>
          </tr>
        </thead>
        <tbody>
          {presenze.map((p, i) => {
            const numeroGiro = presenze.slice(0, i + 1).filter((x) => x.profilo_id === p.profilo_id).length;
            return (
              <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{nomeVisualizzato(p.profilo_id)}</td>
                <td style={{ padding: 8 }}>{impresaVisualizzata(p.profilo_id)}</td>
                <td style={{ padding: 8 }}>{ruoloVisualizzato(p.profilo_id)}</td>
                <td style={{ padding: 8, color: "#888" }}>{numeroGiro}</td>
                <td style={{ padding: 8, color: "#16a34a", fontWeight: 600 }}>{formattaOra(p.ora_ingresso)}</td>
                <td style={{ padding: 8 }}>
                  {p.ora_uscita ? (
                    formattaOra(p.ora_uscita)
                  ) : (
                    <span style={{ color: "#c0392b" }}>Ancora in cantiere</span>
                  )}
                </td>
                <td style={{ padding: 8 }}>
                  {p.ora_uscita
                    ? formattaDurata(new Date(p.ora_uscita).getTime() - new Date(p.ora_ingresso).getTime())
                    : "—"}
                </td>
                <td style={{ padding: 8, color: "#888", fontSize: 13 }}>
                  {p.metodo === "qr" ? "QR code" : p.metodo === "manuale" ? "Manuale" : p.metodo}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {presenze.length === 0 && <p>Nessuna presenza registrata per questo giorno.</p>}

      {totali.length > 0 && (
        <div style={{ marginBottom: 24, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Totale del giorno per persona</h3>
          {totali.map((t) => (
            <p key={t.profiloId} style={{ margin: "4px 0", fontSize: 14 }}>
              <strong>{nomeVisualizzato(t.profiloId)}</strong>: {t.giri} {t.giri === 1 ? "ingresso" : "ingressi"},{" "}
              {formattaDurata(t.ms)}
              {t.inCorso && <span style={{ color: "#c0392b" }}> (+ giro in corso)</span>}
            </p>
          ))}
        </div>
      )}

      {eOggi && (
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, backgroundColor: "#fafafa" }}>
          <h3 style={{ marginTop: 0 }}>Registra ingresso o uscita manualmente</h3>
          <p style={{ fontSize: 13, color: "#666" }}>
            Per chi non scansiona il QR code. Si possono registrare più ingressi e uscite nella stessa giornata
            (per esempio pausa pranzo).
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              value={membroDaAggiungere}
              onChange={(e) => setMembroDaAggiungere(e.target.value)}
              style={{ flex: 1, padding: 8 }}
            >
              <option value="">Seleziona persona...</option>
              {membri.map((m) => (
                <option key={m.profilo_id} value={m.profilo_id}>
                  {[m.nome, m.cognome].filter(Boolean).join(" ") || m.nome_impresa || m.email} ({m.ruolo})
                  {dentro.has(m.profilo_id) ? " — in cantiere" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => membroDaAggiungere && registraIngressoOUscita(membroDaAggiungere)}
              disabled={!membroDaAggiungere}
              style={{
                padding: "8px 20px",
                backgroundColor: selezionatoDentro ? "#c0392b" : "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: membroDaAggiungere ? "pointer" : "not-allowed",
                opacity: membroDaAggiungere ? 1 : 0.6,
              }}
            >
              {selezionatoDentro ? "Registra uscita" : "Registra ingresso"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
