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
  tipo_rapporto: string;
  tipo_contratto: string | null;
  livello: string | null;
  committente: string | null;
  in_subappalto: boolean;
  autorizzazione_subappalto: string | null;
};

const FORM_VUOTO = {
  tipo_rapporto: "dipendente",
  nome: "",
  cognome: "",
  codice_fiscale: "",
  mansione: "",
  data_assunzione: "",
  tipo_contratto: "",
  livello: "",
  committente: "",
  in_subappalto: false,
  autorizzazione_subappalto: "",
};

const CONTRATTI = [
  "Tempo indeterminato",
  "Tempo determinato",
  "Apprendistato",
  "Somministrazione",
  "Altro",
];

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

export default function LavoratoriPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [elenco, setElenco] = useState<Lavoratore[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [form, setForm] = useState<typeof FORM_VUOTO>(FORM_VUOTO);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [mostraDisattivati, setMostraDisattivati] = useState(false);
  const [cerca, setCerca] = useState("");

  // Dati dell'impresa (datore di lavoro)
  const [impresa, setImpresa] = useState({ impresa: "", partita_iva: "", sede_legale: "" });
  const [messaggioImpresa, setMessaggioImpresa] = useState<string | null>(null);
  const [erroreImpresa, setErroreImpresa] = useState<string | null>(null);

  async function carica() {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u?.user?.id ?? null);
    if (!u?.user) {
      setCaricamento(false);
      return;
    }

    const { data: profilo } = await supabase
      .from("profili")
      .select("impresa, partita_iva, sede_legale")
      .eq("id", u.user.id)
      .maybeSingle();
    setImpresa({
      impresa: profilo?.impresa ?? "",
      partita_iva: profilo?.partita_iva ?? "",
      sede_legale: profilo?.sede_legale ?? "",
    });

    const { data, error } = await supabase
      .from("lavoratori")
      .select(
        "id, nome, cognome, codice_fiscale, mansione, data_assunzione, attivo, tipo_rapporto, tipo_contratto, livello, committente, in_subappalto, autorizzazione_subappalto"
      )
      .order("cognome", { ascending: true })
      .order("nome", { ascending: true });

    if (error) setErrore(error.message);
    setElenco(data || []);
    setCaricamento(false);
  }

  useEffect(() => {
    carica();
  }, []);

  function aggiorna(campo: keyof typeof FORM_VUOTO, valore: string | boolean) {
    setForm((f) => ({ ...f, [campo]: valore }));
  }

  async function salvaImpresa(e: React.FormEvent) {
    e.preventDefault();
    setErroreImpresa(null);
    setMessaggioImpresa(null);
    if (!userId) return;
    const { error } = await supabase
      .from("profili")
      .update({
        impresa: impresa.impresa.trim() || null,
        partita_iva: impresa.partita_iva.trim() || null,
        sede_legale: impresa.sede_legale.trim() || null,
      })
      .eq("id", userId);
    if (error) {
      setErroreImpresa(error.message);
      return;
    }
    setMessaggioImpresa("Dati dell'impresa salvati.");
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);
    if (!userId) return;

    const autonomo = form.tipo_rapporto === "autonomo";
    const nome = form.nome.trim();
    const cognome = form.cognome.trim();
    if (!nome || !cognome) {
      setErrore("Nome e cognome sono obbligatori.");
      return;
    }
    if (autonomo && !form.committente.trim()) {
      setErrore("Per un lavoratore autonomo indica il committente.");
      return;
    }
    if (!autonomo && form.in_subappalto && !form.autorizzazione_subappalto.trim()) {
      setErrore("Se il lavoratore è in subappalto, indica gli estremi dell'autorizzazione.");
      return;
    }

    const cf = form.codice_fiscale.trim().toUpperCase();
    if (cf && cf.length !== 16) {
      const procedi = window.confirm("Il codice fiscale non ha 16 caratteri. Vuoi salvare comunque?");
      if (!procedi) return;
    }

    const dati = {
      tipo_rapporto: form.tipo_rapporto,
      nome,
      cognome,
      codice_fiscale: cf || null,
      mansione: form.mansione.trim() || null,
      data_assunzione: autonomo ? null : form.data_assunzione || null,
      tipo_contratto: autonomo ? null : form.tipo_contratto || null,
      livello: autonomo ? null : form.livello.trim() || null,
      committente: autonomo ? form.committente.trim() : null,
      in_subappalto: autonomo ? false : form.in_subappalto,
      autorizzazione_subappalto: !autonomo && form.in_subappalto ? form.autorizzazione_subappalto.trim() : null,
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
      tipo_rapporto: l.tipo_rapporto || "dipendente",
      nome: l.nome,
      cognome: l.cognome,
      codice_fiscale: l.codice_fiscale ?? "",
      mansione: l.mansione ?? "",
      data_assunzione: l.data_assunzione ?? "",
      tipo_contratto: l.tipo_contratto ?? "",
      livello: l.livello ?? "",
      committente: l.committente ?? "",
      in_subappalto: !!l.in_subappalto,
      autorizzazione_subappalto: l.autorizzazione_subappalto ?? "",
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

  const autonomo = form.tipo_rapporto === "autonomo";
  const testoCerca = cerca.trim().toLowerCase();
  const visibili = elenco.filter((l) => {
    if (!mostraDisattivati && !l.attivo) return false;
    if (!testoCerca) return true;
    return `${l.cognome} ${l.nome} ${l.codice_fiscale ?? ""} ${l.mansione ?? ""}`.toLowerCase().includes(testoCerca);
  });
  const numeroAttivi = elenco.filter((l) => l.attivo).length;
  const datiImpresaIncompleti = !impresa.impresa.trim() || !impresa.partita_iva.trim();

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 900 }}>
      <h1 style={{ marginBottom: 4 }}>I miei lavoratori</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Elenco dei lavoratori della tua impresa. Qui li inserisci una volta sola: poi a ognuno si collegano attestati,
        idoneità e tesserino. Nessun&apos;altra impresa vede questo elenco.
      </p>

      {/* Dati del datore di lavoro: compaiono sul tesserino */}
      <form
        onSubmit={salvaImpresa}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          backgroundColor: datiImpresaIncompleti ? "#fff8e6" : "#fafafa",
          marginBottom: 20,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Dati della mia impresa (datore di lavoro)</h3>
        <p style={{ fontSize: 13, color: "#666", marginTop: 0 }}>
          Compaiono sul tesserino di tutti i tuoi lavoratori. Si inseriscono una volta sola.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <div>
            <label style={stileEtichetta}>Ragione sociale *</label>
            <input
              value={impresa.impresa}
              onChange={(e) => setImpresa({ ...impresa, impresa: e.target.value })}
              style={stileCampo}
            />
          </div>
          <div>
            <label style={stileEtichetta}>Partita IVA / Codice fiscale *</label>
            <input
              value={impresa.partita_iva}
              onChange={(e) => setImpresa({ ...impresa, partita_iva: e.target.value })}
              style={stileCampo}
            />
          </div>
          <div>
            <label style={stileEtichetta}>Sede legale</label>
            <input
              value={impresa.sede_legale}
              onChange={(e) => setImpresa({ ...impresa, sede_legale: e.target.value })}
              style={stileCampo}
            />
          </div>
        </div>
        {erroreImpresa && <p style={{ color: "red", marginBottom: 0 }}>{erroreImpresa}</p>}
        {messaggioImpresa && <p style={{ color: "#16a34a", marginBottom: 0 }}>{messaggioImpresa}</p>}
        <button
          type="submit"
          style={{
            marginTop: 12,
            padding: "8px 18px",
            borderRadius: 6,
            border: "1px solid #1a73e8",
            backgroundColor: "#fff",
            color: "#1a73e8",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Salva dati impresa
        </button>
      </form>

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
            <label style={stileEtichetta}>Tipo di rapporto *</label>
            <select
              value={form.tipo_rapporto}
              onChange={(e) => aggiorna("tipo_rapporto", e.target.value)}
              style={stileCampo}
            >
              <option value="dipendente">Dipendente</option>
              <option value="autonomo">Lavoratore autonomo</option>
            </select>
          </div>
          <div>
            <label style={stileEtichetta}>Nome *</label>
            <input value={form.nome} onChange={(e) => aggiorna("nome", e.target.value)} style={stileCampo} required />
          </div>
          <div>
            <label style={stileEtichetta}>Cognome *</label>
            <input
              value={form.cognome}
              onChange={(e) => aggiorna("cognome", e.target.value)}
              style={stileCampo}
              required
            />
          </div>
          <div>
            <label style={stileEtichetta}>Codice fiscale</label>
            <input
              value={form.codice_fiscale}
              onChange={(e) => aggiorna("codice_fiscale", e.target.value.toUpperCase())}
              style={stileCampo}
              maxLength={20}
            />
          </div>
          <div>
            <label style={stileEtichetta}>Mansione (es. muratore, gruista)</label>
            <input value={form.mansione} onChange={(e) => aggiorna("mansione", e.target.value)} style={stileCampo} />
          </div>

          {!autonomo && (
            <>
              <div>
                <label style={stileEtichetta}>Tipo di contratto</label>
                <select
                  value={form.tipo_contratto}
                  onChange={(e) => aggiorna("tipo_contratto", e.target.value)}
                  style={stileCampo}
                >
                  <option value="">—</option>
                  {CONTRATTI.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={stileEtichetta}>Livello (es. 3° livello)</label>
                <input value={form.livello} onChange={(e) => aggiorna("livello", e.target.value)} style={stileCampo} />
              </div>
              <div>
                <label style={stileEtichetta}>Data di assunzione</label>
                <input
                  type="date"
                  value={form.data_assunzione}
                  onChange={(e) => aggiorna("data_assunzione", e.target.value)}
                  style={stileCampo}
                />
              </div>
            </>
          )}

          {autonomo && (
            <div>
              <label style={stileEtichetta}>Committente *</label>
              <input
                value={form.committente}
                onChange={(e) => aggiorna("committente", e.target.value)}
                style={stileCampo}
              />
            </div>
          )}
        </div>

        {!autonomo && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.in_subappalto}
                onChange={(e) => aggiorna("in_subappalto", e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Il lavoratore opera in subappalto
            </label>
            {form.in_subappalto && (
              <div style={{ marginTop: 8 }}>
                <label style={stileEtichetta}>Estremi dell&apos;autorizzazione al subappalto *</label>
                <input
                  value={form.autorizzazione_subappalto}
                  onChange={(e) => aggiorna("autorizzazione_subappalto", e.target.value)}
                  style={stileCampo}
                  placeholder="es. autorizzazione del 12/03/2026, prot. 123"
                />
              </div>
            )}
          </div>
        )}

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
                  {l.tipo_rapporto === "autonomo" && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#1a73e8" }}>autonomo</span>
                  )}
                  {l.in_subappalto && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#8a5a00" }}>subappalto</span>
                  )}
                  {!l.attivo && <span style={{ marginLeft: 8, fontSize: 12, color: "#c0392b" }}>disattivato</span>}
                </td>
                <td style={{ padding: 8 }}>
                  {l.mansione || "—"}
                  {l.livello && <span style={{ color: "#888", fontSize: 12 }}> · {l.livello}</span>}
                </td>
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
