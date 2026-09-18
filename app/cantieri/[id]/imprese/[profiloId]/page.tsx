"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TipoDocumento = { id: string; nome: string; obbligatorio: boolean; categoria: string };
type Documento = { tipo_documento: string };

export default function DocumentiMembroPage() {
  const params = useParams();
  const cantiereId = params.id as string;
  const profiloId = params.profiloId as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membro, setMembro] = useState<any>(null);
  const [tipiRichiesti, setTipiRichiesti] = useState<TipoDocumento[]>([]);
  const [documentiCaricati, setDocumentiCaricati] = useState<Documento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica() {
    setErrore(null);

    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: m, error: mErr } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo, nome_impresa, attivita, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", profiloId)
      .maybeSingle();

    if (mErr || !m) {
      setErrore("Non hai i permessi per vedere questa pagina, o la persona non è membro del cantiere.");
      setCaricamento(false);
      return;
    }
    setMembro(m);

    const { data: ruoliExtra } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", m.id);
    const tuttiIRuoli = Array.from(new Set([m.ruolo, ...(ruoliExtra || []).map((r) => r.ruolo)]));

    const { data: tipi } = await supabase
      .from("tipi_documento")
      .select("id, nome, obbligatorio, categoria")
      .in("ruolo", tuttiIRuoli)
      .order("obbligatorio", { ascending: false });

    const tipiUnici = Array.from(new Map((tipi || []).map((t) => [t.nome, t])).values());
    setTipiRichiesti(tipiUnici);

    const { data: docs } = await supabase
      .from("documenti")
      .select("tipo_documento")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", profiloId);
    setDocumentiCaricati(docs || []);

    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId && profiloId) carica();
  }, [cantiereId, profiloId]);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  const categorie = ["sicurezza", "tecnico"];
  const etichettaCategoria: Record<string, string> = {
    sicurezza: "Documenti di sicurezza",
    tecnico: "Documenti tecnici",
  };

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <p>
        <Link href={`/cantieri/${cantiereId}/imprese`}>← Torna alle imprese</Link>
      </p>
      <h1>{membro.profili?.email}</h1>
      <p style={{ color: "#666" }}>
        {membro.ruolo} {membro.nome_impresa ? `— ${membro.nome_impresa}` : ""} {membro.attivita ? `(${membro.attivita})` : ""}
      </p>

      {categorie.map((cat) => {
        const tipiCategoria = tipiRichiesti.filter((t) => t.categoria === cat);
        if (tipiCategoria.length === 0) return null;
        return (
          <div key={cat} style={{ marginTop: 24 }}>
            <h3>{etichettaCategoria[cat]}</h3>
            {tipiCategoria.map((tipo) => {
              const numeroFile = documentiCaricati.filter((d) => d.tipo_documento === tipo.nome).length;
              return (
                <Link
                  key={tipo.id}
                  href={`/cantieri/${cantiereId}/imprese/${profiloId}/${tipo.id}`}
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
          </div>
        );
      })}
    </div>
  );
}
