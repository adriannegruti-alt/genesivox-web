"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Cantiere = {
  id: string;
  nome: string;
  indirizzo: string | null;
  comune: string | null;
  provincia: string | null;
};

export default function VistaIspettivaPage() {
  const [autorizzato, setAutorizzato] = useState<boolean | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [risultati, setRisultati] = useState<Cantiere[]>([]);
  const [caricamento, setCaricamento] = useState(false);

  useEffect(() => {
    async function controllaAccesso() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setAutorizzato(false);
        return;
      }
      const { data: profilo } = await supabase
        .from("profili")
        .select("autorita_controllo")
        .eq("id", userData.user.id)
        .maybeSingle();
      setAutorizzato(!!profilo?.autorita_controllo);
    }
    controllaAccesso();
  }, []);

  async function cerca(e: React.FormEvent) {
    e.preventDefault();
    setCaricamento(true);

    let query = supabase.from("cantieri").select("id, nome, indirizzo, comune, provincia").eq("archiviato", false);

    if (ricerca.trim()) {
      query = query.or(`nome.ilike.%${ricerca}%,comune.ilike.%${ricerca}%,provincia.ilike.%${ricerca}%,indirizzo.ilike.%${ricerca}%`);
    }

    const { data } = await query.limit(50);
    setRisultati(data || []);
    setCaricamento(false);
  }

  if (autorizzato === null) return <p style={{ padding: 24 }}>Caricamento...</p>;

  if (!autorizzato) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p style={{ color: "red" }}>Questa pagina è riservata alle autorità di controllo (ASL, Ispettorato).</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Vista Ispettiva</h1>
      <p style={{ color: "#666" }}>
        Cerca un cantiere per nome, comune o provincia. Se sei fisicamente in cantiere, puoi anche scansionare il
        QR-code affisso: essendo già autenticato come autorità di controllo, ti porterà direttamente alla sua scheda.
      </p>

      <form onSubmit={cerca} style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          placeholder="Nome, comune o provincia..."
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" style={{ padding: "8px 16px" }}>
          Cerca
        </button>
      </form>

      {caricamento && <p>Ricerca in corso...</p>}

      {risultati.map((c) => (
        <Link
          key={c.id}
          href={`/cantieri/${c.id}`}
          style={{
            display: "block",
            padding: 12,
            marginBottom: 8,
            border: "1px solid #ddd",
            borderRadius: 8,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <strong>{c.nome}</strong>
          <div style={{ fontSize: 13, color: "#666" }}>
            {[c.indirizzo, c.comune, c.provincia].filter(Boolean).join(", ")}
          </div>
        </Link>
      ))}

      {!caricamento && risultati.length === 0 && ricerca && <p style={{ color: "#666" }}>Nessun risultato.</p>}
    </div>
  );
}
