"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const ATTIVITA = [
  "Comitente",
  "Servizi per la sicurezza",
  "Noleggio attrezzature edili",
  "Impresa edile",
  "Impresa segnaletica stradale",
  "Agenzia comunicazione visiva",
  "Sistemi di sicurezza e vigilanza",
  "Palificazioni e consolidamento terreni",
  "Elettrico",
  "Idro-termosanitario",
  "Movimento terra e scavi",
  "Trasporto conto terzi edili e gestione rifiuti speciali",
  "Forniture di calcestruzzo",
  "Presagomatori di ferro",
  "Carpenteria edile",
  "Noleggio e montaggio di gru edili",
  "Noleggio e montaggio di ponteggi",
  "Isolamenti termoacustici",
  "Impermeabilizzazione",
  "Aziende ascensoristiche",
  "Aziende sicurezza antincendio",
  "Imprese di intonacatura",
  "Imprese di massetti",
  "Imprese Gessisti",
  "Imprese di tinteggiatura e verniciatura",
  "Falegnamerie / Carpenterie interne",
  "Fabbri / Vetrerie industriali",
  "Imprese di costruzioni stradali / Betonelle / Asfaltisti",
  "Imprese di scavi",
  "Aziende di giardinaggio",
  "Imprese di pulizie",
];

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

  const [membri, setMembri] = useState<Membro[]>([]);
  const [attivitaExtraPerMembro, setAttivitaExtraPerMembro] = useState<Record<string, string[]>>({});
  const [ruoliExtraPerMembro, setRuoliExtraPerMembro] = useState<Record<string, string[]>>({});
  const [attivitaSelezionata, setAttivitaSelezionata] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [emailNuovo, setEmailNuovo] = useState("");
  const [nomeImpresaNuovo, setNomeImpresaNuovo] = useState("");

  async function carica() {
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

    const membriCaricati = (m as unknown as Membro[]) || [];
    setMembri(membriCaricati);

    // Carica attività extra e ruoli extra di tutti i membri, in due query uniche
    // (invece che una per persona), cosi' la lista si compila da sola con tutto
    // quello che e' stato assegnato dalla pagina "Ruoli extra".
    const idMembri = membriCaricati.map((x) => x.id);
    if (idMembri.length > 0) {
      const { data: extraAttivita } = await supabase
        .from("membro_attivita")
        .select("membro_id, attivita")
        .in("membro_id", idMembri);
      const mappaAttivita: Record<string, string[]> = {};
      (extraAttivita || []).forEach((e) => {
        if (!mappaAttivita[e.membro_id]) mappaAttivita[e.membro_id] = [];
        mappaAttivita[e.membro_id].push(e.attivita);
      });
      setAttivitaExtraPerMembro(mappaAttivita);

      const { data: extraRuoli } = await supabase
        .from("membro_ruoli")
        .select("membro_id, ruolo")
        .in("membro_id", idMembri);
      const mappaRuoli: Record<string, string[]> = {};
      (extraRuoli || []).forEach((r) => {
        if (!mappaRuoli[r.membro_id]) mappaRuoli[r.membro_id] = [];
        mappaRuoli[r.membro_id].push(r.ruolo);
      });
      setRuoliExtraPerMembro(mappaRuoli);
    }

    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  async function aggiungiImpresa(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);

    if (!attivitaSelezionata) return;

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

    const { error } = await supabase.from("cantiere_membri").insert({
      cantiere_id: cantiereId,
      profilo_id: profiloEsistente.id,
      ruolo: "impresa",
      nome_impresa: nomeImpresaNuovo,
      attivita: attivitaSelezionata,
      stato: "approvato",
    });

    if (error) {
      setErrore(error.message);
      return;
    }

    setMessaggio("Impresa aggiunta.");
    setEmailNuovo("");
    setNomeImpresaNuovo("");
    setMostraForm(false);
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore && membri.length === 0) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  function attivitaDiMembro(m: Membro): string[] {
    const extra = attivitaExtraPerMembro[m.id] || [];
    return m.attivita ? [m.attivita, ...extra] : extra;
  }

  function ruoliDiMembro(m: Membro): string[] {
    const extra = ruoliExtraPerMembro[m.id] || [];
    return Array.from(new Set([m.ruolo, ...extra]));
  }

  const attivitaConImprese = new Set(membri.flatMap((m) => attivitaDiMembro(m)));
  const impreseAttivitaSelezionata = membri.filter((m) => attivitaSelezionata && attivitaDiMembro(m).includes(attivitaSelezionata));

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Imprese e subappaltatori</h1>
      <div className="colonne-affiancate" style={{ display: "flex", gap: 24, marginTop: 16 }}>
        {/* Colonna attività */}
        <div className="colonna-larghezza-fissa" style={{ width: 280, flexShrink: 0, maxHeight: "70vh", overflowY: "auto" }}>
          {ATTIVITA.map((att) => {
            const presente = attivitaConImprese.has(att);
            return (
              <div
                key={att}
                onClick={() => setAttivitaSelezionata(att)}
                style={{
                  padding: "8px 12px",
                  marginBottom: 4,
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                  backgroundColor: att === attivitaSelezionata ? "#1a73e8" : presente ? "#eef6ff" : "#fff",
                  color: att === attivitaSelezionata ? "#fff" : "#333",
                }}
              >
                {att} {presente && att !== attivitaSelezionata && <span style={{ fontSize: 11 }}>●</span>}
              </div>
            );
          })}
        </div>

        {/* Colonna aziende per l'attività selezionata */}
        <div style={{ flex: 1 }}>
          {!attivitaSelezionata && <p style={{ color: "#666" }}>Seleziona un'attività a sinistra.</p>}

          {attivitaSelezionata && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>{attivitaSelezionata}</h2>
                <button onClick={() => setMostraForm(!mostraForm)} style={{ padding: "6px 14px" }}>
                  {mostraForm ? "Annulla" : "+ Aggiungi impresa"}
                </button>
              </div>

              {mostraForm && (
                <form
                  onSubmit={aggiungiImpresa}
                  style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 16 }}
                >
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
                    <input
                      placeholder="Nome impresa"
                      value={nomeImpresaNuovo}
                      onChange={(e) => setNomeImpresaNuovo(e.target.value)}
                      required
                      style={{ width: "100%", padding: 8 }}
                    />
                  </div>
                  {errore && <p style={{ color: "red" }}>{errore}</p>}
                  {messaggio && <p style={{ color: "green" }}>{messaggio}</p>}
                  <button type="submit" style={{ padding: "8px 16px" }}>
                    Salva
                  </button>
                </form>
              )}

              {impreseAttivitaSelezionata.map((m) => (
                <Link
                  key={m.id}
                  href={`/cantieri/${cantiereId}/imprese/${m.profilo_id}`}
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
                  <strong>{m.nome_impresa || "Nome azienda non inserito"}</strong>
                  <div style={{ fontSize: 13, color: "#666" }}>{m.profili?.email}</div>
                  <div style={{ fontSize: 12, color: "#1a73e8", marginTop: 2 }}>{ruoliDiMembro(m).join(", ")}</div>
                </Link>
              ))}
              {impreseAttivitaSelezionata.length === 0 && !mostraForm && (
                <p style={{ color: "#666" }}>Nessuna impresa ancora per questa attività.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
