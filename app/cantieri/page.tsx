"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Cantiere = {
  id: string;
  nome: string;
  indirizzo: string | null;
  creato_il: string;
};

export default function CantieriPage() {
  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [nome, setNome] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  async function caricaCantieri() {
    const { data, error } = await supabase
      .from("cantieri")
      .select("id, nome, indirizzo, creato_il")
      .order("creato_il", { ascending: false });
    if (!error && data) setCantieri(data);
    setCaricamento(false);
  }

  useEffect(() => {
    caricaCantieri();
  }, []);

  async function creaCantiere(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { error } = await supabase.from("cantieri").insert({
      nome,
      indirizzo,
      creato_da: userData.user.id,
    });

    if (error) {
      setErrore(error.message);
      return;
    }

    setNome("");
    setIndirizzo("");
    caricaCantieri();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>I miei cantieri</h1>

      <form onSubmit={creaCantiere} style={{ margin: "16px 0", padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Nuovo cantiere</h3>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Nome cantiere"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Indirizzo"
            value={indirizzo}
            onChange={(e) => setIndirizzo(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        <button type="submit" style={{ padding: "8px 16px" }}>Crea cantiere</button>
      </form>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {cantieri.map((c) => (
          <li key={c.id} style={{ padding: 12, borderBottom: "1px solid #eee" }}>
            <Link href={`/cantieri/${c.id}`}>
              <strong>{c.nome}</strong>
            </Link>
            {c.indirizzo && <span style={{ color: "#666" }}> — {c.indirizzo}</span>}
          </li>
        ))}
      </ul>
      {cantieri.length === 0 && <p>Nessun cantiere ancora. Creane uno sopra.</p>}
    </div>
  );
}
