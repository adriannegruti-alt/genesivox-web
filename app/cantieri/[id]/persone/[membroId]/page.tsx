"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

const RUOLI = [
  { value: "cse_csp", label: "CSE / CSP" },
  { value: "rspp", label: "RSPP" },
  { value: "capocantiere", label: "Capocantiere" },
  { value: "preposto", label: "Preposto" },
  { value: "impresa", label: "Impresa" },
  { value: "lavoratore", label: "Lavoratore" },
  { value: "asl_ispettorato", label: "ASL / Ispettorato" },
];

const DOCUMENTO_RICHIESTO_PER_RUOLO: Record<string, string> = {
  preposto: "Nomina a Preposto",
  capocantiere: "Nomina Capocantiere",
  rspp: "Nomina RSPP",
};

const ATTIVITA = [
  "Servizi per la sicurezza", "Noleggio attrezzature edili",
  "Impresa segnaletica stradale", "Agenzia comunicazione visiva", "Sistemi di sicurezza e vigilanza",
  "Palificazioni e consolidamento terreni", "Elettrico", "Idro-termosanitario",
  "Movimento terra e scavi", "Trasporto conto terzi edili e gestione rifiuti speciali",
  "Forniture di calcestruzzo", "Presagomatori di ferro", "Carpenteria edile",
  "Noleggio e montaggio di gru edili", "Noleggio e montaggio di ponteggi", "Isolamenti termoacustici",
  "Impermeabilizzazione", "Aziende ascensoristiche", "Aziende sicurezza antincendio",
  "Imprese di intonacatura", "Imprese di massetti", "Imprese Gessisti",
  "Imprese di tinteggiatura e verniciatura", "Falegnamerie / Carpenterie interne",
  "Fabbri / Vetrerie industriali", "Imprese di costruzioni stradali / Betonelle / Asfaltisti",
  "Imprese di scavi", "Aziende di giardinaggio", "Imprese di pulizie",
];

