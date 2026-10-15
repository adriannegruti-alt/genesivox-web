"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Documento = {
  id: string;
  categoria: string;
  tipo: string;
  data_rilascio: string | null;
  data_scadenza: string | null;
  ente_emittente: string | null;
  esito: string | null;
  file_path: string | null;
  origine: string;
  stato_verifica: string;
};

const TIPI_FORMAZIONE = [
  "Formazione generale lavoratori",
  "Formazione specifica lavoratori",
  "Aggiornamento formazione lavoratori",
  "Preposto",
  "Addetto primo soccorso",
  "Addetto antincendio",
  "Lavori in quota / DPI anticaduta",
  "Montaggio ponteggi",
  "Conduzione macchine e attrezzature",
  "RLS",
  "Altro",
];

const ETICHETTE_ESITO: Record<string, string> = {
  idoneo: "Idoneo",
  idoneo_con_limitazioni: "Idoneo con limitazioni/prescrizioni",
  non_idoneo: "Non idoneo",
};

const GIORNI_PREAVVISO = 60;
const MAX_BYTE = 10 * 1024 * 1024;

const FORM_VUOTO = {
  categoria: "formazione",
  tipo: "",
  data_rilascio: "",
  data_scadenza: "",
  ente_emittente: "",
  esito: "idoneo",
};

