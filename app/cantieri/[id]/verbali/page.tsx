"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  accoda, elencaCoda, eErroreDiRete, eseguiSincronizzazione, inOffline, iscriviCoda, leggiCache,
  nuovoId, riprovaOperazione, rimuoviOperazione, salvaCache, utenteLocale, type Operazione,
} from "@/lib/codaOffline";

type TipoVerbale = "sopralluogo" | "coordinamento_periodico" | "non_conformita" | "sospensione_lavori";

const TIPI_VERBALE: { value: TipoVerbale; label: string; descrizione: string }[] = [
  {
    value: "sopralluogo",
    label: "Verbale di sopralluogo",
    descrizione: "Compilato a ogni accesso in cantiere: imprese presenti, lavorazioni in corso, conformità e prescrizioni.",
  },
  {
    value: "coordinamento_periodico",
    label: "Verbale di coordinamento periodico",
    descrizione: "Riunioni con datori di lavoro, preposti o subappaltatori per pianificare lavorazioni interferenti.",
  },
  {
    value: "non_conformita",
    label: "Verbale di non conformità e contestazione",
    descrizione: "Notifica formale scritta all'impresa e al Committente delle violazioni alle misure del PSC.",
  },
  {
    value: "sospensione_lavori",
    label: "Atto di sospensione lavori (art. 92, comma 1, lett. f)",
    descrizione: "In caso di pericolo grave e imminente: sospende le lavorazioni e informa Committente/ASL.",
  },
];

type Prescrizione = { descrizione: string; scadenza: string };

