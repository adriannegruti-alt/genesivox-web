"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Doc = {
  id: string;
  categoria: string;
  tipo: string;
  data_scadenza: string;
  lavoratore_id: string;
  nome: string;
  cognome: string;
};

const GIORNI_PREAVVISO = 60;

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

function formatData(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function stato(giorni: number): { testo: string; colore: string; sfondo: string } {
  if (giorni < 0) return { testo: `Scaduto da ${-giorni} gg`, colore: "#fff", sfondo: "#c0392b" };
  if (giorni <= GIORNI_PREAVVISO) return { testo: `Scade tra ${giorni} gg`, colore: "#5c3d00", sfondo: "#ffd666" };
  return { testo: `Scade tra ${giorni} gg`, colore: "#fff", sfondo: "#16a34a" };
}

export default function ScadenzePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [documenti, setDocumenti] = useState<Doc[]>([]);
  const [richiesti, setRichiesti] = useState<Set<string>>(new Set());
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [finestra, setFinestra] = useState(90);
  const [occupato, setOccupato] = useState<string | null>(null);

  async function carica() {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u?.user?.id ?? null);
    if (!u?.user) {
      setCaricamento(false);
      return;
    }

    const { data, error } = await supabase
      .from("documenti_lavoratore")
      .select("id, categoria, tipo, data_scadenza, lavoratore_id, lavoratori(nome, cognome, attivo)")
      .not("data_scadenza", "is", null)
      .order("data_scadenza", { ascending: true });
    if (error) setErrore(error.message);

    const elenco: Doc[] = (data || [])
      .filter((d: any) => d.lavoratori && d.lavoratori.attivo !== false)
      .map((d: any) => ({
        id: d.id,
        categoria: d.categoria,
        tipo: d.tipo,
        data_scadenza: d.data_scadenza,
        lavoratore_id: d.lavoratore_id,
        nome: d.lavoratori.nome,
        cognome: d.lavoratori.cognome,
      }));
    setDocumenti(elenco);

    const { data: richieste } = await supabase
      .from("richieste_corso")
      .select("documento_id")
      .in("stato", ["nuova", "inoltrata"]);
    setRichiesti(new Set((richieste || []).map((r: any) => String(r.documento_id))));

    setCaricamento(false);
  }

  useEffect(() => {
    carica();
  }, []);

  async function richiediCorso(d: Doc) {
    if (!userId) return;
    setErrore(null);
    setMessaggio(null);
    const note = window.prompt(
      `Richiesta di corso: ${d.tipo} per ${d.cognome} ${d.nome}.\n\nVuoi aggiungere una nota (periodo preferito, sede, ecc.)? Facoltativa.`,
      ""
    );
    if (note === null) return; // annullato
    setOccupato(d.id);
    const { error } = await supabase.from("richieste_corso").insert({
      impresa_id: userId,
      lavoratore_id: d.lavoratore_id,
      documento_id: d.id,
      tipo_corso: d.tipo,
      note: note.trim() || null,
    });
    setOccupato(null);
    if (error) {
      setErrore("Non è stato possibile inviare la richiesta. Riprova.");
      return;
    }
    setMessaggio("Richiesta inviata. Ti ricontatteremo con le opzioni disponibili.");
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!userId) return <p style={{ padding: 24 }}>Devi accedere per vedere le scadenze.</p>;

  const oggi = oggiRoma();
  const righe = documenti.map((d) => ({ ...d, giorni: giorniTra(oggi, d.data_scadenza) }));
  const scaduti = righe.filter((r) => r.giorni < 0).length;
  const entro30 = righe.filter((r) => r.giorni >= 0 && r.giorni <= 30).length;
  const entro60 = righe.filter((r) => r.giorni > 30 && r.giorni <= 60).length;
  const visibili = righe.filter((r) => r.giorni <= finestra);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 950 }}>
      <h1 style={{ marginBottom: 4 }}>Scadenze</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Formazione e idoneità sanitaria dei tuoi lavoratori, dalla più urgente. Per rinnovare un documento apri i
        documenti del lavoratore e premi Modifica.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <div style={{ background: "#fdecea", border: "1px solid #f5c2bd", borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#c0392b" }}>{scaduti}</div>
          <div style={{ fontSize: 12, color: "#666" }}>scaduti</div>
        </div>
        <div style={{ background: "#fff4d6", border: "1px solid #f0d9a0", borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#8a5a00" }}>{entro30}</div>
          <div style={{ fontSize: 12, color: "#666" }}>entro 30 giorni</div>
        </div>
        <div style={{ background: "#fff8e6", border: "1px solid #f0d9a0", borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#8a5a00" }}>{entro60}</div>
          <div style={{ fontSize: 12, color: "#666" }}>entro 60 giorni</div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, color: "#666", marginRight: 8 }}>Mostra:</label>
        <select
          value={finestra}
          onChange={(e) => setFinestra(Number(e.target.value))}
          style={{ padding: 6, fontSize: 14 }}
        >
          <option value={30}>Scaduti e in scadenza entro 30 giorni</option>
          <option value={60}>Scaduti e in scadenza entro 60 giorni</option>
          <option value={90}>Scaduti e in scadenza entro 90 giorni</option>
          <option value={365}>Scaduti e in scadenza entro 1 anno</option>
          <option value={100000}>Tutte le scadenze</option>
        </select>
      </div>

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}

      {visibili.length === 0 ? (
        <p style={{ color: "#888" }}>
          {documenti.length === 0
            ? "Nessun documento con scadenza. Aggiungili da Lavoratori → Documenti."
            : "Nessuna scadenza in questo periodo."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc", fontSize: 13 }}>
                <th style={{ padding: 8 }}>Lavoratore</th>
                <th style={{ padding: 8 }}>Documento</th>
                <th style={{ padding: 8 }}>Scadenza</th>
                <th style={{ padding: 8 }}>Stato</th>
                <th style={{ padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((r) => {
                const s = stato(r.giorni);
                const gia = richiesti.has(r.id);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>
                      {r.cognome} {r.nome}
                    </td>
                    <td style={{ padding: 8 }}>
                      {r.tipo}
                      <div style={{ fontSize: 12, color: "#888" }}>
                        {r.categoria === "idoneita_sanitaria" ? "Idoneità sanitaria" : "Formazione"}
                      </div>
                    </td>
                    <td style={{ padding: 8, fontSize: 14 }}>{formatData(r.data_scadenza)}</td>
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
                      <Link href={`/lavoratori/${r.lavoratore_id}/documenti`} style={{ ...stilePulsante, marginRight: 6 }}>
                        Documenti
                      </Link>
                      {r.categoria === "formazione" ? (
                        gia ? (
                          <span style={{ fontSize: 13, color: "#16a34a" }}>✔ Richiesta inviata</span>
                        ) : (
                          <button
                            onClick={() => richiediCorso(r)}
                            disabled={occupato === r.id}
                            style={{ ...stilePulsante, borderColor: "#1a73e8", color: "#1a73e8" }}
                          >
                            Richiedi corso
                          </button>
                        )
                      ) : (
                        <span style={{ fontSize: 12, color: "#888" }}>Visita: contatta il medico competente</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#777", marginTop: 16 }}>
        La richiesta di corso arriva a Genesivox, che ti ricontatta con le opzioni disponibili. Genesivox non eroga i
        corsi.
      </p>
    </div>
  );
}
