"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Cantiere = {
  id: string;
  nome: string;
  indirizzo: string | null;
  archiviato: boolean;
};

export default function CantieriPage() {
  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [nome, setNome] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [comune, setComune] = useState("");
  const [provincia, setProvincia] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [modificaId, setModificaId] = useState<string | null>(null);
  const [nomeModifica, setNomeModifica] = useState("");
  const [indirizzoModifica, setIndirizzoModifica] = useState("");

  async function caricaCantieri() {
    const { data, error } = await supabase
      .from("cantieri")
      .select("id, nome, indirizzo, archiviato")
      .eq("archiviato", false)
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
      comune: comune || null,
      provincia: provincia || null,
      creato_da: userData.user.id,
    });

    if (error) {
      setErrore(error.message);
      return;
    }

    setNome("");
    setIndirizzo("");
    setComune("");
    setProvincia("");
    caricaCantieri();
  }

  function iniziaModifica(c: Cantiere) {
    setModificaId(c.id);
    setNomeModifica(c.nome);
    setIndirizzoModifica(c.indirizzo ?? "");
  }

  async function salvaModifica(id: string) {
    const { error } = await supabase
      .from("cantieri")
      .update({ nome: nomeModifica, indirizzo: indirizzoModifica })
      .eq("id", id);

    if (error) {
      setErrore(error.message);
      return;
    }
    setModificaId(null);
    caricaCantieri();
  }

  async function archiviaCantiere(id: string, nomeCantiere: string) {
    if (!confirm(`Archiviare "${nomeCantiere}"? Non apparirà più nella lista, ma i dati restano salvati.`)) return;

    const { error } = await supabase.from("cantieri").update({ archiviato: true }).eq("id", id);
    if (error) {
      setErrore(error.message);
      return;
    }
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
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            placeholder="Comune"
            value={comune}
            onChange={(e) => setComune(e.target.value)}
            style={{ flex: 1, padding: 8 }}
          />
          <input
            placeholder="Provincia (es. VE)"
            value={provincia}
            onChange={(e) => setProvincia(e.target.value)}
            style={{ width: 100, padding: 8 }}
          />
        </div>
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        <button type="submit" style={{ padding: "8px 16px" }}>Crea cantiere</button>
      </form>

      {cantieri.map((c) => (
        <div key={c.id} style={{ padding: 12, marginBottom: 8, border: "1px solid #eee", borderRadius: 8 }}>
          {modificaId === c.id ? (
            <div>
              <input
                value={nomeModifica}
                onChange={(e) => setNomeModifica(e.target.value)}
                style={{ width: "100%", padding: 6, marginBottom: 6 }}
              />
              <input
                value={indirizzoModifica}
                onChange={(e) => setIndirizzoModifica(e.target.value)}
                style={{ width: "100%", padding: 6, marginBottom: 6 }}
              />
              <button onClick={() => salvaModifica(c.id)} style={{ padding: "4px 12px", marginRight: 8 }}>
                Salva
              </button>
              <button onClick={() => setModificaId(null)} style={{ padding: "4px 12px" }}>
                Annulla
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{c.nome}</strong>
                {c.indirizzo && <span style={{ color: "#666" }}> — {c.indirizzo}</span>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Link
                  href={`/cantieri/${c.id}`}
                  style={{ padding: "4px 10px", border: "1px solid #1a73e8", color: "#1a73e8", borderRadius: 4, textDecoration: "none" }}
                >
                  Apri
                </Link>
                <button onClick={() => iniziaModifica(c)} style={{ padding: "4px 10px" }}>
                  Modifica
                </button>
                <button
                  onClick={() => archiviaCantiere(c.id, c.nome)}
                  style={{ padding: "4px 10px", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 4, background: "none" }}
                >
                  Archivia
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {cantieri.length === 0 && <p>Nessun cantiere ancora. Creane uno sopra.</p>}
    </div>
  );
}
