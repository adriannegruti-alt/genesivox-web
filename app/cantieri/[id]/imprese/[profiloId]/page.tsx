"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TipoDocumento = { id: string; nome: string; obbligatorio: boolean; categoria: string };
type Documento = { tipo_documento: string };

const RUOLI_RICHIEDIBILI = [
  { value: "committente", label: "Committente" },
  { value: "impresa_edile", label: "Impresa edile" },
];

export default function DocumentiMembroPage() {
  const params = useParams();
  const cantiereId = params.id as string;
  const profiloId = params.profiloId as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membro, setMembro] = useState<any>(null);
  const [ruoliCompleti, setRuoliCompleti] = useState<string[]>([]);
  const [tipiRichiesti, setTipiRichiesti] = useState<TipoDocumento[]>([]);
  const [documentiCaricati, setDocumentiCaricati] = useState<Documento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const [utenteId, setUtenteId] = useState<string | null>(null);
  const [richiesteRuolo, setRichiesteRuolo] = useState<{ ruolo: string; stato: string }[]>([]);
  const [inviandoRichiesta, setInviandoRichiesta] = useState<string | null>(null);
  const [messaggioRichiesta, setMessaggioRichiesta] = useState<string | null>(null);

  async function carica() {
    setErrore(null);

    const { data: userData } = await supabase.auth.getUser();
    setUtenteId(userData?.user?.id ?? null);

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

    // Ruolo principale + ruoli extra assegnati da "Ruoli extra": qui li combiniamo
    // sia per capire quali documenti servono, sia per mostrarli tutti nella pagina.
    const { data: ruoliExtra } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", m.id);
    const tuttiIRuoli = Array.from(new Set([m.ruolo, ...(ruoliExtra || []).map((r) => r.ruolo)]));
    setRuoliCompleti(tuttiIRuoli);

    // Richieste di ruolo (Committente / Impresa edile) già inviate da questa persona,
    // per non far ripetere una richiesta già in corso o già approvata.
    const { data: richieste } = await supabase
      .from("richieste_ruolo")
      .select("ruolo, stato")
      .eq("cantiere_id", cantiereId)
      .eq("membro_id", m.id);
    setRichiesteRuolo(richieste || []);

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

  async function richiediRuolo(ruolo: string) {
    if (!membro) return;
    setInviandoRichiesta(ruolo);
    setMessaggioRichiesta(null);

    const { error, data } = await supabase
      .from("richieste_ruolo")
      .insert({ cantiere_id: cantiereId, membro_id: membro.id, ruolo })
      .select("id");

    if (error) {
      setMessaggioRichiesta("Errore: " + error.message);
    } else if (!data || data.length === 0) {
      setMessaggioRichiesta("Non è stato possibile inviare la richiesta.");
    } else {
      setMessaggioRichiesta("✅ Richiesta inviata. Il creatore del cantiere o l'amministratore la esamineranno a breve.");
    }
    setInviandoRichiesta(null);
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  const categorie = ["sicurezza", "tecnico"];
  const etichettaCategoria: Record<string, string> = {
    sicurezza: "Documenti di sicurezza",
    tecnico: "Documenti tecnici",
  };

  const eLaMiaPagina = utenteId && utenteId === profiloId;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <p>
        <Link href={`/cantieri/${cantiereId}/imprese`}>← Torna alle imprese</Link>
      </p>
      <h1>{membro.profili?.email}</h1>
      <p style={{ color: "#666" }}>
        {ruoliCompleti.join(", ")} {membro.nome_impresa ? `— ${membro.nome_impresa}` : ""}{" "}
        {membro.attivita ? `(${membro.attivita})` : ""}
      </p>

      {eLaMiaPagina && (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            backgroundColor: "#fafafa",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Richiedi un ruolo</h3>
          <p style={{ fontSize: 13, color: "#666" }}>
            I ruoli "Committente" e "Impresa edile" danno accesso a tutti i preventivi del cantiere (non solo i tuoi),
            quindi vanno approvati dal creatore del cantiere o dall'amministratore.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {RUOLI_RICHIEDIBILI.map((r) => {
              const giaAssegnato = ruoliCompleti.includes(r.value);
              const richiestaEsistente = richiesteRuolo.find((x) => x.ruolo === r.value);

              if (giaAssegnato) {
                return (
                  <span key={r.value} style={{ padding: "6px 12px", borderRadius: 16, backgroundColor: "#34a853", color: "#fff", fontSize: 13 }}>
                    ✓ {r.label} (già attivo)
                  </span>
                );
              }
              if (richiestaEsistente?.stato === "in_attesa") {
                return (
                  <span key={r.value} style={{ padding: "6px 12px", borderRadius: 16, backgroundColor: "#fbbc04", color: "#333", fontSize: 13 }}>
                    ⏳ {r.label} (in attesa di approvazione)
                  </span>
                );
              }
              if (richiestaEsistente?.stato === "rifiutato") {
                return (
                  <button
                    key={r.value}
                    disabled={inviandoRichiesta === r.value}
                    onClick={() => richiediRuolo(r.value)}
                    style={{ padding: "6px 12px", borderRadius: 16, border: "1px solid #c0392b", backgroundColor: "#fff", color: "#c0392b", fontSize: 13, cursor: "pointer" }}
                  >
                    Richiesta rifiutata — Riprova {r.label}
                  </button>
                );
              }
              return (
                <button
                  key={r.value}
                  disabled={inviandoRichiesta === r.value}
                  onClick={() => richiediRuolo(r.value)}
                  style={{ padding: "6px 12px", borderRadius: 16, border: "1px solid #1a73e8", backgroundColor: "#fff", color: "#1a73e8", fontSize: 13, cursor: "pointer" }}
                >
                  {inviandoRichiesta === r.value ? "Invio..." : `+ Richiedi ${r.label}`}
                </button>
              );
            })}
          </div>
          {messaggioRichiesta && <p style={{ marginTop: 12, fontSize: 13 }}>{messaggioRichiesta}</p>}
        </div>
      )}

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
