"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { comprimiImmagine, validaFile } from "@/lib/caricamentoFile";

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

  async function carica() {
    setCaricamento(true);
    const { data: userData } = await supabase.auth.getUser();
    setMioId(userData?.user?.id ?? null);

    const { data: puo } = await supabase.rpc("puo_gestire_attivita", { cid: cantiereId });
    setPuoScrivere(puo === true);

    const { data: elenco, error } = await supabase
      .from("diario_cantiere")
      .select("*")
      .eq("cantiere_id", cantiereId)
      .order("data", { ascending: false })
      .order("creato_il", { ascending: false });
    if (error) {
      setErrore(error.message);
      setCaricamento(false);
      return;
    }
    const lista = ((elenco || []) as any[]).map((v) => ({ ...v, foto: Array.isArray(v.foto) ? v.foto : [] })) as Voce[];
    setVoci(lista);

    // Autori
    const { data: membri } = await supabase
      .from("cantiere_membri")
      .select("profilo_id, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId);
    const mappa: Record<string, string> = {};
    (membri || []).forEach((m: any) => {
      if (m.profilo_id) mappa[m.profilo_id] = m.profili?.email ?? "";
    });
    setAutori(mappa);

    // Presenze registrate nei giorni del diario (se la lettura non riesce, si omette)
    const date = Array.from(new Set(lista.map((v) => v.data)));
    if (date.length > 0) {
      const { data: pres, error: errPres } = await supabase
        .from("presenze")
        .select("data")
        .eq("cantiere_id", cantiereId)
        .in("data", date);
      if (!errPres) {
        const conteggio: Record<string, number> = {};
        (pres || []).forEach((p: any) => {
          conteggio[p.data] = (conteggio[p.data] || 0) + 1;
        });
        setPresenti(conteggio);
      }
    }

    await caricaUrls(lista.flatMap((v) => v.foto));
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
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
    if (!mioId) return;
    const t = await token();
    if (!t) {
      setErrore("Sessione scaduta: accedi di nuovo.");
      return;
    }
    setSalvataggio(true);

    const caricate: string[] = [];
    for (const f of files) {
      const piccola = await comprimiImmagine(f);
      const valida = validaFile(piccola);
      if (!valida.valido) {
        setErrore(`${f.name}: ${valida.errore || "file non valido"}`);
        setSalvataggio(false);
        return;
      }
      const form = new FormData();
      form.append("cantiereId", cantiereId);
      form.append("file", piccola);
      try {
        const r = await fetch("/api/diario", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          setErrore(`Foto "${f.name}" non caricata: ${j?.errore || "errore " + r.status}`);
          setSalvataggio(false);
          return;
        }
        caricate.push(j.percorso);
      } catch {
        setErrore("Caricamento foto non riuscito: controlla la connessione.");
        setSalvataggio(false);
        return;
      }
    }

    const { error } = await supabase.from("diario_cantiere").insert({
      cantiere_id: cantiereId,
      data,
      meteo: meteo || null,
      testo: testo.trim(),
      foto: caricate,
      creato_da: mioId,
    });
    setSalvataggio(false);
    if (error) {
      setErrore(error.message);
      return;
    }
    setTesto("");
    setMeteo("");
    setFiles([]);
    setMostraForm(false);
    setMessaggio("Voce salvata nel diario.");
    carica();
  }

  async function elimina(v: Voce) {
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

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}

      {voci.length === 0 ? (
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
    </div>
  );
}
