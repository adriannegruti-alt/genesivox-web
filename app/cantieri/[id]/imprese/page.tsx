"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Membro = {
  id: string;
  profilo_id: string;
  ruolo: string;
  nome_impresa: string | null;
  attivita: string | null;
  stato: string;
  profili: { email: string } | null;
};

export default function ImpresePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [impresaSelezionata, setImpresaSelezionata] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [completamento, setCompletamento] = useState<Record<string, { caricati: number; richiesti: number }>>({});

  async function carica() {
    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: m, error } = await supabase
      .from("cantiere_membri")
      .select("id, profilo_id, ruolo, nome_impresa, attivita, stato, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId)
      .eq("stato", "approvato");

    if (error) {
      setErrore("Non hai i permessi per vedere questa pagina (solo committente/RSPP/CSE-CSP).");
      setCaricamento(false);
      return;
    }

    setMembri((m as unknown as Membro[]) || []);
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  // Calcola lo stato di completamento documenti per ogni membro, quando cambia l'impresa selezionata
  useEffect(() => {
    async function calcolaCompletamento() {
      const membriImpresa = membri.filter((m) => (m.nome_impresa ?? "Senza impresa") === impresaSelezionata);
      const nuovo: Record<string, { caricati: number; richiesti: number }> = {};

      for (const m of membriImpresa) {
        const { data: tipi } = await supabase.from("tipi_documento").select("nome").eq("ruolo", m.ruolo);
        const { data: docs } = await supabase
          .from("documenti")
          .select("tipo_documento")
          .eq("cantiere_id", cantiereId)
          .eq("profilo_id", m.profilo_id);

        const tipiCaricati = new Set((docs || []).map((d) => d.tipo_documento));
        nuovo[m.profilo_id] = { caricati: tipiCaricati.size, richiesti: (tipi || []).length };
      }
      setCompletamento(nuovo);
    }
    if (impresaSelezionata) calcolaCompletamento();
  }, [impresaSelezionata, membri, cantiereId]);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  const imprese = Array.from(new Set(membri.map((m) => m.nome_impresa ?? "Senza impresa")));
  const membriImpresaSelezionata = membri.filter((m) => (m.nome_impresa ?? "Senza impresa") === impresaSelezionata);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Imprese — {cantiere?.nome}</h1>
      <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
        {/* Sidebar sinistra */}
        <div style={{ width: 220, flexShrink: 0 }}>
          {imprese.map((nome) => (
            <div
              key={nome}
              onClick={() => setImpresaSelezionata(nome)}
              style={{
                padding: 12,
                marginBottom: 8,
                border: "1px solid #ddd",
                borderRadius: 8,
                cursor: "pointer",
                backgroundColor: nome === impresaSelezionata ? "#1a73e8" : "#fff",
                color: nome === impresaSelezionata ? "#fff" : "#000",
              }}
            >
              {nome}
            </div>
          ))}
          {imprese.length === 0 && <p style={{ color: "#666" }}>Nessuna impresa iscritta ancora.</p>}
        </div>

        {/* Pannello destro */}
        <div style={{ flex: 1 }}>
          {!impresaSelezionata && <p style={{ color: "#666" }}>Seleziona un'impresa a sinistra per vedere i dettagli.</p>}

          {impresaSelezionata && (
            <div>
              <h2>{impresaSelezionata}</h2>
              {membriImpresaSelezionata.map((m) => {
                const stato = completamento[m.profilo_id];
                return (
                  <Link
                    key={m.id}
                    href={`/cantieri/${cantiereId}/imprese/${m.profilo_id}`}
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
                      <strong>{m.profili?.email}</strong>
                      <div style={{ fontSize: 13, color: "#666" }}>
                        {m.ruolo} {m.attivita ? `— ${m.attivita}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: stato && stato.caricati >= stato.richiesti ? "green" : "#c0392b" }}>
                      {stato ? `${stato.caricati}/${stato.richiesti} documenti` : "..."}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
