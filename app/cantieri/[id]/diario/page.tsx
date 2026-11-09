"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { comprimiImmagine, validaFile } from "@/lib/caricamentoFile";
import {
  accoda, elencaCoda, eErroreDiRete, eseguiSincronizzazione, inOffline, iscriviCoda, leggiCache,
  nuovoId, riprovaOperazione, rimuoviOperazione, salvaCache, utenteLocale, type Operazione,
} from "@/lib/codaOffline";

type Voce = {
  id: string;
  data: string;
  meteo: string | null;
  testo: string;
  foto: string[];
  creato_da: string | null;
  creato_il: string;
};

const METEO = ["Sereno", "Nuvoloso", "Pioggia", "Neve", "Vento forte", "Caldo intenso", "Freddo intenso"];
const MAX_FOTO = 6;

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function formatData(s: string): string {
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const stilePulsante: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

export default function DiarioPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [mioId, setMioId] = useState<string | null>(null);
  const [puoScrivere, setPuoScrivere] = useState(false);
  const [voci, setVoci] = useState<Voce[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [presenti, setPresenti] = useState<Record<string, number>>({});
  const [autori, setAutori] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const [mostraForm, setMostraForm] = useState(false);
  const [data, setData] = useState(oggiRoma());
  const [meteo, setMeteo] = useState("");
  const [testo, setTesto] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [salvataggio, setSalvataggio] = useState(false);
  const [inCoda, setInCoda] = useState<Operazione[]>([]);
  const [datiVecchi, setDatiVecchi] = useState<number | null>(null);
  const conteggioPrecedente = useRef(0);

  // Esportazione in PDF (stampa del browser: "Salva come PDF")
  const [nomeCantiere, setNomeCantiere] = useState("");
  const [indirizzoCantiere, setIndirizzoCantiere] = useState("");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [esportando, setEsportando] = useState(false);
  const [vociStampa, setVociStampa] = useState<Voce[]>([]);

  async function token(): Promise<string | null> {
    const { data: s } = await supabase.auth.getSession();
    return s?.session?.access_token ?? null;
  }

  async function caricaUrls(percorsi: string[]) {
    if (percorsi.length === 0) return;
    const t = await token();
    if (!t) return;
    try {
      const r = await fetch("/api/diario", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ azione: "urls", cantiereId, percorsi }),
      });
      const j = await r.json().catch(() => null);
      if (j?.ok) setUrls((prima) => ({ ...prima, ...j.urls }));
    } catch {
      // le foto non si vedono, ma il testo sì
    }
  }

  async function aggiornaCoda(): Promise<number> {
    const tutte = await elencaCoda(cantiereId);
    const mie = tutte.filter((o) => o.tipo === "diario_nuova");
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
    const { data: cant } = await supabase.from("cantieri").select("nome, indirizzo").eq("id", cantiereId).maybeSingle();

    const { data: elenco, error } = await supabase
      .from("diario_cantiere")
      .select("*")
      .eq("cantiere_id", cantiereId)
      .order("data", { ascending: false })
      .order("creato_il", { ascending: false });
    if (error) {
      if (eErroreDiRete(error)) return false;
      setErrore(error.message);
      return true;
    }
    const lista = ((elenco || []) as any[]).map((v) => ({ ...v, foto: Array.isArray(v.foto) ? v.foto : [] })) as Voce[];

    const { data: membri } = await supabase
      .from("cantiere_membri")
      .select("profilo_id, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId);
    const mappa: Record<string, string> = {};
    (membri || []).forEach((m: any) => {
      if (m.profilo_id) mappa[m.profilo_id] = m.profili?.email ?? "";
    });

    let conteggio: Record<string, number> = {};
    const date = Array.from(new Set(lista.map((v) => v.data)));
    if (date.length > 0) {
      const { data: pres, error: errPres } = await supabase
        .from("presenze")
        .select("data")
        .eq("cantiere_id", cantiereId)
        .in("data", date);
      if (!errPres) {
        (pres || []).forEach((p: any) => {
          conteggio[p.data] = (conteggio[p.data] || 0) + 1;
        });
      }
    }

    setPuoScrivere(puo === true);
    setNomeCantiere(cant?.nome ?? "");
    setIndirizzoCantiere(cant?.indirizzo ?? "");
    setVoci(lista);
    setAutori(mappa);
    setPresenti(conteggio);
    setDatiVecchi(null);

    // Copia locale per quando non c'è rete (senza i link delle foto, che scadono)
    await salvaCache(`diario:${cantiereId}`, {
      puo: puo === true,
      nome: cant?.nome ?? "",
      indirizzo: cant?.indirizzo ?? "",
      voci: lista,
      autori: mappa,
      presenti: conteggio,
      uid,
    });

    await caricaUrls(lista.flatMap((v) => v.foto));
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
      const c = await leggiCache<any>(`diario:${cantiereId}`);
      if (c) {
        setPuoScrivere(c.valore.puo === true);
        setNomeCantiere(c.valore.nome || "");
        setIndirizzoCantiere(c.valore.indirizzo || "");
        setVoci(c.valore.voci || []);
        setAutori(c.valore.autori || {});
        setPresenti(c.valore.presenti || {});
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

  function scegliFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const scelte = Array.from(e.target.files || []);
    e.target.value = "";
    setFiles((prima) => [...prima, ...scelte].slice(0, MAX_FOTO));
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);
    if (!testo.trim()) {
      setErrore("Scrivi cosa è stato fatto oggi.");
      return;
    }
    if (!mioId) {
      setErrore("Utente non riconosciuto: accedi di nuovo con connessione.");
      return;
    }
    setSalvataggio(true);

    const blobs: Blob[] = [];
    for (const f of files) {
      const piccola = await comprimiImmagine(f);
      const valida = validaFile(piccola);
      if (!valida.valido) {
        setErrore(`${f.name}: ${valida.errore || "file non valido"}`);
        setSalvataggio(false);
        return;
      }
      blobs.push(piccola);
    }

    try {
      await accoda({
        id: nuovoId(),
        tipo: "diario_nuova",
        cantiereId,
        etichetta: `Diario del ${formatData(data)}`,
        payload: { data, meteo: meteo || null, testo: testo.trim(), creato_da: mioId },
        foto: blobs,
      });
    } catch {
      setErrore("Impossibile salvare sul dispositivo (spazio esaurito o browser in modalità privata).");
      setSalvataggio(false);
      return;
    }
    setSalvataggio(false);
    setTesto("");
    setMeteo("");
    setFiles([]);
    setMostraForm(false);
    conteggioPrecedente.current = await aggiornaCoda();

    if (inOffline()) {
      setMessaggio("Salvato sul dispositivo. Verrà inviato da solo appena torna la connessione.");
    } else {
      setMessaggio("Voce salvata nel diario.");
      await eseguiSincronizzazione();
      await carica();
    }
  }

  async function elimina(v: Voce) {
    if (inOffline()) {
      setErrore("Per eliminare una voce serve la connessione.");
      return;
    }
    if (!window.confirm(`Eliminare la voce del ${formatData(v.data)}? Le foto collegate verranno cancellate.`)) return;
    setErrore(null);
    const { data: cancellata, error } = await supabase.from("diario_cantiere").delete().eq("id", v.id).select("id");
    if (error) {
      setErrore(error.message);
      return;
    }
    if (!cancellata || cancellata.length === 0) {
      setErrore("Puoi eliminare solo le voci scritte da te.");
      return;
    }
    const t = await token();
    if (t && v.foto.length > 0) {
      await fetch("/api/diario", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ azione: "rimuovi", cantiereId, percorsi: v.foto }),
      }).catch(() => null);
    }
    carica();
  }

  async function esporta() {
    setErrore(null);
    setMessaggio(null);
    const scelte = voci
      .filter((v) => (!dal || v.data >= dal) && (!al || v.data <= al))
      .sort((a, b) => (a.data === b.data ? a.creato_il.localeCompare(b.creato_il) : a.data.localeCompare(b.data)));
    if (scelte.length === 0) {
      setErrore("Nessuna voce nel periodo scelto.");
      return;
    }
    setEsportando(true);
    setVociStampa(scelte);
    // Link foto freschi (durano 10 minuti): li rigeneriamo subito prima di stampare
    await caricaUrls(scelte.flatMap((v) => v.foto));
    // Aspetta che le immagini siano caricate (al massimo 8 secondi)
    const inizio = Date.now();
    await new Promise((r) => setTimeout(r, 400));
    while (Date.now() - inizio < 8000) {
      const imgs = Array.from(document.querySelectorAll(".stampa-diario img")) as HTMLImageElement[];
      if (imgs.every((i) => i.complete)) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    setEsportando(false);
    window.print();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 860 }}>
      <h1 style={{ marginBottom: 4 }}>Diario di cantiere</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Cosa si è fatto ogni giorno, con meteo e foto. Resta come memoria dell&apos;avanzamento dei lavori.
      </p>

      {puoScrivere && !mostraForm && (
        <button
          onClick={() => setMostraForm(true)}
          style={{ padding: "9px 16px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 14 }}
        >
          + Nuova voce
        </button>
      )}

      {mostraForm && (
        <form onSubmit={salva} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ fontSize: 14 }}>
              Giorno
              <br />
              <input type="date" value={data} max={oggiRoma()} onChange={(e) => setData(e.target.value)} style={{ padding: 6 }} />
            </label>
            <label style={{ fontSize: 14 }}>
              Meteo
              <br />
              <select value={meteo} onChange={(e) => setMeteo(e.target.value)} style={{ padding: 6 }}>
                <option value="">—</option>
                {METEO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ fontSize: 14 }}>
            Lavorazioni svolte *
            <br />
            <textarea
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Es. Getto della soletta al primo piano, montaggio ponteggio lato est."
              style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
            />
          </label>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 14 }}>
              Foto (fino a {MAX_FOTO})
              <br />
              <input type="file" accept="image/*" multiple onChange={scegliFoto} disabled={files.length >= MAX_FOTO} />
            </label>
            {files.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13, color: "#444" }}>
                {files.map((f, i) => (
                  <div key={i}>
                    {f.name}{" "}
                    <button type="button" style={{ ...stilePulsante, padding: "1px 6px" }} onClick={() => setFiles(files.filter((_, k) => k !== i))}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
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

      {voci.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14, fontSize: 13 }}>
          <label>
            Dal
            <br />
            <input type="date" value={dal} onChange={(e) => setDal(e.target.value)} style={{ padding: 5 }} />
          </label>
          <label>
            Al
            <br />
            <input type="date" value={al} onChange={(e) => setAl(e.target.value)} style={{ padding: 5 }} />
          </label>
          <button onClick={esporta} disabled={esportando} style={{ ...stilePulsante, padding: "7px 12px" }}>
            {esportando ? "Preparazione..." : "📄 Esporta in PDF"}
          </button>
          <span style={{ color: "#888" }}>Lascia vuoto per esportare tutto. Nella finestra che si apre scegli &quot;Salva come PDF&quot;.</span>
        </div>
      )}

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}
      {datiVecchi && (
        <p style={{ color: "#8a6d00", fontSize: 13 }}>
          Dati salvati sul dispositivo il {new Date(datiVecchi).toLocaleString("it-IT")}. Le foto non sono visibili senza connessione.
        </p>
      )}

      {inCoda.map((o) => (
        <div
          key={o.id}
          style={{
            border: "1px dashed " + (o.stato === "errore" ? "#e0a8a1" : "#e6c76a"),
            background: o.stato === "errore" ? "#fdf3f2" : "#fffaf0",
            borderRadius: 10,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: "#1a3c6e" }}>{formatData(o.payload.data)}</div>
          <div style={{ fontSize: 13, color: "#666" }}>{o.payload.meteo ? `☁️ ${o.payload.meteo}` : ""}</div>
          <div style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{o.payload.testo}</div>
          <div style={{ fontSize: 12, color: o.stato === "errore" ? "#c0392b" : "#8a6d00", marginTop: 8 }}>
            {o.stato === "errore" ? `⚠ Non inviato: ${o.ultimoErrore || "errore"}` : "⏳ In attesa di invio"}
            {o.foto && o.foto.length > 0 ? ` · ${o.foto.length} foto` : ""}
            {o.stato === "errore" && (
              <>
                <button style={{ ...stilePulsante, marginLeft: 10 }} onClick={() => riprovaOperazione(o.id)}>
                  Riprova
                </button>
                <button
                  style={{ ...stilePulsante, marginLeft: 6, color: "#c0392b" }}
                  onClick={async () => {
                    if (window.confirm("Scartare questa voce? Non potrà essere recuperata.")) await rimuoviOperazione(o.id);
                  }}
                >
                  Scarta
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      {voci.length === 0 && inCoda.length === 0 ? (
        <p style={{ color: "#888" }}>Nessuna voce nel diario.</p>
      ) : (
        voci.map((v) => (
          <div key={v.id} style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, color: "#1a3c6e" }}>{formatData(v.data)}</div>
              <div style={{ fontSize: 13, color: "#666" }}>
                {v.meteo && <>☁️ {v.meteo}</>}
                {presenti[v.data] !== undefined && <>{v.meteo ? " · " : ""}🕒 {presenti[v.data]} presenze registrate</>}
              </div>
            </div>
            <div style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap" }}>{v.testo}</div>
            {v.foto.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {v.foto.map((p) =>
                  urls[p] ? (
                    <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
                      <img src={urls[p]} alt="Foto del cantiere" style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 8, border: "1px solid #e4e7ec" }} />
                    </a>
                  ) : (
                    <div key={p} style={{ width: 110, height: 110, borderRadius: 8, background: "#f0f2f5" }} />
                  )
                )}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
              Scritto da {v.creato_da ? autori[v.creato_da] || "un membro del cantiere" : "—"} il {formatData(v.creato_il)}
              {v.creato_da === mioId && (
                <button style={{ ...stilePulsante, marginLeft: 10, color: "#c0392b" }} onClick={() => elimina(v)}>
                  Elimina
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {/* Foglio per la stampa / PDF: sullo schermo è nascosto */}
      <style>{`
        .stampa-diario { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          body * { visibility: hidden !important; }
          .stampa-diario, .stampa-diario * { visibility: visible !important; }
          .stampa-diario { display: block !important; position: absolute; left: 0; top: 0; width: 100%; color: #000; font-family: sans-serif; }
          .stampa-voce { page-break-inside: avoid; break-inside: avoid; border-top: 1px solid #999; padding: 8px 0; margin-bottom: 6px; }
          .stampa-foto { display: inline-block; width: 48%; margin: 1%; vertical-align: top; }
          .stampa-foto img { width: 100%; max-height: 62mm; object-fit: cover; }
        }
      `}</style>
      <div className="stampa-diario">
        <h1 style={{ fontSize: 20, margin: "0 0 2px" }}>Diario di cantiere</h1>
        <div style={{ fontSize: 14 }}>
          <strong>{nomeCantiere}</strong>
          {indirizzoCantiere ? ` — ${indirizzoCantiere}` : ""}
        </div>
        <div style={{ fontSize: 12, color: "#444", marginBottom: 10 }}>
          Periodo: {dal ? formatData(dal) : "dall'inizio"} – {al ? formatData(al) : "ad oggi"} · Generato il {formatData(oggiRoma())} con GENESIVOX
        </div>
        {vociStampa.map((v) => (
          <div key={v.id} className="stampa-voce">
            <div style={{ fontWeight: 700, fontSize: 14 }}>
              {formatData(v.data)}
              {v.meteo ? ` · Meteo: ${v.meteo}` : ""}
              {presenti[v.data] !== undefined ? ` · Presenze registrate: ${presenti[v.data]}` : ""}
            </div>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: "4px 0" }}>{v.testo}</div>
            {v.foto.map((p) =>
              urls[p] ? (
                <div key={p} className="stampa-foto">
                  <img src={urls[p]} alt="Foto del cantiere" />
                </div>
              ) : null
            )}
            <div style={{ fontSize: 11, color: "#555" }}>
              Scritto da {v.creato_da ? autori[v.creato_da] || "un membro del cantiere" : "—"} il {formatData(v.creato_il)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
