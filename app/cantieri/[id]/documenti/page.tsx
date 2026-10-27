"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TipoDocumento = { id: string; nome: string; obbligatorio: boolean; caratteristica: string | null };
type Documento = { id: string; tipo_documento: string };

export default function DocumentiCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [caratteristiche, setCaratteristiche] = useState<string[]>([]);
  const [mieiRuoli, setMieiRuoli] = useState<string[]>([]);
  const [tipiRichiesti, setTipiRichiesti] = useState<TipoDocumento[]>([]);
  const [documentiCaricati, setDocumentiCaricati] = useState<Documento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica() {
    setErrore(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: c } = await supabase.from("cantieri").select("id, nome, caratteristiche").eq("id", cantiereId).single();
    setCantiere(c);
    setCaratteristiche(c?.caratteristiche || []);

    const { data: membro } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", userData.user.id)
      .maybeSingle();

    if (!membro) {
      setErrore("Non sei ancora membro approvato di questo cantiere.");
      setCaricamento(false);
      return;
    }

    const { data: ruoliExtra } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", membro.id);
    const tuttiIRuoli = Array.from(new Set([membro.ruolo, ...(ruoliExtra || []).map((r) => r.ruolo)]));
    setMieiRuoli(tuttiIRuoli);

    const { data: tipi } = await supabase
      .from("tipi_documento")
      .select("id, nome, obbligatorio, caratteristica")
      .in("ruolo", tuttiIRuoli)
      .order("obbligatorio", { ascending: false });

    // Rimuove eventuali duplicati (stesso nome documento richiesto da più ruoli)
    const tipiUnici = Array.from(new Map((tipi || []).map((t) => [t.nome, t])).values());
    setTipiRichiesti(tipiUnici);

    const { data: docs } = await supabase
      .from("documenti")
      .select("id, tipo_documento")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", userData.user.id);
    setDocumentiCaricati(docs || []);

    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore && mieiRuoli.length === 0) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  // Stato di ogni documento per QUESTO cantiere
  function stato(t: TipoDocumento): "obbligatorio" | "richiesto" | "non_richiesto" | "condizionale" {
    if (t.obbligatorio) return "obbligatorio";
    if (t.caratteristica) return caratteristiche.includes(t.caratteristica) ? "richiesto" : "non_richiesto";
    return "condizionale";
  }
  const ordine = { obbligatorio: 0, richiesto: 1, condizionale: 2, non_richiesto: 3 };
  const tipiOrdinati = [...tipiRichiesti].sort((a, b) => ordine[stato(a)] - ordine[stato(b)]);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Documenti — {cantiere?.nome}</h1>
      <p style={{ color: "#666" }}>I tuoi ruoli in questo cantiere: <strong>{mieiRuoli.join(", ")}</strong></p>

      {tipiOrdinati.map((tipo) => {
        const st = stato(tipo);
        const numeroFile = documentiCaricati.filter((d) => d.tipo_documento === tipo.nome).length;
        return (
          <Link
            key={tipo.id}
            href={`/cantieri/${cantiereId}/documenti/${tipo.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 12,
              marginBottom: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
              opacity: st === "non_richiesto" ? 0.55 : 1,
            }}
          >
            <div>
              <strong>{tipo.nome}</strong>{" "}
              {st === "obbligatorio" && <span style={{ color: "#c0392b", fontSize: 12 }}>(obbligatorio)</span>}
              {st === "richiesto" && (
                <span style={{ color: "#c0392b", fontSize: 12 }}>(richiesto per questo cantiere)</span>
              )}
              {st === "condizionale" && <span style={{ color: "#888", fontSize: 12 }}>(condizionale)</span>}
              {st === "non_richiesto" && (
                <span style={{ color: "#888", fontSize: 12 }}>(non richiesto per questo cantiere)</span>
              )}
              <div style={{ fontSize: 13, color: numeroFile > 0 ? "green" : st === "non_richiesto" ? "#888" : "#c0392b" }}>
                {numeroFile > 0 ? `${numeroFile} file caricati` : st === "non_richiesto" ? "Non necessario" : "Mancante"}
              </div>
            </div>
            <span style={{ color: "#999" }}>→</span>
          </Link>
        );
      })}
      {tipiRichiesti.length === 0 && <p>Nessun documento richiesto per il tuo ruolo.</p>}
    </div>
  );
}
