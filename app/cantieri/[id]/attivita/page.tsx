"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  async function carica() {
    setCaricamento(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id ?? null;
    setMioId(uid);

    const { data: puo } = await supabase.rpc("puo_gestire_attivita", { cid: cantiereId });
    setPuoCreare(puo === true);

    const { data: elenco, error } = await supabase
      .from("attivita_cantiere")
      .select("*")
      .eq("cantiere_id", cantiereId)
      .order("creato_il", { ascending: false });
    if (error) setErrore(error.message);
    else setRighe((elenco || []) as Riga[]);

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
    setPersone(lista);

    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  function emailDi(id: string | null): string {
    if (!id) return "nessuno";
    return persone.find((p) => p.id === id)?.email ?? "altro utente";
  }

  // Restituisce una frase che dice com'è andato l'avviso (mai "avvisata" se non è vero).
  async function avvisa(attivitaId: string, evento: "assegnata" | "chiusa"): Promise<string> {
    try {
      const { data: sessione } = await supabase.auth.getSession();
      const token = sessione?.session?.access_token;
      if (!token) return "L'avviso non è partito: sessione scaduta.";
      const risposta = await fetch("/api/attivita/notifica", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ attivitaId, evento }),
      });
      const json = await risposta.json().catch(() => null);
      if (!risposta.ok || !json?.ok) return `L'avviso non è partito (${json?.errore || "errore " + risposta.status}).`;
      if (!json.avvisati) return `Nessun avviso inviato: ${json.motivo || "nessun destinatario"}.`;
      if (json.erroreEmail) return `Avviso non inviato per email (${json.erroreEmail}).`;
      return `Avviso inviato a ${json.destinatario}.`;
    } catch {
      return "L'avviso non è partito: controlla la connessione.";
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
    if (!mioId) return;
    setSalvataggio(true);
    const { data, error } = await supabase
      .from("attivita_cantiere")
      .insert({
        cantiere_id: cantiereId,
        tipo,
        titolo: titolo.trim(),
        descrizione: descrizione.trim() || null,
        gravita: tipo === "non_conformita" ? gravita : null,
        assegnata_a: assegnataA || null,
        scadenza: scadenza || null,
        creato_da: mioId,
      })
      .select("id")
      .single();
    setSalvataggio(false);
    if (error || !data) {
      setErrore(error?.message || "Non è stato possibile salvare.");
      return;
    }
    let esitoAvviso = "";
    if (assegnataA && assegnataA !== mioId) esitoAvviso = await avvisa(data.id, "assegnata");
    setTitolo("");
    setDescrizione("");
    setScadenza("");
    setAssegnataA("");
    setMostraForm(false);
    setMessaggio(esitoAvviso ? `Salvata. ${esitoAvviso}` : "Salvata.");
    carica();
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
    const { data, error } = await supabase
      .from("attivita_cantiere")
      .update({
        stato: nuovo,
        chiusa_il: nuovo === "chiusa" ? new Date().toISOString() : null,
        nota_chiusura: nuovo === "chiusa" ? nota : null,
      })
      .eq("id", r.id)
      .select("id");
    if (error) {
      setErrore(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErrore("Non hai i permessi per modificare questa voce.");
      return;
    }
    if (nuovo === "chiusa") setMessaggio(`Chiusa. ${await avvisa(r.id, "chiusa")}`);
    carica();
  }

  async function elimina(r: Riga) {
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

  const oggi = oggiRoma();
  const visibili = righe.filter((r) => {
    if (filtroStato === "aperte" && r.stato === "chiusa") return false;
    if (filtroStato === "chiuse" && r.stato !== "chiusa") return false;
    if (filtroTipo !== "tutti" && r.tipo !== filtroTipo) return false;
    return true;
  });
  const nAperte = righe.filter((r) => r.stato !== "chiusa").length;
  const nScadute = righe.filter((r) => r.stato !== "chiusa" && r.scadenza && r.scadenza < oggi).length;

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