export default function VerbaliCsePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [caricamento, setCaricamento] = useState(true);
  const [puoCompilare, setPuoCompilare] = useState(false);
  const [mioId, setMioId] = useState<string | null>(null);
  const [verbali, setVerbali] = useState<any[]>([]);
  const [membriCantiere, setMembriCantiere] = useState<{ id: string; email: string }[]>([]);
  const [nomeCantiere, setNomeCantiere] = useState("");
  const [errore, setErrore] = useState<string | null>(null);

  const [tipoNuovo, setTipoNuovo] = useState<TipoVerbale | null>(null);
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  // Campi comuni
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [ora, setOra] = useState("");

  // Campi sopralluogo
  const [impresePresenti, setImpresePresenti] = useState("");
  const [lavorazioniInCorso, setLavorazioniInCorso] = useState("");
  const [conformitaRiscontrate, setConformitaRiscontrate] = useState("");
  const [prescrizioni, setPrescrizioni] = useState<Prescrizione[]>([{ descrizione: "", scadenza: "" }]);

  // Campi coordinamento periodico
  const [partecipanti, setPartecipanti] = useState("");
  const [argomenti, setArgomenti] = useState("");
  const [decisioni, setDecisioni] = useState("");

  // Campi non conformità
  const [destinatarioMembroId, setDestinatarioMembroId] = useState("");
  const [descrizioneViolazione, setDescrizioneViolazione] = useState("");
  const [notificatoImpresa, setNotificatoImpresa] = useState(true);
  const [notificatoCommittente, setNotificatoCommittente] = useState(true);

  // Campi sospensione lavori
  const [lavorazioniSospese, setLavorazioniSospese] = useState("");
  const [motivoPericolo, setMotivoPericolo] = useState("");
  const [informatoCommittente, setInformatoCommittente] = useState(false);
  const [informatoAsl, setInformatoAsl] = useState(false);
  const [noteSospensione, setNoteSospensione] = useState("");

  const [inCoda, setInCoda] = useState<Operazione[]>([]);
  const [datiVecchi, setDatiVecchi] = useState<number | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const conteggioPrecedente = useRef(0);

  async function aggiornaCoda(): Promise<number> {
    const tutte = await elencaCoda(cantiereId);
    const mie = tutte.filter((o) => o.tipo === "verbale_nuovo");
    setInCoda(mie);
    return mie.length;
  }

  // Legge dal server. Restituisce false se non c'è rete (allora si usa la copia locale).
  async function caricaDaRete(uid: string | null): Promise<boolean> {
    const { data: cantiere, error: errCant } = await supabase.from("cantieri").select("nome").eq("id", cantiereId).maybeSingle();
    if (errCant) {
      if (eErroreDiRete(errCant)) return false;
      setErrore(errCant.message);
      return true;
    }

    let cse = false;
    if (uid) {
      const { data: membro, error: errMembro } = await supabase
        .from("cantiere_membri")
        .select("id, ruolo")
        .eq("cantiere_id", cantiereId)
        .eq("profilo_id", uid)
        .maybeSingle();
      if (errMembro && eErroreDiRete(errMembro)) return false;

      cse = membro?.ruolo === "cse_csp";
      if (!cse && membro) {
        const { data: ruoliExtra } = await supabase
          .from("membro_ruoli")
          .select("ruolo")
          .eq("membro_id", membro.id);
        cse = (ruoliExtra || []).some((r) => r.ruolo === "cse_csp");
      }
    }

    const { data: membri } = await supabase
      .from("cantiere_membri")
      .select("id, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId);
    const listaMembri = (membri || []).map((m: any) => ({ id: m.id, email: m.profili?.email ?? "(email sconosciuta)" }));

    const { data: elenco, error } = await supabase
      .from("verbali_cse")
      .select("*")
      .eq("cantiere_id", cantiereId)
      .order("data", { ascending: false })
      .order("creato_il", { ascending: false });
    if (error) {
      if (eErroreDiRete(error)) return false;
      setErrore(error.message);
      return true;
    }

    setNomeCantiere(cantiere?.nome ?? "");
    setPuoCompilare(cse);
    setMembriCantiere(listaMembri);
    setVerbali(elenco || []);
    setDatiVecchi(null);
    await salvaCache(`verbali:${cantiereId}`, { nome: cantiere?.nome ?? "", cse, membri: listaMembri, verbali: elenco || [], uid });
    return true;
  }

  async function carica() {
    setCaricamento(true);
    const u = await utenteLocale();
    setMioId(u?.id ?? null);

    let fatto = false;
    if (!inOffline()) {
      try {
        fatto = await caricaDaRete(u?.id ?? null);
      } catch {
        fatto = false;
      }
    }
    if (!fatto) {
      const c = await leggiCache<any>(`verbali:${cantiereId}`);
      if (c) {
        setNomeCantiere(c.valore.nome || "");
        setPuoCompilare(c.valore.cse === true);
        setMembriCantiere(c.valore.membri || []);
        setVerbali(c.valore.verbali || []);
        setDatiVecchi(c.aggiornato);
      } else {
        setErrore("Sei offline e questa pagina non è mai stata aperta con connessione su questo dispositivo.");
      }
    }
    conteggioPrecedente.current = await aggiornaCoda();
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  // Quando un verbale in coda viene inviato, ricarica l'elenco
  useEffect(() => {
    return iscriviCoda(async () => {
      const prima = conteggioPrecedente.current;
      const ora = await aggiornaCoda();
      conteggioPrecedente.current = ora;
      if (ora < prima && !inOffline()) carica();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantiereId]);

  function resetCampi() {
    setData(new Date().toISOString().slice(0, 10));
    setOra("");
    setImpresePresenti("");
    setLavorazioniInCorso("");
    setConformitaRiscontrate("");
    setPrescrizioni([{ descrizione: "", scadenza: "" }]);
    setPartecipanti("");
    setArgomenti("");
    setDecisioni("");
    setDestinatarioMembroId("");
    setDescrizioneViolazione("");
    setNotificatoImpresa(true);
    setNotificatoCommittente(true);
    setLavorazioniSospese("");
    setMotivoPericolo("");
    setInformatoCommittente(false);
    setInformatoAsl(false);
    setNoteSospensione("");
  }

  function apriNuovo(tipo: TipoVerbale) {
    resetCampi();
    setModificaId(null);
    setTipoNuovo(tipo);
    setErrore(null);
  }

  function annullaForm() {
    setTipoNuovo(null);
    setModificaId(null);
    setErrore(null);
  }

  function iniziaModifica(v: any) {
    resetCampi();
    setData(v.data);
    setOra(v.ora || "");

    const c = v.contenuto || {};
    if (v.tipo === "sopralluogo") {
      setImpresePresenti(c.imprese_presenti || "");
      setLavorazioniInCorso(c.lavorazioni_in_corso || "");
      setConformitaRiscontrate(c.conformita_riscontrate || "");
      setPrescrizioni(c.prescrizioni && c.prescrizioni.length > 0 ? c.prescrizioni : [{ descrizione: "", scadenza: "" }]);
    } else if (v.tipo === "coordinamento_periodico") {
      setPartecipanti(c.partecipanti || "");
      setArgomenti(c.argomenti || "");
      setDecisioni(c.decisioni || "");
    } else if (v.tipo === "non_conformita") {
      setDestinatarioMembroId(v.destinatario_membro_id || "");
      setDescrizioneViolazione(c.descrizione_violazione || "");
      setNotificatoImpresa(!!c.notificato_impresa);
      setNotificatoCommittente(!!c.notificato_committente);
    } else if (v.tipo === "sospensione_lavori") {
      setLavorazioniSospese(c.lavorazioni_sospese || "");
      setMotivoPericolo(c.motivo_pericolo || "");
      setInformatoCommittente(!!c.informato_committente);
      setInformatoAsl(!!c.informato_asl);
      setNoteSospensione(c.note || "");
    }

    setModificaId(v.id);
    setTipoNuovo(v.tipo);
    setErrore(null);
  }

  async function eliminaVerbale(id: string) {
    if (inOffline()) {
      setErrore("Per eliminare un verbale serve la connessione.");
      return;
    }
    if (!confirm("Eliminare questo verbale? L'operazione non è reversibile.")) return;
    setErrore(null);

    const { data: cancellato, error } = await supabase.from("verbali_cse").delete().eq("id", id).select("id");

    if (error) {
      setErrore(error.message);
      return;
    }
    if (!cancellato || cancellato.length === 0) {
      setErrore("Non hai i permessi per eliminare questo verbale (puoi eliminare solo quelli creati da te).");
      return;
    }
    carica();
  }

  async function salvaVerbale(e: React.FormEvent) {
    e.preventDefault();
    if (!tipoNuovo || !mioId) return;
    setSalvataggio(true);
    setErrore(null);

    let contenuto: Record<string, any> = {};
    let destinatario: string | null = null;

    if (tipoNuovo === "sopralluogo") {
      contenuto = {
        imprese_presenti: impresePresenti,
        lavorazioni_in_corso: lavorazioniInCorso,
        conformita_riscontrate: conformitaRiscontrate,
        prescrizioni: prescrizioni.filter((p) => p.descrizione.trim() !== ""),
      };
    } else if (tipoNuovo === "coordinamento_periodico") {
      contenuto = { partecipanti, argomenti, decisioni };
    } else if (tipoNuovo === "non_conformita") {
      if (!destinatarioMembroId) {
        setErrore("Seleziona l'impresa destinataria della contestazione.");
        setSalvataggio(false);
        return;
      }
      destinatario = destinatarioMembroId;
      contenuto = {
        impresa_destinataria: membriCantiere.find((m) => m.id === destinatarioMembroId)?.email ?? "",
        descrizione_violazione: descrizioneViolazione,
        notificato_impresa: notificatoImpresa,
        notificato_committente: notificatoCommittente,
      };
    } else if (tipoNuovo === "sospensione_lavori") {
      contenuto = {
        lavorazioni_sospese: lavorazioniSospese,
        motivo_pericolo: motivoPericolo,
        informato_committente: informatoCommittente,
        informato_asl: informatoAsl,
        note: noteSospensione,
      };
    }

    if (modificaId) {
      if (inOffline()) {
        setErrore("Per modificare un verbale già salvato serve la connessione. Puoi creare nuovi verbali anche offline.");
        setSalvataggio(false);
        return;
      }
      const { data: aggiornato, error } = await supabase
        .from("verbali_cse")
        .update({
          data,
          ora: ora || null,
          contenuto,
          destinatario_membro_id: destinatario,
        })
        .eq("id", modificaId)
        .select("id");

      setSalvataggio(false);

      if (error) {
        setErrore(error.message);
        return;
      }
      if (!aggiornato || aggiornato.length === 0) {
        setErrore("Non hai i permessi per modificare questo verbale (puoi modificare solo quelli creati da te).");
        return;
      }
    } else {
      try {
        await accoda({
          id: nuovoId(),
          tipo: "verbale_nuovo",
          cantiereId,
          etichetta: `${etichettaTipo(tipoNuovo)} del ${data}`,
          payload: {
            tipo: tipoNuovo,
            data,
            ora: ora || null,
            contenuto,
            creato_da: mioId,
            destinatario_membro_id: destinatario,
          },
        });
      } catch {
        setErrore("Impossibile salvare sul dispositivo (spazio esaurito o browser in modalità privata).");
        setSalvataggio(false);
        return;
      }
      setSalvataggio(false);
      conteggioPrecedente.current = await aggiornaCoda();
      if (inOffline()) {
        setMessaggio("Verbale salvato sul dispositivo. Verrà inviato da solo appena torna la connessione.");
      } else {
        setMessaggio("Verbale salvato.");
        await eseguiSincronizzazione();
      }
    }

    setTipoNuovo(null);
    setModificaId(null);
    carica();
  }

  function aggiungiPrescrizione() {
    setPrescrizioni((p) => [...p, { descrizione: "", scadenza: "" }]);
  }

  function aggiornaPrescrizione(indice: number, campo: keyof Prescrizione, valore: string) {
    setPrescrizioni((p) => p.map((pr, i) => (i === indice ? { ...pr, [campo]: valore } : pr)));
  }

  function rimuoviPrescrizione(indice: number) {
    setPrescrizioni((p) => p.filter((_, i) => i !== indice));
  }

  function etichettaTipo(tipo: string) {
    return TIPI_VERBALE.find((t) => t.value === tipo)?.label ?? tipo;
  }

  function scaricaPdf(v: any) {
    const finestra = window.open("", "_blank");
    if (!finestra) {
      alert("Il browser ha bloccato l'apertura della finestra. Consenti i popup per questo sito e riprova.");
      return;
    }
    const contenutoHtml = formattaContenuto(v.tipo, v.contenuto).replace(/\n/g, "<br/>");
    finestra.document.write(`
      <html>
        <head>
          <title>${etichettaTipo(v.tipo)} - ${v.data}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .meta { color: #555; font-size: 13px; margin-bottom: 20px; }
            .contenuto { font-size: 14px; line-height: 1.6; border-top: 1px solid #ccc; padding-top: 16px; }
          </style>
        </head>
        <body>
          <h1>${etichettaTipo(v.tipo)}</h1>
          <div class="meta">
            Cantiere: ${nomeCantiere || "—"}<br/>
            Data: ${v.data}${v.ora ? ` — ore ${v.ora}` : ""}
          </div>
          <div class="contenuto">${contenutoHtml}</div>
        </body>
      </html>
    `);
    finestra.document.close();
    finestra.focus();
    setTimeout(() => finestra.print(), 300);
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Verbali CSE/CSP</h1>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {!puoCompilare && (
        <p style={{ color: "#666", fontSize: 13, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 6 }}>
          Solo il CSE/CSP assegnato a questo cantiere può creare nuovi verbali. Qui sotto puoi comunque
          consultare quelli già registrati.
        </p>
      )}

      {puoCompilare && !tipoNuovo && (
        <div style={{ marginBottom: 24 }}>
          <h3>Nuovo verbale</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TIPI_VERBALE.map((t) => (
              <button
                key={t.value}
                onClick={() => apriNuovo(t.value)}
                style={{
                  textAlign: "left",
                  padding: 12,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                <strong>{t.label}</strong>
                <br />
                <span style={{ color: "#666", fontSize: 13 }}>{t.descrizione}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tipoNuovo && (
        <form
          onSubmit={salvaVerbale}
          style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 24 }}
        >
          <h3 style={{ marginTop: 0 }}>
            {modificaId ? "Modifica: " : ""}
            {etichettaTipo(tipoNuovo)}
          </h3>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Data</label>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} required style={{ width: "100%", padding: 8 }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Ora</label>
              <input type="time" value={ora} onChange={(e) => setOra(e.target.value)} style={{ width: "100%", padding: 8 }} />
            </div>
          </div>

          {tipoNuovo === "sopralluogo" && (
            <>
              <Campo label="Imprese presenti">
                <textarea value={impresePresenti} onChange={(e) => setImpresePresenti(e.target.value)} rows={2} style={stileTextarea} />
              </Campo>
              <Campo label="Lavorazioni in corso">
                <textarea value={lavorazioniInCorso} onChange={(e) => setLavorazioniInCorso(e.target.value)} rows={2} style={stileTextarea} />
              </Campo>
              <Campo label="Conformità riscontrate">
                <textarea value={conformitaRiscontrate} onChange={(e) => setConformitaRiscontrate(e.target.value)} rows={2} style={stileTextarea} />
              </Campo>
              <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 600 }}>
                Prescrizioni assegnate (con data perentoria di adeguamento)
              </label>
              {prescrizioni.map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    placeholder="Descrizione prescrizione"
                    value={p.descrizione}
                    onChange={(e) => aggiornaPrescrizione(i, "descrizione", e.target.value)}
                    style={{ flex: 2, padding: 8 }}
                  />
                  <input
                    type="date"
                    value={p.scadenza}
                    onChange={(e) => aggiornaPrescrizione(i, "scadenza", e.target.value)}
                    style={{ flex: 1, padding: 8 }}
                  />
                  <button type="button" onClick={() => rimuoviPrescrizione(i)} style={{ padding: "0 10px" }}>
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={aggiungiPrescrizione} style={{ padding: "6px 12px", marginBottom: 12 }}>
                + Aggiungi prescrizione
              </button>
            </>
          )}

          {tipoNuovo === "coordinamento_periodico" && (
            <>
              <Campo label="Partecipanti (nome e ruolo, uno per riga)">
                <textarea value={partecipanti} onChange={(e) => setPartecipanti(e.target.value)} rows={3} style={stileTextarea} />
              </Campo>
              <Campo label="Argomenti trattati (lavorazioni interferenti, cambi di fase)">
                <textarea value={argomenti} onChange={(e) => setArgomenti(e.target.value)} rows={3} style={stileTextarea} />
              </Campo>
              <Campo label="Decisioni prese">
                <textarea value={decisioni} onChange={(e) => setDecisioni(e.target.value)} rows={2} style={stileTextarea} />
              </Campo>
            </>
          )}

          {tipoNuovo === "non_conformita" && (
            <>
              <Campo label="Impresa destinataria della contestazione">
                <select
                  value={destinatarioMembroId}
                  onChange={(e) => setDestinatarioMembroId(e.target.value)}
                  required
                  style={{ width: "100%", padding: 8 }}
                >
                  <option value="">— Seleziona —</option>
                  {membriCantiere.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.email}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Solo l'impresa selezionata potrà vedere questo verbale, oltre a Committente/Impresa edile/admin/ASL.
                </p>
              </Campo>
              <Campo label="Descrizione della violazione (misure del PSC non rispettate)">
                <textarea value={descrizioneViolazione} onChange={(e) => setDescrizioneViolazione(e.target.value)} rows={3} style={stileTextarea} />
              </Campo>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6 }}>
                <input type="checkbox" checked={notificatoImpresa} onChange={(e) => setNotificatoImpresa(e.target.checked)} />
                Notificato all'impresa
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 12 }}>
                <input type="checkbox" checked={notificatoCommittente} onChange={(e) => setNotificatoCommittente(e.target.checked)} />
                Notificato al Committente
              </label>
            </>
          )}

          {tipoNuovo === "sospensione_lavori" && (
            <>
              <Campo label="Lavorazioni sospese">
                <textarea value={lavorazioniSospese} onChange={(e) => setLavorazioniSospese(e.target.value)} rows={2} style={stileTextarea} />
              </Campo>
              <Campo label="Motivo (pericolo grave e imminente riscontrato)">
                <textarea value={motivoPericolo} onChange={(e) => setMotivoPericolo(e.target.value)} rows={3} style={stileTextarea} />
              </Campo>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6 }}>
                <input type="checkbox" checked={informatoCommittente} onChange={(e) => setInformatoCommittente(e.target.checked)} />
                Committente informato
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6 }}>
                <input type="checkbox" checked={informatoAsl} onChange={(e) => setInformatoAsl(e.target.checked)} />
                ASL competente informata
              </label>
              <Campo label="Note">
                <textarea value={noteSospensione} onChange={(e) => setNoteSospensione(e.target.value)} rows={2} style={stileTextarea} />
              </Campo>
            </>
          )}

          {errore && <p style={{ color: "red" }}>{errore}</p>}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="submit" disabled={salvataggio} style={{ padding: "8px 16px" }}>
              {salvataggio ? "Salvataggio..." : modificaId ? "Salva modifiche" : "Salva verbale"}
            </button>
            <button type="button" onClick={annullaForm} style={{ padding: "8px 16px" }}>
              Annulla
            </button>
          </div>
        </form>
      )}

      {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}
      {datiVecchi && (
        <p style={{ color: "#8a6d00", fontSize: 13 }}>
          Dati salvati sul dispositivo il {new Date(datiVecchi).toLocaleString("it-IT")}.
        </p>
      )}

      <h3>Verbali registrati</h3>
      {inCoda.map((o) => (
        <div
          key={o.id}
          style={{
            border: "1px dashed " + (o.stato === "errore" ? "#e0a8a1" : "#e6c76a"),
            background: o.stato === "errore" ? "#fdf3f2" : "#fffaf0",
            borderRadius: 8,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>{etichettaTipo(o.payload.tipo)}</strong>
            <span style={{ color: "#666", fontSize: 13 }}>
              {o.payload.data} {o.payload.ora ? `— ${o.payload.ora}` : ""}
            </span>
          </div>
          <div style={{ fontSize: 12, marginTop: 6, color: o.stato === "errore" ? "#c0392b" : "#8a6d00" }}>
            {o.stato === "errore" ? `⚠ Non inviato: ${o.ultimoErrore || "errore"}` : "⏳ In attesa di invio"}
            {o.stato === "errore" && (
              <button style={{ marginLeft: 10, padding: "2px 8px" }} onClick={() => riprovaOperazione(o.id)}>
                Riprova
              </button>
            )}
            <button
              style={{ marginLeft: 6, padding: "2px 8px", color: "#c0392b" }}
              onClick={async () => {
                if (window.confirm("Scartare questo verbale non ancora inviato? Non potrà essere recuperato.")) await rimuoviOperazione(o.id);
              }}
            >
              Scarta
            </button>
          </div>
        </div>
      ))}
      {verbali.length === 0 && inCoda.length === 0 && <p style={{ color: "#666" }}>Nessun verbale registrato per ora.</p>}
      {verbali.map((v) => (
        <div key={v.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <strong>{etichettaTipo(v.tipo)}</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#666", fontSize: 13 }}>
                {v.data} {v.ora ? `— ${v.ora}` : ""}
              </span>
              <button
                onClick={() => scaricaPdf(v)}
                style={{
                  padding: "4px 10px",
                  fontSize: 12,
                  borderRadius: 6,
                  border: "1px solid #d6e6fb",
                  backgroundColor: "#eef4fd",
                  color: "#1a73e8",
                  cursor: "pointer",
                }}
              >
                📄 Scarica PDF
              </button>
              {puoCompilare && v.creato_da === mioId && (
                <>
                  <button
                    onClick={() => iniziaModifica(v)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #ddd",
                      backgroundColor: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    ✏️ Modifica
                  </button>
                  <button
                    onClick={() => eliminaVerbale(v.id)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid #f5c6c6",
                      backgroundColor: "#fdeeee",
                      color: "#b00020",
                      cursor: "pointer",
                    }}
                  >
                    🗑️ Elimina
                  </button>
                </>
              )}
            </div>
          </div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              fontSize: 13,
              marginTop: 8,
              backgroundColor: "#fafafa",
              padding: 8,
              borderRadius: 6,
            }}
          >
            {formattaContenuto(v.tipo, v.contenuto)}
          </pre>
        </div>
      ))}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const stileTextarea: React.CSSProperties = { width: "100%", padding: 8, fontFamily: "inherit" };

function formattaContenuto(tipo: string, c: any) {
  if (!c) return "";
  if (tipo === "sopralluogo") {
    const prescrizioni = (c.prescrizioni || [])
      .map((p: Prescrizione) => `  - ${p.descrizione}${p.scadenza ? ` (scadenza: ${p.scadenza})` : ""}`)
      .join("\n");
    return [
      `Imprese presenti: ${c.imprese_presenti || "—"}`,
      `Lavorazioni in corso: ${c.lavorazioni_in_corso || "—"}`,
      `Conformità riscontrate: ${c.conformita_riscontrate || "—"}`,
      `Prescrizioni:${prescrizioni ? "\n" + prescrizioni : " nessuna"}`,
    ].join("\n");
  }
  if (tipo === "coordinamento_periodico") {
    return [
      `Partecipanti: ${c.partecipanti || "—"}`,
      `Argomenti: ${c.argomenti || "—"}`,
      `Decisioni: ${c.decisioni || "—"}`,
    ].join("\n");
  }
  if (tipo === "non_conformita") {
    return [
      `Impresa destinataria: ${c.impresa_destinataria || "—"}`,
      `Violazione: ${c.descrizione_violazione || "—"}`,
      `Notificato impresa: ${c.notificato_impresa ? "Sì" : "No"}`,
      `Notificato Committente: ${c.notificato_committente ? "Sì" : "No"}`,
    ].join("\n");
  }
  if (tipo === "sospensione_lavori") {
    return [
      `Lavorazioni sospese: ${c.lavorazioni_sospese || "—"}`,
      `Motivo: ${c.motivo_pericolo || "—"}`,
      `Committente informato: ${c.informato_committente ? "Sì" : "No"}`,
      `ASL informata: ${c.informato_asl ? "Sì" : "No"}`,
      c.note ? `Note: ${c.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(c);
}
