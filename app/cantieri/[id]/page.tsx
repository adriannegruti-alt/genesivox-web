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
  profili: { email: string } | null;
};

export default function CantiereDettaglioPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [emailNuovo, setEmailNuovo] = useState("");
  const [ruoloNuovo, setRuoloNuovo] = useState("lavoratore");
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
      .select("id, ruolo, profili!cantiere_membri_profilo_id_fkey(email)")
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

    const { data: sessione } = await supabase.auth.getSession();
    const token = sessione?.session?.access_token;

    const risposta = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invita-utente`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: emailNuovo, cantiereId, ruolo: ruoloNuovo }),
      }
    );

    const risultato = await risposta.json();

    if (!risposta.ok) {
      setErrore(risultato.error ?? "Errore durante l'invito");
      return;
    }

    setMessaggio("Persona invitata: riceverà un'email per accedere al cantiere.");
    setEmailNuovo("");
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
          </tr>
        </thead>
        <tbody>
          {membri.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{m.profili?.email}</td>
              <td style={{ padding: 8 }}>
                {RUOLI.find((r) => r.value === m.ruolo)?.label ?? m.ruolo}
              </td>
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
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        {messaggio && <p style={{ color: "green" }}>{messaggio}</p>}
        <button type="submit" style={{ padding: "8px 16px" }}>Aggiungi</button>
      </form>
    </div>
  );
}
