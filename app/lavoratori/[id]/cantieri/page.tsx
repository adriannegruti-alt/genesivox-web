"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Cantiere = { id: string; nome: string; archiviato: boolean | null };

export default function CantieriLavoratorePage() {
  const params = useParams();
  const lavoratoreId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [nomeLavoratore, setNomeLavoratore] = useState("");
  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [assegnati, setAssegnati] = useState<Set<string>>(new Set());
  const [caricamento, setCaricamento] = useState(true);
  const [occupato, setOccupato] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica() {
    const { data: u } = await supabase.auth.getUser();
    const uid = u?.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setCaricamento(false);
      return;
    }

    const { data: l } = await supabase
      .from("lavoratori")
      .select("nome, cognome")
      .eq("id", lavoratoreId)
      .maybeSingle();
    if (!l) {
      setErrore("Lavoratore non trovato.");
      setCaricamento(false);
      return;
    }
    setNomeLavoratore(`${l.nome} ${l.cognome}`);

    // Cantieri in cui la mia impresa può assegnare: quelli che ho creato o in cui sono membro approvato
    const { data: tutti } = await supabase.from("cantieri").select("id, nome, creato_da, archiviato").order("nome");
    const { data: mieiMembri } = await supabase
      .from("cantiere_membri")
      .select("cantiere_id")
      .eq("profilo_id", uid)
      .eq("stato", "approvato");
    const idMembro = new Set((mieiMembri || []).map((m) => String(m.cantiere_id)));

    const { data: righe } = await supabase
      .from("lavoratori_cantiere")
      .select("cantiere_id")
      .eq("lavoratore_id", lavoratoreId);
    const idAssegnati = new Set((righe || []).map((r) => String(r.cantiere_id)));
    setAssegnati(idAssegnati);

    const consentiti = (tutti || []).filter(
      (c) =>
        (c.creato_da === uid || idMembro.has(String(c.id))) && (!c.archiviato || idAssegnati.has(String(c.id)))
    );
    setCantieri(consentiti.map((c) => ({ id: String(c.id), nome: c.nome, archiviato: c.archiviato })));
    setCaricamento(false);
  }

  useEffect(() => {
    if (lavoratoreId) carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lavoratoreId]);

  async function cambia(cantiere: Cantiere) {
    if (!userId) return;
    setErrore(null);
    setOccupato(cantiere.id);
    const giaAssegnato = assegnati.has(cantiere.id);

    if (giaAssegnato) {
      const { error } = await supabase
        .from("lavoratori_cantiere")
        .delete()
        .eq("lavoratore_id", lavoratoreId)
        .eq("cantiere_id", cantiere.id);
      if (error) setErrore(error.message);
    } else {
      const { error } = await supabase
        .from("lavoratori_cantiere")
        .insert({ lavoratore_id: lavoratoreId, cantiere_id: cantiere.id, impresa_id: userId });
      if (error) setErrore("Non è stato possibile assegnare il lavoratore a questo cantiere.");
    }
    setOccupato(null);
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!userId) return <p style={{ padding: 24 }}>Devi accedere.</p>;
  if (!nomeLavoratore) return <p style={{ padding: 24, color: "red" }}>{errore ?? "Lavoratore non trovato."}</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/lavoratori" style={{ color: "#1a73e8", textDecoration: "none" }}>
          ← Torna all&apos;elenco lavoratori
        </Link>
      </p>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Cantieri di {nomeLavoratore}</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Spunta i cantieri in cui questo lavoratore opera. In quei cantieri committente, impresa edile, CSE/CSP,
        capocantiere e RSPP potranno consultare i suoi dati e gli attestati di formazione. Dell&apos;idoneità sanitaria
        vedranno solo l&apos;esito e la scadenza, non il documento.
      </p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {cantieri.length === 0 ? (
        <p style={{ color: "#888" }}>
          Non risulti ancora membro di nessun cantiere. Entra in un cantiere dal QR e fatti approvare, poi torna qui.
        </p>
      ) : (
        <div style={{ border: "1px solid #ddd", borderRadius: 8 }}>
          {cantieri.map((c, i) => (
            <label
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
                borderTop: i === 0 ? "none" : "1px solid #eee",
                cursor: occupato ? "wait" : "pointer",
                opacity: occupato === c.id ? 0.5 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={assegnati.has(c.id)}
                disabled={!!occupato}
                onChange={() => cambia(c)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 15 }}>
                {c.nome}
                {c.archiviato && <span style={{ marginLeft: 8, fontSize: 12, color: "#c0392b" }}>archiviato</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