export default function RuoliAttivitaPage() {
  const params = useParams();
  const cantiereId = params.id as string;
  const membroId = params.membroId as string;

  const [membro, setMembro] = useState<any>(null);
  const [ruoliExtra, setRuoliExtra] = useState<string[]>([]);
  const [attivitaExtra, setAttivitaExtra] = useState<string[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [puoModificare, setPuoModificare] = useState(false);

  async function calcolaPermessi() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    const { data: profiloMio } = await supabase.from("profili").select("ruolo").eq("id", uid).maybeSingle();
    if (profiloMio?.ruolo === "admin") {
      setPuoModificare(true);
      return;
    }

    const { data: cantiere } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
    if (cantiere?.creato_da === uid) {
      setPuoModificare(true);
      return;
    }

    const { data: membroMio } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", uid)
      .maybeSingle();

    let ruoliMiei: string[] = membroMio?.ruolo ? [membroMio.ruolo] : [];
    if (membroMio) {
      const { data: ruoliExtraPropri } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", membroMio.id);
      ruoliMiei = ruoliMiei.concat((ruoliExtraPropri || []).map((r) => r.ruolo));
    }

    const autorizzato = ruoliMiei.some((r) => ["committente", "impresa_edile", "rspp"].includes(r));
    setPuoModificare(autorizzato);
  }

  async function carica() {
    const { data: m } = await supabase
      .from("cantiere_membri")
      .select("id, profilo_id, ruolo, attivita, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("id", membroId)
      .single();
    setMembro(m);

    const { data: ruoli } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", membroId);
    setRuoliExtra((ruoli || []).map((r) => r.ruolo));

    const { data: attivita } = await supabase.from("membro_attivita").select("attivita").eq("membro_id", membroId);
    setAttivitaExtra((attivita || []).map((a) => a.attivita));

    setCaricamento(false);
  }

  useEffect(() => {
    if (membroId) {
      carica();
      calcolaPermessi();
    }
  }, [membroId]);

  async function toggleRuolo(ruolo: string, attivo: boolean) {
    if (!puoModificare) return;
    setErrore(null);

    if (!attivo) {
      const documentoRichiesto = DOCUMENTO_RICHIESTO_PER_RUOLO[ruolo];
      if (documentoRichiesto) {
        const { count } = await supabase
          .from("documenti")
          .select("id", { count: "exact", head: true })
          .eq("cantiere_id", cantiereId)
          .eq("profilo_id", membro.profilo_id)
          .eq("tipo_documento", documentoRichiesto);

        if (!count) {
          const etichettaRuolo = RUOLI.find((r) => r.value === ruolo)?.label ?? ruolo;
          alert(
            `Per assegnare il ruolo "${etichettaRuolo}" devi prima caricare il documento "${documentoRichiesto}" (nomina/accordo firmato dall'impresa) nella scheda documenti di questa persona.`
          );
          return;
        }
      }
    }

    if (attivo) {
      const { error } = await supabase.from("membro_ruoli").delete().eq("membro_id", membroId).eq("ruolo", ruolo);
      if (error) return setErrore(error.message);
    } else {
      const { error } = await supabase.from("membro_ruoli").insert({ membro_id: membroId, ruolo });
      if (error) return setErrore(error.message);
    }
    carica();
  }

  async function toggleAttivita(attivita: string, attivo: boolean) {
    if (!puoModificare) return;
    setErrore(null);
    if (attivo) {
      const { error } = await supabase.from("membro_attivita").delete().eq("membro_id", membroId).eq("attivita", attivita);
      if (error) return setErrore(error.message);
    } else {
      const { error } = await supabase.from("membro_attivita").insert({ membro_id: membroId, attivita });
      if (error) return setErrore(error.message);
    }
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!membro) return <p style={{ padding: 24, color: "red" }}>Persona non trovata.</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 600 }}>
      <p>
        <Link href={`/cantieri/${cantiereId}/persone`}>← Torna a Persone assegnate</Link>
      </p>
      <h1>{membro.profili?.email}</h1>
      <p style={{ color: "#666" }}>Ruolo principale: <strong>{membro.ruolo}</strong></p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {!puoModificare && (
        <p style={{ color: "#666", fontSize: 13, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 6 }}>
          Puoi consultare i ruoli e le attività di questa persona, ma non puoi modificarli.
        </p>
      )}

      <div style={{ backgroundColor: "#fff8e1", border: "1px solid #fbbc04", borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13 }}>
        I ruoli <strong>Committente</strong> e <strong>Impresa edile</strong> non si attivano più da qui.
        Il Committente viene assegnato automaticamente a chi crea il cantiere. L'Impresa edile la assegna
        direttamente il Committente (o l'amministratore) dalla pagina della persona in "Imprese e subappaltatori".
      </div>

      <h3>Ruoli aggiuntivi</h3>
      <p style={{ fontSize: 13, color: "#666" }}>
        Es. chi si occupa di sicurezza spesso fa anche direzione lavori. Alcuni ruoli (Preposto,
        Capocantiere) richiedono che la nomina firmata dall'impresa sia già caricata nella scheda
        documenti di questa persona.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {RUOLI.filter((r) => r.value !== membro.ruolo).map((r) => {
          const attivo = ruoliExtra.includes(r.value);
          const richiedeDocumento = !!DOCUMENTO_RICHIESTO_PER_RUOLO[r.value];
          return (
            <button
              key={r.value}
              onClick={() => toggleRuolo(r.value, attivo)}
              disabled={!puoModificare}
              title={richiedeDocumento ? `Richiede: ${DOCUMENTO_RICHIESTO_PER_RUOLO[r.value]}` : undefined}
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                border: attivo ? "1px solid #1a73e8" : "1px solid #ccc",
                backgroundColor: attivo ? "#1a73e8" : "#fff",
                color: attivo ? "#fff" : "#333",
                cursor: puoModificare ? "pointer" : "not-allowed",
                opacity: puoModificare ? 1 : 0.6,
                fontSize: 13,
              }}
            >
              {attivo ? "✓ " : "+ "}
              {r.label}
              {richiedeDocumento && !attivo && " 🔒"}
            </button>
          );
        })}
      </div>

      <h3>Attività aggiuntive</h3>
      <p style={{ fontSize: 13, color: "#666" }}>Es. un'impresa può occuparsi sia di elettrico che di idraulico.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ATTIVITA.filter((a) => a !== membro.attivita).map((a) => {
          const attivo = attivitaExtra.includes(a);
          return (
            <button
              key={a}
              onClick={() => toggleAttivita(a, attivo)}
              disabled={!puoModificare}
              style={{
                padding: "6px 12px",
                borderRadius: 16,
                border: attivo ? "1px solid #34a853" : "1px solid #ccc",
                backgroundColor: attivo ? "#34a853" : "#fff",
                color: attivo ? "#fff" : "#333",
                cursor: puoModificare ? "pointer" : "not-allowed",
                opacity: puoModificare ? 1 : 0.6,
                fontSize: 13,
              }}
            >
              {attivo ? "✓ " : "+ "}
              {a}
            </button>
          );
        })}
      </div>
    </div>
  );
}
