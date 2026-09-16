"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TipoDocumento = { id: string; nome: string; obbligatorio: boolean };
type Documento = { id: string; tipo_documento: string };

export default function DocumentiCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [mioRuolo, setMioRuolo] = useState<string | null>(null);
  const [tipiRichiesti, setTipiRichiesti] = useState<TipoDocumento[]>([]);
  const [documentiCaricati, setDocumentiCaricati] = useState<Documento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica() {
    setErrore(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: membro } = await supabase
      .from("cantiere_membri")
      .select("ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", userData.user.id)
      .maybeSingle();

    if (!membro) {
      setErrore("Non sei ancora membro approvato di questo cantiere.");
      setCaricamento(false);
      return;
    }
    setMioRuolo(membro.ruolo);

    const { data: tipi } = await supabase
      .from("tipi_documento")
      .select("id, nome, obbligatorio")
      .eq("ruolo", membro.ruolo)
      .order("obbligatorio", { ascending: false });
    setTipiRichiesti(tipi || []);

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
  if (errore && !mioRuolo) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Documenti — {cantiere?.nome}</h1>
      <p style={{ color: "#666" }}>Il tuo ruolo in questo cantiere: <strong>{mioRuolo}</strong></p>

      {tipiRichiesti.map((tipo) => {
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
            }}
          >
            <div>
              <strong>{tipo.nome}</strong>{" "}
              {tipo.obbligatorio ? (
                <span style={{ color: "#c0392b", fontSize: 12 }}>(obbligatorio)</span>
              ) : (
                <span style={{ color: "#888", fontSize: 12 }}>(condizionale)</span>
              )}
              <div style={{ fontSize: 13, color: numeroFile > 0 ? "green" : "#c0392b" }}>
                {numeroFile > 0 ? `${numeroFile} file caricati` : "Mancante"}
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