const stileCampo: React.CSSProperties = {
  width: "100%",
  padding: 8,
  boxSizing: "border-box",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
};
const stileEtichetta: React.CSSProperties = { fontSize: 12, color: "#666" };
const stilePulsante: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  backgroundColor: "#fff",
  cursor: "pointer",
  fontSize: 13,
  color: "#000",
  textDecoration: "none",
  display: "inline-block",
};

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function giorniTra(da: string, a: string): number {
  const [y1, m1, d1] = da.split("-").map(Number);
  const [y2, m2, d2] = a.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function formatData(s: string | null): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

// Stato di un documento in base alla scadenza
function stato(doc: Documento): { testo: string; colore: string; sfondo: string; tipo: "ok" | "scadenza" | "scaduto" | "senza" } {
  if (!doc.data_scadenza) {
    return { testo: "Senza scadenza", colore: "#555", sfondo: "#eee", tipo: "senza" };
  }
  const giorni = giorniTra(oggiRoma(), doc.data_scadenza);
  if (giorni < 0) {
    return { testo: `Scaduto da ${-giorni} gg`, colore: "#fff", sfondo: "#c0392b", tipo: "scaduto" };
  }
  if (giorni <= GIORNI_PREAVVISO) {
    return { testo: `Scade tra ${giorni} gg`, colore: "#5c3d00", sfondo: "#ffd666", tipo: "scadenza" };
  }
  return { testo: "Valido", colore: "#fff", sfondo: "#16a34a", tipo: "ok" };
}

function ordinaPerScadenza(a: Documento, b: Documento): number {
  if (!a.data_scadenza && !b.data_scadenza) return 0;
  if (!a.data_scadenza) return 1;
  if (!b.data_scadenza) return -1;
  return a.data_scadenza.localeCompare(b.data_scadenza);
}

export default function DocumentiLavoratorePage() {
  const params = useParams();
  const lavoratoreId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [nomeLavoratore, setNomeLavoratore] = useState("");
  const [documenti, setDocumenti] = useState<Documento[]>([]);
  const [linkFile, setLinkFile] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VUOTO);
  const [file, setFile] = useState<File | null>(null);
  const [chiaveFile, setChiaveFile] = useState(0);
  const [salvataggio, setSalvataggio] = useState(false);
  const [inModifica, setInModifica] = useState<Documento | null>(null);

  async function carica() {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u?.user?.id ?? null);
    if (!u?.user) {
      setCaricamento(false);
      return;
    }

    const { data: l } = await supabase
      .from("lavoratori")
      .select("nome, cognome")
      .eq("id", lavoratoreId)
      .maybeSingle();
    if (!l) {
      setErrore("Lavoratore non trovato.");
      setCaricamento(false);
      return;
    }
    setNomeLavoratore(`${l.nome} ${l.cognome}`);

    const { data, error } = await supabase
      .from("documenti_lavoratore")
      .select(
        "id, categoria, tipo, data_rilascio, data_scadenza, ente_emittente, esito, file_path, origine, stato_verifica"
      )
      .eq("lavoratore_id", lavoratoreId);
    if (error) setErrore(error.message);
    const elenco = (data || []) as Documento[];
    setDocumenti(elenco);

    const percorsi = elenco.map((d) => d.file_path).filter((p): p is string => !!p);
    if (percorsi.length > 0) {
      const { data: firmati } = await supabase.storage.from("documenti-lavoratori").createSignedUrls(percorsi, 3600);
      const mappa: Record<string, string> = {};
      (firmati || []).forEach((f) => {
        if (f.path && f.signedUrl) mappa[f.path] = f.signedUrl;
      });
      setLinkFile(mappa);
    } else {
      setLinkFile({});
    }
    setCaricamento(false);
  }

  useEffect(() => {
    if (lavoratoreId) carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lavoratoreId]);

  function aggiorna(campo: keyof typeof FORM_VUOTO, valore: string) {
    setForm((f) => {
      const nuovo = { ...f, [campo]: valore };
      if (campo === "categoria") {
        nuovo.tipo = valore === "idoneita_sanitaria" ? "Idoneità alla mansione specifica" : "";
      }
      return nuovo;
    });
  }

  function iniziaModifica(doc: Documento) {
    setErrore(null);
    setMessaggio(null);
    setInModifica(doc);
    setForm({
      categoria: doc.categoria,
      tipo: doc.tipo,
      data_rilascio: doc.data_rilascio ?? "",
      data_scadenza: doc.data_scadenza ?? "",
      ente_emittente: doc.ente_emittente ?? "",
      esito: doc.esito ?? "idoneo",
    });
    setFile(null);
    setChiaveFile((k) => k + 1);
    setTimeout(() => {
      document.getElementById("modulo-documento")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function annullaModifica() {
    setInModifica(null);
    setForm(FORM_VUOTO);
    setFile(null);
    setChiaveFile((k) => k + 1);
    setErrore(null);
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);
    if (!userId) return;

    const tipo = form.tipo.trim();
    if (!tipo) {
      setErrore("Indica il tipo di documento.");
      return;
    }
    if (!inModifica && !file) {
      setErrore("Carica il file del documento (PDF o foto).");
      return;
    }
    if (file && file.size > MAX_BYTE) {
      setErrore("Il file è troppo grande: massimo 10 MB.");
      return;
    }
    if (form.data_rilascio && form.data_scadenza && form.data_scadenza < form.data_rilascio) {
      setErrore("La scadenza non può essere prima del rilascio.");
      return;
    }

    setSalvataggio(true);

    // Se c'è un file nuovo lo carico per primo
    let nuovoPercorso: string | null = null;
    if (file) {
      const estensione = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
      nuovoPercorso = `${userId}/${lavoratoreId}/${crypto.randomUUID()}.${estensione}`;
      const { error: erroreUpload } = await supabase.storage
        .from("documenti-lavoratori")
        .upload(nuovoPercorso, file, { contentType: file.type || undefined });
      if (erroreUpload) {
        setSalvataggio(false);
        setErrore(erroreUpload.message);
        return;
      }
    }

    const dati = {
      tipo,
      data_rilascio: form.data_rilascio || null,
      data_scadenza: form.data_scadenza || null,
      ente_emittente: form.ente_emittente.trim() || null,
      esito: form.categoria === "idoneita_sanitaria" ? form.esito : null,
    };

    let erroreDb: { message: string } | null = null;

    if (inModifica) {
      const aggiornamento: Record<string, unknown> = { ...dati };
      if (nuovoPercorso) aggiornamento.file_path = nuovoPercorso;
      const { error } = await supabase.from("documenti_lavoratore").update(aggiornamento).eq("id", inModifica.id);
      erroreDb = error;
      // Salvato bene: tolgo il file vecchio che è stato sostituito
      if (!error && nuovoPercorso && inModifica.file_path) {
        await supabase.storage.from("documenti-lavoratori").remove([inModifica.file_path]);
      }
    } else {
      const { error } = await supabase.from("documenti_lavoratore").insert({
        ...dati,
        lavoratore_id: lavoratoreId,
        impresa_id: userId,
        categoria: form.categoria,
        file_path: nuovoPercorso,
        origine: "manuale",
        stato_verifica: "confermato",
      });
      erroreDb = error;
    }

    setSalvataggio(false);

    if (erroreDb) {
      // se il salvataggio dei dati fallisce, tolgo il file appena caricato
      if (nuovoPercorso) await supabase.storage.from("documenti-lavoratori").remove([nuovoPercorso]);
      setErrore(erroreDb.message);
      return;
    }

    setMessaggio(inModifica ? "Documento aggiornato." : "Documento aggiunto.");
    const categoriaCorrente = form.categoria;
    setInModifica(null);
    setForm({
      ...FORM_VUOTO,
      categoria: categoriaCorrente,
      tipo: categoriaCorrente === "idoneita_sanitaria" ? "Idoneità alla mansione specifica" : "",
    });
    setFile(null);
    setChiaveFile((k) => k + 1);
    carica();
  }

  async function elimina(doc: Documento) {
    const ok = window.confirm(`Eliminare "${doc.tipo}"? Il file allegato verrà cancellato.`);
    if (!ok) return;
    setErrore(null);
    setMessaggio(null);
    const { error } = await supabase.from("documenti_lavoratore").delete().eq("id", doc.id);
    if (error) {
      setErrore(error.message);
      return;
    }
    if (doc.file_path) {
      await supabase.storage.from("documenti-lavoratori").remove([doc.file_path]);
    }
    if (inModifica?.id === doc.id) annullaModifica();
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!userId) return <p style={{ padding: 24 }}>Devi accedere per vedere i documenti.</p>;
  if (!nomeLavoratore) return <p style={{ padding: 24, color: "red" }}>{errore ?? "Lavoratore non trovato."}</p>;

  const idoneita = documenti.filter((d) => d.categoria === "idoneita_sanitaria").sort(ordinaPerScadenza);
  const formazione = documenti.filter((d) => d.categoria === "formazione").sort(ordinaPerScadenza);

  const idoneitaValida = idoneita.some((d) => {
    const s = stato(d);
    return d.esito !== "non_idoneo" && s.tipo !== "scaduto";
  });
  const scaduti = documenti.filter((d) => stato(d).tipo === "scaduto").length;
  const inScadenza = documenti.filter((d) => stato(d).tipo === "scadenza").length;

  function Tabella({ elenco }: { elenco: Documento[] }) {
    if (elenco.length === 0) return <p style={{ color: "#888", margin: "4px 0 16px" }}>Nessun documento.</p>;
    return (
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc", fontSize: 13 }}>
              <th style={{ padding: 8 }}>Documento</th>
              <th style={{ padding: 8 }}>Rilascio</th>
              <th style={{ padding: 8 }}>Scadenza</th>
              <th style={{ padding: 8 }}>Stato</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {elenco.map((d) => {
              const s = stato(d);
              const link = d.file_path ? linkFile[d.file_path] : undefined;
              return (
                <tr
                  key={d.id}
                  style={{
                    borderBottom: "1px solid #eee",
                    backgroundColor: inModifica?.id === d.id ? "#fff8e6" : undefined,
                  }}
                >
                  <td style={{ padding: 8 }}>
                    <strong>{d.tipo}</strong>
                    {d.esito && (
                      <div style={{ fontSize: 12, color: d.esito === "non_idoneo" ? "#c0392b" : "#555" }}>
                        {ETICHETTE_ESITO[d.esito]}
                      </div>
                    )}
                    {d.ente_emittente && <div style={{ fontSize: 12, color: "#777" }}>{d.ente_emittente}</div>}
                    {d.stato_verifica === "da_confermare" && (
                      <div style={{ fontSize: 12, color: "#8a5a00" }}>Da confermare</div>
                    )}
                  </td>
                  <td style={{ padding: 8, fontSize: 14 }}>{formatData(d.data_rilascio)}</td>
                  <td style={{ padding: 8, fontSize: 14 }}>{formatData(d.data_scadenza)}</td>
                  <td style={{ padding: 8 }}>
                    <span
                      style={{
                        backgroundColor: s.sfondo,
                        color: s.colore,
                        padding: "3px 8px",
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.testo}
                    </span>
                  </td>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                    {link && (
                      <a href={link} target="_blank" rel="noreferrer" style={{ ...stilePulsante, marginRight: 6 }}>
                        Apri file
                      </a>
                    )}
                    <button onClick={() => iniziaModifica(d)} style={{ ...stilePulsante, marginRight: 6 }}>
                      Modifica
                    </button>
                    <button onClick={() => elimina(d)} style={stilePulsante}>
                      Elimina
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const isIdoneita = form.categoria === "idoneita_sanitaria";

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 900 }}>
      <p style={{ margin: "0 0 8px" }}>
        <Link href="/lavoratori" style={{ color: "#1a73e8", textDecoration: "none" }}>
          ← Torna all&apos;elenco lavoratori
        </Link>
      </p>
      <h1 style={{ marginTop: 0, marginBottom: 4 }}>Documenti di {nomeLavoratore}</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Attestati di formazione e idoneità sanitaria. Li vede solo la tua impresa.
      </p>

      {(!idoneitaValida || scaduti > 0 || inScadenza > 0) && (
        <div
          style={{
            backgroundColor: "#fff8e6",
            border: "1px solid #f0d9a0",
            borderRadius: 6,
            padding: 10,
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {!idoneitaValida && <div>⚠️ Nessuna idoneità sanitaria valida registrata.</div>}
          {scaduti > 0 && (
            <div>
              ⚠️ {scaduti} {scaduti === 1 ? "documento scaduto" : "documenti scaduti"}.
            </div>
          )}
          {inScadenza > 0 && (
            <div>
              ⏳ {inScadenza} {inScadenza === 1 ? "documento scade" : "documenti scadono"} entro {GIORNI_PREAVVISO}{" "}
              giorni.
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginBottom: 4 }}>Idoneità sanitaria</h3>
      <Tabella elenco={idoneita} />

      <h3 style={{ marginBottom: 4 }}>Formazione e attestati</h3>
      <Tabella elenco={formazione} />

      <form
        id="modulo-documento"
        onSubmit={salva}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          backgroundColor: inModifica ? "#fff8e6" : "#fafafa",
          marginTop: 8,
        }}
      >
        <h3 style={{ marginTop: 0 }}>{inModifica ? "Modifica documento" : "Aggiungi un documento"}</h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div>
            <label style={stileEtichetta}>Categoria *</label>
            <select
              value={form.categoria}
              onChange={(e) => aggiorna("categoria", e.target.value)}
              disabled={!!inModifica}
              style={stileCampo}
            >
              <option value="formazione">Formazione / attestato</option>
              <option value="idoneita_sanitaria">Idoneità sanitaria</option>
            </select>
          </div>

          <div>
            <label style={stileEtichetta}>Tipo di documento *</label>
            {isIdoneita ? (
              <input value={form.tipo} onChange={(e) => aggiorna("tipo", e.target.value)} style={stileCampo} />
            ) : (
              <>
                <input
                  list="tipi-formazione"
                  value={form.tipo}
                  onChange={(e) => aggiorna("tipo", e.target.value)}
                  style={stileCampo}
                  placeholder="scegli o scrivi"
                />
                <datalist id="tipi-formazione">
                  {TIPI_FORMAZIONE.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </>
            )}
          </div>

          {isIdoneita && (
            <div>
              <label style={stileEtichetta}>Esito del giudizio *</label>
              <select value={form.esito} onChange={(e) => aggiorna("esito", e.target.value)} style={stileCampo}>
                <option value="idoneo">Idoneo</option>
                <option value="idoneo_con_limitazioni">Idoneo con limitazioni/prescrizioni</option>
                <option value="non_idoneo">Non idoneo</option>
              </select>
            </div>
          )}

          <div>
            <label style={stileEtichetta}>Data di rilascio</label>
            <input
              type="date"
              value={form.data_rilascio}
              onChange={(e) => aggiorna("data_rilascio", e.target.value)}
              style={stileCampo}
            />
          </div>
          <div>
            <label style={stileEtichetta}>Data di scadenza</label>
            <input
              type="date"
              value={form.data_scadenza}
              onChange={(e) => aggiorna("data_scadenza", e.target.value)}
              style={stileCampo}
            />
          </div>
          <div>
            <label style={stileEtichetta}>
              {isIdoneita ? "Medico competente / struttura" : "Ente che ha rilasciato il corso"}
            </label>
            <input
              value={form.ente_emittente}
              onChange={(e) => aggiorna("ente_emittente", e.target.value)}
              style={stileCampo}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={stileEtichetta}>
            {inModifica
              ? "Nuovo file (lascia vuoto per tenere quello attuale) – PDF o foto, massimo 10 MB"
              : "File del documento (PDF o foto, massimo 10 MB) *"}
          </label>
          <input
            key={chiaveFile}
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ display: "block", marginTop: 4 }}
          />
        </div>

        {isIdoneita && (
          <p style={{ fontSize: 13, color: "#8a5a00", marginBottom: 0 }}>
            Registra solo l&apos;esito e la scadenza. Non scrivere diagnosi o altri dati sanitari.
          </p>
        )}

        {errore && <p style={{ color: "red", marginBottom: 0 }}>{errore}</p>}
        {messaggio && <p style={{ color: "#16a34a", marginBottom: 0 }}>{messaggio}</p>}

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="submit"
            disabled={salvataggio}
            style={{
              padding: "9px 20px",
              backgroundColor: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {salvataggio ? "Salvataggio..." : inModifica ? "Salva modifiche" : "Aggiungi documento"}
          </button>
          {inModifica && (
            <button
              type="button"
              onClick={annullaModifica}
              style={{ padding: "9px 16px", borderRadius: 6, border: "1px solid #ccc", backgroundColor: "#fff" }}
            >
              Annulla
            </button>
          )}
          <button
            type="button"
            disabled
            title="In arrivo"
            style={{
              padding: "9px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              backgroundColor: "#f0f0f0",
              color: "#888",
            }}
          >
            Leggi automaticamente (in arrivo)
          </button>
        </div>
      </form>
    </div>
  );
}
