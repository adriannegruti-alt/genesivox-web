"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Lavoratore = {
  id: string;
  nome: string;
  cognome: string;
  codice_fiscale: string | null;
  mansione: string | null;
  data_assunzione: string | null;
  attivo: boolean;
};

const FORM_VUOTO = {
  nome: "",
  cognome: "",
  codice_fiscale: "",
  mansione: "",
  data_assunzione: "",
};

const stileCampo: React.CSSProperties = {
  width: "100%",
  padding: 8,
  boxSizing: "border-box",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
};

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

export default function LavoratoriPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [elenco, setElenco] = useState<Lavoratore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VUOTO);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [mostraDisattivati, setMostraDisattivati] = useState(false);
  const [cerca, setCerca] = useState("");

  async function carica() {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u?.user?.id ?? null);
    if (!u?.user) {
      setCaricamento(false);
      return;
    }

    const { data, error } = await supabase
      .from("lavoratori")
      .select("id, nome, cognome, codice_fiscale, mansione, data_assunzione, attivo")
      .order("cognome", { ascending: true })
      .order("nome", { ascending: true });

    if (error) setErrore(error.message);
    setElenco(data || []);
    setCaricamento(false);
  }

  useEffect(() => {
    carica();
  }, []);

  function aggiorna(campo: keyof typeof FORM_VUOTO, valore: string) {
    setForm((f) => ({ ...f, [campo]: valore }));
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);
    if (!userId) return;

    const nome = form.nome.trim();
    const cognome = form.cognome.trim();
    if (!nome || !cognome) {
      setErrore("Nome e cognome sono obbligatori.");
      return;
    }

    const cf = form.codice_fiscale.trim().toUpperCase();
    if (cf && cf.length !== 16) {
      const procedi = window.confirm("Il codice fiscale non ha 16 caratteri. Vuoi salvare comunque?");
      if (!procedi) return;
    }

    const dati = {
      nome,
      cognome,
      codice_fiscale: cf || null,
      mansione: form.mansione.trim() || null,
      data_assunzione: form.data_assunzione || null,
    };

    setSalvataggio(true);
    let error: any;
    if (inModifica) {
      ({ error } = await supabase.from("lavoratori").update(dati).eq("id", inModifica));
    } else {
      ({ error } = await supabase.from("lavoratori").insert({ ...dati, impresa_id: userId }));
    }
    setSalvataggio(false);

    if (error) {
      if (error.code === "23505") {
        setErrore("Esiste già un lavoratore con questo codice fiscale.");
      } else {
        setErrore(error.message);
      }
      return;
    }

    setMessaggio(inModifica ? "Modifiche salvate." : "Lavoratore aggiunto.");
    setForm(FORM_VUOTO);
    setInModifica(null);
    carica();
  }

  function modifica(l: Lavoratore) {
    setErrore(null);
    setMessaggio(null);
    setInModifica(l.id);
    setForm({
      nome: l.nome,
      cognome: l.cognome,
      codice_fiscale: l.codice_fiscale ?? "",
      mansione: l.mansione ?? "",
      data_assunzione: l.data_assunzione ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function annullaModifica() {
    setInModifica(null);
    setForm(FORM_VUOTO);
    setErrore(null);
  }

  async function cambiaStato(l: Lavoratore) {
    setErrore(null);
    setMessaggio(null);
    if (l.attivo) {
      const ok = window.confirm(
        `Disattivare ${l.cognome} ${l.nome}? Non comparirà più nell'elenco attivo, ma i suoi dati restano archiviati.`
      );
      if (!ok) return;
    }
    const { error } = await supabase.from("lavoratori").update({ attivo: !l.attivo }).eq("id", l.id);
    if (error) {
      setErrore(error.message);
      return;
    }
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!userId) return <p style={{ padding: 24 }}>Devi accedere per vedere i lavoratori.</p>;

  const testoCerca = cerca.trim().toLowerCase();
  const visibili = elenco.filter((l) => {
    if (!mostraDisattivati && !l.attivo) return false;
    if (!testoCerca) return true;
    return `${l.cognome} ${l.nome} ${l.codice_fiscale ?? ""} ${l.mansione ?? ""}`.toLowerCase().includes(testoCerca);
  });
  const numeroAttivi = elenco.filter((l) => l.attivo).length;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1 style={{ marginBottom: 4 }}>I miei lavoratori</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Elenco dei lavoratori della tua impresa. Qui li inserisci una volta sola: poi a ognuno si collegano attestati,
        idoneità e tesserino. Nessun&apos;altra impresa vede questo elenco.
      </p>

      <form
        onSubmit={salva}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          backgroundColor: inModifica ? "#fff8e6" : "#fafafa",
          marginBottom: 24,
        }}
      >
        <h3 style={{ marginTop: 0 }}>{inModifica ? "Modifica lavoratore" : "Aggiungi un lavoratore"}</h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Nome *</label>
            <input value={form.nome} onChange={(e) => aggiorna("nome", e.target.value)} style={stileCampo} required />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Cognome *</label>
            <input
              value={form.cognome}
              onChange={(e) => aggiorna("cognome", e.target.value)}
              style={stileCampo}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Codice fiscale</label>
            <input
              value={form.codice_fiscale}
              onChange={(e) => aggiorna("codice_fiscale", e.target.value.toUpperCase())}
              style={stileCampo}
              maxLength={20}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Mansione (es. muratore, gruista)</label>
            <input value={form.mansione} onChange={(e) => aggiorna("mansione", e.target.value)} style={stileCampo} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Data di assunzione</label>
            <input
              type="date"
              value={form.data_assunzione}
              onChange={(e) => aggiorna("data_assunzione", e.target.value)}
              style={stileCampo}
            />
          </div>
        </div>

        {errore && <p style={{ color: "red", marginBottom: 0 }}>{errore}</p>}
        {messaggio && <p style={{ color: "#16a34a", marginBottom: 0 }}>{messaggio}</p>}

        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
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
            {salvataggio ? "Salvataggio..." : inModifica ? "Salva modifiche" : "Aggiungi lavoratore"}
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
        </div>
      </form>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <strong>
          {numeroAttivi} {numeroAttivi === 1 ? "lavoratore attivo" : "lavoratori attivi"}
        </strong>
        <input
          placeholder="Cerca per nome, cognome, mansione..."
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          style={{ ...stileCampo, width: 260 }}
        />
        <label style={{ fontSize: 13, color: "#555" }}>
          <input
            type="checkbox"
            checked={mostraDisattivati}
            onChange={(e) => setMostraDisattivati(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Mostra anche i disattivati
        </label>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: 8 }}>Lavoratore</th>
              <th style={{ padding: 8 }}>Mansione</th>
              <th style={{ padding: 8 }}>Codice fiscale</th>
              <th style={{ padding: 8 }}>Assunzione</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #eee", opacity: l.attivo ? 1 : 0.55 }}>
                <td style={{ padding: 8, fontWeight: 600 }}>
                  {l.cognome} {l.nome}
                  {!l.attivo && <span style={{ marginLeft: 8, fontSize: 12, color: "#c0392b" }}>disattivato</span>}
                </td>
                <td style={{ padding: 8 }}>{l.mansione || "—"}</td>
                <td style={{ padding: 8, fontSize: 13 }}>{l.codice_fiscale || "—"}</td>
                <td style={{ padding: 8 }}>
                  {l.data_assunzione ? new Date(l.data_assunzione).toLocaleDateString("it-IT") : "—"}
                </td>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                  <Link href={`/lavoratori/${l.id}`} style={{ ...stilePulsante, marginRight: 6 }}>
                    Tesserino
                  </Link>
                  <button onClick={() => modifica(l)} style={{ ...stilePulsante, marginRight: 6 }}>
                    Modifica
                  </button>
                  <button onClick={() => cambiaStato(l)} style={stilePulsante}>
                    {l.attivo ? "Disattiva" : "Riattiva"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibili.length === 0 && (
        <p style={{ color: "#888" }}>
          {elenco.length === 0 ? "Nessun lavoratore ancora. Aggiungi il primo qui sopra." : "Nessun risultato."}
        </p>
      )}
    </div>
  );
}
