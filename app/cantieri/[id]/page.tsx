"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const RUOLI = [
  { value: "committente", label: "Committente" },
  { value: "cse_csp", label: "CSE / CSP" },
  { value: "rspp", label: "RSPP" },
  { value: "capocantiere", label: "Capocantiere" },
  { value: "impresa", label: "Impresa" },
  { value: "lavoratore", label: "Lavoratore" },
  { value: "asl_ispettorato", label: "ASL / Ispettorato" },
];

type Membro = {
  id: string;
  ruolo: string;
  nome_impresa: string | null;
  attivita: string | null;
  profili: { email: string } | null;
};

export default function CantiereDettaglioPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [emailNuovo, setEmailNuovo] = useState("");
  const [ruoloNuovo, setRuoloNuovo] = useState("lavoratore");
  const [nomeImpresaNuovo, setNomeImpresaNuovo] = useState("");
  const [attivitaNuovo, setAttivitaNuovo] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  async function carica() {
    const { data: c } = await supabase
      .from("cantieri")
      .select("id, nome, indirizzo, qr_token")
      .eq("id", cantiereId)
      .single();
    setCantiere(c);

    const { data: m, error: mErr } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo, nome_impresa, attivita, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId);

    if (mErr) console.error("Errore caricamento membri:", mErr);
    setMembri((m as unknown as Membro[]) || []);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  async function aggiungiPersona(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);

    // Cerca se esiste già un profilo con questa email
    const { data: profiloEsistente } = await supabase
      .from("profili")
      .select("id")
      .eq("email", emailNuovo)
      .maybeSingle();

    if (!profiloEsistente) {
      setErrore(
        "Questa persona non ha ancora un account GENESIVOX. Creala prima da Supabase (Authentication → Add user), poi riprova qui."
      );
      return;
    }

    const { error } = await supabase.from("cantiere_membri").upsert(
      {
        cantiere_id: cantiereId,
        profilo_id: profiloEsistente.id,
        ruolo: ruoloNuovo,
        nome_impresa: nomeImpresaNuovo || null,
        attivita: attivitaNuovo || null,
      },
      { onConflict: "cantiere_id,profilo_id" }
    );

    if (error) {
      setErrore(error.message);
      return;
    }

    setMessaggio("Persona aggiunta al cantiere.");
    setEmailNuovo("");
    setNomeImpresaNuovo("");
    setAttivitaNuovo("");
    carica();
  }

  if (!cantiere) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>{cantiere.nome}</h1>
      {cantiere.indirizzo && <p style={{ color: "#666" }}>{cantiere.indirizzo}</p>}

      <h2>Persone assegnate</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Ruolo</th>
            <th style={{ padding: 8 }}>Impresa</th>
            <th style={{ padding: 8 }}>Attività</th>
          </tr>
        </thead>
        <tbody>
          {membri.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{m.profili?.email}</td>
              <td style={{ padding: 8 }}>
                {RUOLI.find((r) => r.value === m.ruolo)?.label ?? m.ruolo}
              </td>
              <td style={{ padding: 8 }}>{m.nome_impresa ?? "—"}</td>
              <td style={{ padding: 8 }}>{m.attivita ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={aggiungiPersona} style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Aggiungi persona</h3>
        <div style={{ marginBottom: 8 }}>
          <input
            type="email"
            placeholder="Email della persona (deve avere già un account)"
            value={emailNuovo}
            onChange={(e) => setEmailNuovo(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <select
            value={ruoloNuovo}
            onChange={(e) => setRuoloNuovo(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            {RUOLI.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Nome impresa"
            value={nomeImpresaNuovo}
            onChange={(e) => setNomeImpresaNuovo(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Attività svolta (es. idraulico, elettricista, piastrellista)"
            value={attivitaNuovo}
            onChange={(e) => setAttivitaNuovo(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        {messaggio && <p style={{ color: "green" }}>{messaggio}</p>}
        <button type="submit" style={{ padding: "8px 16px" }}>Aggiungi</button>
      </form>
    </div>
  );
}
