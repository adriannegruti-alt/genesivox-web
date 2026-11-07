"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Condivisione = { id: string; email_destinatario: string; creato_il: string };
type Impresa = { id: string; nome: string };
type Doc = { id: string; tipo_documento: string; nome_file: string | null; data_scadenza: string | null; creato_il: string };

function formatData(s: string): string {
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

const stilePulsante: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 13,
  border: "1px solid #ccc",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

export default function FascicoloPage() {
  const [mioId, setMioId] = useState<string | null>(null);
  const [mioEmail, setMioEmail] = useState("");
  const [condivisioni, setCondivisioni] = useState<Condivisione[]>([]);
  const [imprese, setImprese] = useState<Impresa[]>([]);
  const [impresaAperta, setImpresaAperta] = useState<Impresa | null>(null);
  const [documenti, setDocumenti] = useState<Doc[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [nuovaEmail, setNuovaEmail] = useState("");
  const [occupato, setOccupato] = useState(false);

  async function chiama(corpo: any): Promise<any> {
    const { data: sessione } = await supabase.auth.getSession();
    const token = sessione?.session?.access_token;
    if (!token) return { ok: false, errore: "Sessione scaduta: accedi di nuovo." };
    try {
      const risposta = await fetch("/api/fascicolo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(corpo),
      });
      const json = await risposta.json().catch(() => null);
      return json || { ok: false, errore: `Errore ${risposta.status}` };
    } catch {
      return { ok: false, errore: "Controlla la connessione e riprova." };
    }
  }

  async function carica() {
    setCaricamento(true);
    const { data: userData } = await supabase.auth.getUser();
    setMioId(userData?.user?.id ?? null);
    setMioEmail((userData?.user?.email ?? "").toLowerCase());

    if (userData?.user?.id) {
      const { data } = await supabase
        .from("condivisioni_fascicolo")
        .select("id, email_destinatario, creato_il")
        .eq("impresa_id", userData.user.id)
        .order("creato_il", { ascending: false });
      setCondivisioni((data || []) as Condivisione[]);
    }

    const r = await chiama({ azione: "condivisi" });
    if (r.ok) setImprese(r.imprese || []);
    setCaricamento(false);
  }

  useEffect(() => {
    carica();
  }, []);

  async function condividi(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);
    const email = nuovaEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrore("Scrivi un indirizzo email valido.");
      return;
    }
    if (email === mioEmail) {
      setErrore("Questa è la tua email: il fascicolo lo vedi già.");
      return;
    }
    if (!mioId) return;
    setOccupato(true);
    const { error } = await supabase.from("condivisioni_fascicolo").insert({ impresa_id: mioId, email_destinatario: email });
    if (error) {
      setOccupato(false);
      setErrore(error.code === "23505" ? "Hai già dato accesso a questa email." : error.message);
      return;
    }
    const r = await chiama({ azione: "avvisa", email });
    setOccupato(false);
    setNuovaEmail("");
    setMessaggio(
      r.ok
        ? r.inviata
          ? `Accesso concesso. Abbiamo avvisato ${email}.`
          : `Accesso concesso. ${r.motivo || ""}`
        : `Accesso concesso, ma l'avviso non è partito (${r.errore}).`
    );
    carica();
  }

  async function revoca(c: Condivisione) {
    if (!window.confirm(`Togliere l'accesso a ${c.email_destinatario}?`)) return;
    setErrore(null);
    setMessaggio(null);
    const { error } = await supabase.from("condivisioni_fascicolo").delete().eq("id", c.id);
    if (error) {
      setErrore(error.message);
      return;
    }
    setMessaggio("Accesso revocato.");
    carica();
  }

  async function apriImpresa(i: Impresa) {
    setErrore(null);
    setImpresaAperta(i);
    setDocumenti([]);
    const r = await chiama({ azione: "fascicolo", impresaId: i.id });
    if (!r.ok) {
      setErrore(r.errore || "Non è stato possibile aprire il fascicolo.");
      return;
    }
    setDocumenti(r.documenti || []);
  }

  async function apriDocumento(d: Doc) {
    setErrore(null);
    const r = await chiama({ azione: "apri", documentoId: d.id });
    if (!r.ok || !r.url) {
      setErrore(r.errore || "Non è stato possibile aprire il documento.");
      return;
    }
    window.open(r.url, "_blank");
  }

  const oggi = oggiRoma();

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Fascicolo aziendale</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        I documenti della tua impresa in un unico posto, da condividere con committenti e imprese appaltatrici senza
        rimandarli per ogni cantiere.
      </p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Condividi il tuo fascicolo</h2>
      <p style={{ fontSize: 14, color: "#444" }}>
        Scrivi l&apos;email con cui la persona accede a GENESIVOX. Vedrà l&apos;ultima versione dei documenti della tua
        impresa (non i dati dei lavoratori). Puoi togliere l&apos;accesso quando vuoi.
      </p>
      <form onSubmit={condividi} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          type="email"
          value={nuovaEmail}
          onChange={(e) => setNuovaEmail(e.target.value)}
          placeholder="email@committente.it"
          style={{ padding: 8, minWidth: 260, flex: 1 }}
        />
        <button
          type="submit"
          disabled={occupato}
          style={{ padding: "8px 16px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
        >
          {occupato ? "Invio..." : "Dai accesso"}
        </button>
      </form>
      {condivisioni.length === 0 ? (
        <p style={{ color: "#888", fontSize: 14 }}>Non hai ancora condiviso il fascicolo con nessuno.</p>
      ) : (
        condivisioni.map((c) => (
          <div
            key={c.id}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid #f0f2f5" }}
          >
            <span style={{ fontSize: 14 }}>
              {c.email_destinatario} <span style={{ color: "#888" }}>· dal {formatData(c.creato_il)}</span>
            </span>
            <button style={{ ...stilePulsante, color: "#c0392b" }} onClick={() => revoca(c)}>
              Togli accesso
            </button>
          </div>
        ))
      )}

      <h2 style={{ fontSize: 18, marginTop: 32 }}>Fascicoli condivisi con te</h2>
      {imprese.length === 0 ? (
        <p style={{ color: "#888", fontSize: 14 }}>Nessuna impresa ha ancora condiviso il fascicolo con te.</p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {imprese.map((i) => (
            <button
              key={i.id}
              onClick={() => apriImpresa(i)}
              style={{
                ...stilePulsante,
                fontSize: 14,
                padding: "8px 14px",
                borderColor: impresaAperta?.id === i.id ? "#1a73e8" : "#ccc",
                color: impresaAperta?.id === i.id ? "#1a73e8" : "#333",
              }}
            >
              {i.nome}
            </button>
          ))}
        </div>
      )}

      {impresaAperta && (
        <div style={{ border: "1px solid #e4e7ec", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, color: "#1a3c6e", marginBottom: 8 }}>{impresaAperta.nome}</div>
          {documenti.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>Questa impresa non ha ancora caricato documenti.</p>
          ) : (
            documenti.map((d) => {
              const scaduto = d.data_scadenza && d.data_scadenza.slice(0, 10) < oggi;
              return (
                <div
                  key={d.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid #f0f2f5" }}
                >
                  <span style={{ fontSize: 14 }}>
                    <strong>{d.tipo_documento}</strong>
                    <span style={{ color: "#888" }}> · caricato il {formatData(d.creato_il)}</span>
                    {d.data_scadenza && (
                      <span style={{ color: scaduto ? "#c0392b" : "#666" }}>
                        {" "}
                        · {scaduto ? "scaduto il" : "scade il"} {formatData(d.data_scadenza)}
                      </span>
                    )}
                  </span>
                  <button style={stilePulsante} onClick={() => apriDocumento(d)}>
                    Apri
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
