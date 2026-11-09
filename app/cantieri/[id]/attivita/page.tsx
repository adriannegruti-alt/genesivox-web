"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  accoda, elencaCoda, eErroreDiRete, eseguiSincronizzazione, inOffline, iscriviCoda, leggiCache,
  nuovoId, riprovaOperazione, rimuoviOperazione, salvaCache, utenteLocale, type Operazione,
} from "@/lib/codaOffline";

type Riga = {
  id: string;
  tipo: "attivita" | "non_conformita";
  titolo: string;
  descrizione: string | null;
  gravita: string | null;
  stato: "aperta" | "in_corso" | "chiusa";
  assegnata_a: string | null;
  scadenza: string | null;
  creato_da: string | null;
  creato_il: string;
  chiusa_il: string | null;
  nota_chiusura: string | null;
  _attesa?: boolean;
  _errore?: string;
};

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function formatData(s: string): string {
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const COLORI_GRAVITA: Record<string, { bg: string; fg: string }> = {
  bassa: { bg: "#e8f5e9", fg: "#2e7d32" },
  media: { bg: "#fff4d6", fg: "#8a5a00" },
  alta: { bg: "#fdecea", fg: "#c0392b" },
};

const ETICHETTA_STATO: Record<string, string> = { aperta: "Aperta", in_corso: "In corso", chiusa: "Chiusa" };

const stilePulsante: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

export default function AttivitaPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [mioId, setMioId] = useState<string | null>(null);
  const [puoCreare, setPuoCreare] = useState(false);
  const [righe, setRighe] = useState<Riga[]>([]);
  const [persone, setPersone] = useState<{ id: string; email: string }[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [filtroStato, setFiltroStato] = useState<"aperte" | "chiuse" | "tutte">("aperte");
  const [filtroTipo, setFiltroTipo] = useState<"tutti" | "attivita" | "non_conformita">("tutti");

  const [mostraForm, setMostraForm] = useState(false);
  const [tipo, setTipo] = useState<"attivita" | "non_conformita">("non_conformita");
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [gravita, setGravita] = useState("media");
  const [assegnataA, setAssegnataA] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [salvataggio, setSalvataggio] = useState(false);
  const [inCoda, setInCoda] = useState<Operazione[]>([]);
  const [datiVecchi, setDatiVecchi] = useState<number | null>(null);
  const conteggioPrecedente = useRef(0);

  async function aggiornaCoda(): Promise<number> {
    const tutte = await elencaCoda(cantiereId);
    const mie = tutte.filter((o) => o.tipo === "attivita_nuova" || o.tipo === "attivita_stato");
    setInCoda(mie);
    return mie.length;
  }

  // Legge dal server. Restituisce false se non c'è rete (allora si usa la copia locale).
  async function caricaDaRete(uid: string | null): Promise<boolean> {
    const { data: puo, error: errPuo } = await supabase.rpc("puo_gestire_attivita", { cid: cantiereId });
    if (errPuo) {
      if (eErroreDiRete(errPuo)) return false;
      setErrore(errPuo.message);
      return true;
    }
    const { data: elenco, error } = await supabase
      .from("attivita_cantiere")
      .select("*")
      .eq("cantiere_id", cantiereId)
      .order("creato_il", { ascending: false });
    if (error) {
      if (eErroreDiRete(error)) return false;
      setErrore(error.message);
      return true;
    }

    const { data: membri } = await supabase
      .from("cantiere_membri")
      .select("profilo_id, stato, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId);
    const visti = new Set<string>();
    const lista: { id: string; email: string }[] = [];
    (membri || []).forEach((m: any) => {
      if (m.stato !== "approvato" || !m.profilo_id || visti.has(m.profilo_id)) return;
      visti.add(m.profilo_id);
      lista.push({ id: m.profilo_id, email: m.profili?.email ?? "(email sconosciuta)" });
    });
    // Anche chi ha creato il cantiere può essere assegnato
    const { data: cant } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
    if (cant?.creato_da && !visti.has(cant.creato_da)) {
      const { data: cr } = await supabase.from("profili").select("email").eq("id", cant.creato_da).maybeSingle();
      lista.push({ id: cant.creato_da, email: cr?.email ?? "(creatore del cantiere)" });
    }

    setPuoCreare(puo === true);
    setRighe((elenco || []) as Riga[]);
    setPersone(lista);
    setDatiVecchi(null);
    await salvaCache(`attivita:${cantiereId}`, { puo: puo === true, righe: elenco || [], persone: lista, uid });
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
      const c = await leggiCache<any>(`attivita:${cantiereId}`);
      if (c) {
        setPuoCreare(c.valore.puo === true);
        setRighe(c.valore.righe || []);
        setPersone(c.valore.persone || []);
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

  // Quando una voce in coda viene inviata, ricarica l'elenco
  useEffect(() => {
    return iscriviCoda(async () => {
      const prima = conteggioPrecedente.current;
      const ora = await aggiornaCoda();
      conteggioPrecedente.current = ora;
      if (ora < prima && !inOffline()) carica();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantiereId]);

  function emailDi(id: string | null): string {
    if (!id) return "nessuno";
    return persone.find((p) => p.id === id)?.email ?? "altro utente";
  }

  async function dopoSalvataggio(testoOk: string) {
    conteggioPrecedente.current = await aggiornaCoda();
    if (inOffline()) {
      setMessaggio("Salvato sul dispositivo. Verrà inviato da solo appena torna la connessione.");
    } else {
      setMessaggio(testoOk);
      await eseguiSincronizzazione();
      await carica();
    }
  }

  async function crea(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);
    if (!titolo.trim()) {
      setErrore("Scrivi un titolo.");
      return;
    }
    if (!mioId) {
      setErrore("Utente non riconosciuto: accedi di nuovo con connessione.");
      return;
    }
    setSalvataggio(true);
    try {
      await accoda({
        id: nuovoId(),
        tipo: "attivita_nuova",
        cantiereId,
        etichetta: titolo.trim(),
        payload: {
          tipo,
          titolo: titolo.trim(),
          descrizione: descrizione.trim() || null,
          gravita: tipo === "non_conformita" ? gravita : null,
          assegnata_a: assegnataA || null,
          scadenza: scadenza || null,
          creato_da: mioId,
        },
      });
    } catch {
      setErrore("Impossibile salvare sul dispositivo (spazio esaurito o browser in modalità privata).");
      setSalvataggio(false);
      return;
    }
    setSalvataggio(false);
    const avvisare = assegnataA && assegnataA !== mioId;
    setTitolo("");
    setDescrizione("");
    setScadenza("");
    setAssegnataA("");
    setMostraForm(false);
    await dopoSalvataggio(avvisare ? "Salvata. La persona assegnata riceve l'avviso." : "Salvata.");
  }

  async function cambiaStato(r: Riga, nuovo: "aperta" | "in_corso" | "chiusa") {
    setErrore(null);
    setMessaggio(null);
    let nota: string | null = null;
    if (nuovo === "chiusa") {
      const risposta = window.prompt("Vuoi aggiungere una nota di chiusura? (facoltativa)", "");
      if (risposta === null) return;
      nota = risposta.trim() || null;
    }
    try {
      await accoda({
        id: nuovoId(),
        tipo: "attivita_stato",
        cantiereId,
        etichetta: `${nuovo === "chiusa" ? "Chiusura" : "Cambio stato"}: ${r.titolo}`,
        payload: {
          attivitaId: r.id,
          stato: nuovo,
          chiusa_il: nuovo === "chiusa" ? new Date().toISOString() : null,
          nota_chiusura: nuovo === "chiusa" ? nota : null,
        },
      });
    } catch {
      setErrore("Impossibile salvare sul dispositivo.");
      return;
    }
    await dopoSalvataggio(nuovo === "chiusa" ? "Chiusa. Chi l'ha assegnata riceve l'avviso." : "Aggiornata.");
  }

  async function elimina(r: Riga) {
    // Voce creata offline e non ancora inviata: basta toglierla dalla coda
    if (r._attesa && inCoda.some((o) => o.id === r.id && o.tipo === "attivita_nuova")) {
      if (!window.confirm(`Scartare "${r.titolo}"? Non è ancora stata inviata.`)) return;
      for (const o of inCoda) {
        if (o.id === r.id || (o.tipo === "attivita_stato" && o.payload.attivitaId === r.id)) await rimuoviOperazione(o.id);
      }
      return;
    }
    if (inOffline()) {
      setErrore("Per eliminare una voce serve la connessione.");
      return;
    }
    if (!window.confirm(`Eliminare "${r.titolo}"? L'operazione non si può annullare.`)) return;
    setErrore(null);
    const { data, error } = await supabase.from("attivita_cantiere").delete().eq("id", r.id).select("id");
    if (error) {
      setErrore(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErrore("Puoi eliminare solo le voci create da te.");
      return;
    }
    carica();
  }

  // Elenco mostrato: dati del server + cose create/modificate offline ancora da inviare
  const righeEffettive: Riga[] = (() => {
    const nuove: Riga[] = inCoda
      .filter((o) => o.tipo === "attivita_nuova")
      .map((o) => ({
        id: o.id,
        tipo: o.payload.tipo,
        titolo: o.payload.titolo,
        descrizione: o.payload.descrizione,
        gravita: o.payload.gravita,
        stato: "aperta" as const,
        assegnata_a: o.payload.assegnata_a,
        scadenza: o.payload.scadenza,
        creato_da: o.payload.creato_da,
        creato_il: new Date(o.creatoIl).toISOString(),
        chiusa_il: null,
        nota_chiusura: null,
        _attesa: true,
        _errore: o.stato === "errore" ? o.ultimoErrore || "errore" : undefined,
      }));
    const base: Riga[] = [...nuove, ...righe.filter((r) => !nuove.some((n) => n.id === r.id))];
    for (const o of inCoda.filter((x) => x.tipo === "attivita_stato")) {
      const k = base.findIndex((r) => r.id === o.payload.attivitaId);
      if (k >= 0) {
        base[k] = {
          ...base[k],
          stato: o.payload.stato,
          chiusa_il: o.payload.chiusa_il,
          nota_chiusura: o.payload.nota_chiusura,
          _attesa: true,
          _errore: o.stato === "errore" ? o.ultimoErrore || "errore" : base[k]._errore,
        };
      }
    }
    return base;
  })();

  const oggi = oggiRoma();
  const visibili = righeEffettive.filter((r) => {
    if (filtroStato === "aperte" && r.stato === "chiusa") return false;
    if (filtroStato === "chiuse" && r.stato !== "chiusa") return false;
    if (filtroTipo !== "tutti" && r.tipo !== filtroTipo) return false;
    return true;
  });
  const nAperte = righeEffettive.filter((r) => r.stato !== "chiusa").length;
  const nScadute = righeEffettive.filter((r) => r.stato !== "chiusa" && r.scadenza && r.scadenza < oggi).length;

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 860 }}>
      <h1 style={{ marginBottom: 4 }}>Attività e non conformità</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Annota cosa c&apos;è da fare o da correggere in cantiere, assegnalo a una persona e segui fino alla chiusura.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ background: "#f5f8fc", border: "1px solid #dde6f2", borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a3c6e" }}>{nAperte}</div>
          <div style={{ fontSize: 12, color: "#666" }}>aperte</div>
        </div>
        <div style={{ background: "#fdecea", border: "1px solid #f5c2bd", borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#c0392b" }}>{nScadute}</div>
          <div style={{ fontSize: 12, color: "#666" }}>in ritardo</div>
        </div>
      </div>

      {puoCreare && !mostraForm && (
        <button
          onClick={() => setMostraForm(true)}
          style={{ padding: "9px 16px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 14 }}
        >
          + Nuova
        </button>
      )}

      {mostraForm && (
        <form onSubmit={crea} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ fontSize: 14 }}>
              Tipo
              <br />
              <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} style={{ padding: 6 }}>
                <option value="non_conformita">Non conformità (problema da correggere)</option>
                <option value="attivita">Attività (cosa da fare)</option>
              </select>
            </label>
            {tipo === "non_conformita" && (
              <label style={{ fontSize: 14 }}>
                Gravità
                <br />
                <select value={gravita} onChange={(e) => setGravita(e.target.value)} style={{ padding: 6 }}>
                  <option value="bassa">Bassa</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
            )}
          </div>
          <label style={{ fontSize: 14 }}>
            Titolo *
            <br />
            <input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              maxLength={160}
              placeholder={tipo === "non_conformita" ? "Es. Parapetto mancante sul lato nord" : "Es. Consegnare il POS aggiornato"}
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            />
          </label>
          <label style={{ fontSize: 14, display: "block", marginTop: 10 }}>
            Descrizione (facoltativa)
            <br />
            <textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              rows={3}
              maxLength={2000}
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ fontSize: 14 }}>
              Assegna a
              <br />
              <select value={assegnataA} onChange={(e) => setAssegnataA(e.target.value)} style={{ padding: 6, maxWidth: 280 }}>
                <option value="">— nessuno —</option>
                {persone.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.email}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 14 }}>
              Scadenza
              <br />
              <input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} style={{ padding: 6 }} />
            </label>
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              type="submit"
              disabled={salvataggio}
              style={{ padding: "8px 16px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginRight: 8 }}
            >
              {salvataggio ? "Salvataggio..." : "Salva"}
            </button>
            <button type="button" onClick={() => setMostraForm(false)} style={stilePulsante}>
              Annulla
            </button>
          </div>
        </form>
      )}

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}
      {datiVecchi && (
        <p style={{ color: "#8a6d00", fontSize: 13 }}>
          Dati salvati sul dispositivo il {new Date(datiVecchi).toLocaleString("it-IT")}.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value as any)} style={{ padding: 6 }}>
          <option value="aperte">Da chiudere</option>
          <option value="chiuse">Chiuse</option>
          <option value="tutte">Tutte</option>
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as any)} style={{ padding: 6 }}>
          <option value="tutti">Attività e non conformità</option>
          <option value="non_conformita">Solo non conformità</option>
          <option value="attivita">Solo attività</option>
        </select>
      </div>

      {visibili.length === 0 ? (
        <p style={{ color: "#888" }}>Nessuna voce da mostrare.</p>
      ) : (
        visibili.map((r) => {
          const inRitardo = r.stato !== "chiusa" && r.scadenza && r.scadenza < oggi;
          const eMia = r.assegnata_a === mioId;
          const g = r.gravita ? COLORI_GRAVITA[r.gravita] : null;
          return (
            <div
              key={r.id}
              style={{
                border: "1px solid " + (inRitardo ? "#f5c2bd" : "#e4e7ec"),
                borderRadius: 10,
                padding: 14,
                marginBottom: 10,
                background: r.stato === "chiusa" ? "#fafafa" : "#fff",
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: "#eef2f8", color: "#1a3c6e" }}>
                  {r.tipo === "non_conformita" ? "Non conformità" : "Attività"}
                </span>
                {g && (
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 12, background: g.bg, color: g.fg }}>
                    Gravità {r.gravita}
                  </span>
                )}
                <span style={{ fontSize: 12, color: "#666" }}>{ETICHETTA_STATO[r.stato]}</span>
                {inRitardo && <span style={{ fontSize: 12, fontWeight: 600, color: "#c0392b" }}>In ritardo</span>}
              </div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{r.titolo}</div>
              {r.descrizione && <div style={{ fontSize: 14, color: "#444", marginTop: 4, whiteSpace: "pre-wrap" }}>{r.descrizione}</div>}
              <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
                Assegnata a: {eMia ? "te" : emailDi(r.assegnata_a)}
                {r.scadenza && <> · Scadenza: {formatData(r.scadenza)}</>}
                <> · Creata il {formatData(r.creato_il)}</>
                {r.chiusa_il && <> · Chiusa il {formatData(r.chiusa_il)}</>}
              </div>
              {r.nota_chiusura && <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>Nota di chiusura: {r.nota_chiusura}</div>}
              {r._attesa && (
                <div style={{ fontSize: 12, marginTop: 6, color: r._errore ? "#c0392b" : "#8a6d00" }}>
                  {r._errore ? `⚠ Non inviata: ${r._errore}` : "⏳ In attesa di invio"}
                  {r._errore && (
                    <>
                      <button
                        style={{ ...stilePulsante, marginLeft: 10 }}
                        onClick={() => inCoda.filter((o) => o.stato === "errore" && (o.id === r.id || o.payload.attivitaId === r.id)).forEach((o) => riprovaOperazione(o.id))}
                      >
                        Riprova
                      </button>
                      <button
                        style={{ ...stilePulsante, marginLeft: 6, color: "#c0392b" }}
                        onClick={async () => {
                          if (!window.confirm("Scartare la modifica non inviata?")) return;
                          for (const o of inCoda.filter((x) => x.stato === "errore" && (x.id === r.id || x.payload.attivitaId === r.id))) await rimuoviOperazione(o.id);
                        }}
                      >
                        Scarta
                      </button>
                    </>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.stato === "aperta" && (
                  <button style={stilePulsante} onClick={() => cambiaStato(r, "in_corso")}>
                    Inizia
                  </button>
                )}
                {r.stato !== "chiusa" && (
                  <button style={{ ...stilePulsante, borderColor: "#16a34a", color: "#16a34a" }} onClick={() => cambiaStato(r, "chiusa")}>
                    Chiudi
                  </button>
                )}
                {r.stato === "chiusa" && (
                  <button style={stilePulsante} onClick={() => cambiaStato(r, "aperta")}>
                    Riapri
                  </button>
                )}
                {r.creato_da === mioId && (
                  <button style={{ ...stilePulsante, color: "#c0392b" }} onClick={() => elimina(r)}>
                    Elimina
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
