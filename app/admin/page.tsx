"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const RUOLI = [
  "admin",
  "committente",
  "cse_csp",
  "rspp",
  "capocantiere",
  "impresa",
  "lavoratore",
  "asl_ispettorato",
];

const SIGLE_SOCIETARIE = [
  "S\\.?R\\.?L\\.?S\\.?",
  "S\\.?R\\.?L\\.?",
  "S\\.?A\\.?S\\.?",
  "S\\.?N\\.?C\\.?",
  "S\\.?P\\.?A\\.?",
  "S\\.?S\\.?D\\.?",
  "S\\.?S\\.?",
  "S\\.?A\\.?",
  "SOCIETA['’ ]?\\s*COOPERATIVA",
  "SOC\\.?\\s*COOP\\.?",
  "COOPERATIVA",
  "COOP\\.?",
  "DITTA\\s+INDIVIDUALE",
  "IMPRESA\\s+INDIVIDUALE",
];

function generaCodiceAzienda(nomeAzienda: string, dataRiferimento: Date): string {
  let nome = nomeAzienda.toUpperCase();
  nome = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const sigla of SIGLE_SOCIETARIE) {
    const pattern = new RegExp("\\b" + sigla + "\\b", "g");
    nome = nome.replace(pattern, " ");
  }
  nome = nome.replace(/[^A-Z0-9]/g, "");
  if (nome.length > 14) nome = nome.slice(0, 14);
  if (!nome) nome = "AZIENDA";
  const mese = String(dataRiferimento.getMonth() + 1).padStart(2, "0");
  const anno = dataRiferimento.getFullYear();
  return `${nome}${mese}${anno}`;
}

type Piano = { id: string; nome: string };

type Richiesta = {
  id: string;
  nome: string;
  cognome: string;
  impresa: string | null;
  attivita: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  indirizzo: string | null;
  email: string;
  cellulare: string | null;
  nome_utente: string | null;
  parola: string | null;
  stato: string;
  creato_il: string;
};

type Profilo = {
  id: string;
  email: string;
  ruolo: string;
  impresa: string | null;
  nome_utente: string | null;
  codice_azienda: string | null;
  data_abbonamento: string | null;
  piano_id: string | null;
  autorita_controllo: boolean | null;
};

export default function AdminPage() {
  const [caricamento, setCaricamento] = useState(true);
  const [autorizzato, setAutorizzato] = useState(false);
  const [piani, setPiani] = useState<Piano[]>([]);
  const [profili, setProfili] = useState<Profilo[]>([]);
  const [ricerca, setRicerca] = useState("");
  const [salvataggioId, setSalvataggioId] = useState<string | null>(null);
  const [messaggioId, setMessaggioId] = useState<string | null>(null);
  const [richieste, setRichieste] = useState<Richiesta[]>([]);

  async function carica() {
    setCaricamento(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setCaricamento(false);
      return;
    }

    const { data: mioProfilo } = await supabase
      .from("profili")
      .select("ruolo")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (mioProfilo?.ruolo !== "admin") {
      setAutorizzato(false);
      setCaricamento(false);
      return;
    }
    setAutorizzato(true);

    const { data: elencoPiani } = await supabase.from("piani").select("id, nome").order("prezzo_centesimi");
    setPiani(elencoPiani || []);

    const { data: elencoProfili } = await supabase
      .from("profili")
      .select(
        "id, email, ruolo, impresa, nome_utente, codice_azienda, data_abbonamento, piano_id, autorita_controllo"
      )
      .order("email");
    setProfili(elencoProfili || []);

    const { data: elencoRichieste } = await supabase
      .from("richieste_account")
      .select(
        "id, nome, cognome, impresa, attivita, piva, codice_fiscale, indirizzo, email, cellulare, nome_utente, parola, stato, creato_il"
      )
      .eq("stato", "in_attesa")
      .order("creato_il", { ascending: true });
    setRichieste(elencoRichieste || []);

    setCaricamento(false);
  }

  async function aggiornaStatoRichiesta(richiesta: Richiesta, stato: "approvato" | "rifiutato") {
    if (stato === "approvato") {
      // Copia impresa, nome utente e attività nel profilo collegato (trovato per email).
      // Il profilo deve già esistere: l'utente Supabase Auth va creato PRIMA di premere Approvata.
      const { data: profiloEsistente } = await supabase
        .from("profili")
        .select("id")
        .eq("email", richiesta.email)
        .maybeSingle();

      if (!profiloEsistente) {
        alert(
          "Non trovo ancora nessun account con questa email. Crea prima il login su Supabase (Authentication → Add user) con la stessa email, poi riprova ad approvare."
        );
        return;
      }

      const { error: erroreAggiornamento } = await supabase
        .from("profili")
        .update({
          impresa: richiesta.impresa,
          nome_utente: richiesta.nome_utente,
          attivita_base: richiesta.attivita,
        })
        .eq("id", profiloEsistente.id);

      if (erroreAggiornamento) {
        alert("Errore nel copiare i dati sul profilo: " + erroreAggiornamento.message);
        return;
      }
    }

    await supabase.from("richieste_account").update({ stato }).eq("id", richiesta.id);
    setRichieste((prev) => prev.filter((r) => r.id !== richiesta.id));
  }

  useEffect(() => {
    carica();
  }, []);

  function aggiornaCampo(id: string, campo: keyof Profilo, valore: any) {
    setProfili((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valore } : p)));
  }

  async function salvaRiga(profilo: Profilo) {
    setSalvataggioId(profilo.id);
    setMessaggioId(null);

    let codiceAzienda = profilo.codice_azienda;
    if (profilo.impresa && profilo.data_abbonamento) {
      codiceAzienda = generaCodiceAzienda(profilo.impresa, new Date(profilo.data_abbonamento));
    }

    const { error } = await supabase
      .from("profili")
      .update({
        ruolo: profilo.ruolo,
        impresa: profilo.impresa,
        nome_utente: profilo.nome_utente,
        piano_id: profilo.piano_id,
        data_abbonamento: profilo.data_abbonamento,
        autorita_controllo: profilo.autorita_controllo,
        codice_azienda: codiceAzienda,
      })
      .eq("id", profilo.id);

    setSalvataggioId(null);

    if (error) {
      setMessaggioId(`errore:${profilo.id}:${error.message}`);
      return;
    }

    setProfili((prev) => prev.map((p) => (p.id === profilo.id ? { ...p, codice_azienda: codiceAzienda } : p)));
    setMessaggioId(`ok:${profilo.id}`);
  }

  const profiliFiltrati = profili.filter((p) => {
    const testo = ricerca.toLowerCase();
    return (
      p.email?.toLowerCase().includes(testo) ||
      p.impresa?.toLowerCase().includes(testo) ||
      p.nome_utente?.toLowerCase().includes(testo)
    );
  });

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  if (!autorizzato) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Accesso non consentito</h1>
        <p>Questa pagina è riservata agli amministratori.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Amministrazione clienti</h1>

      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>
          Richieste in attesa di approvazione{richieste.length > 0 ? ` (${richieste.length})` : ""}
        </h2>
        <p style={{ color: "#666", fontSize: 13, marginTop: 0 }}>
          Arrivano dalla pagina pubblica "Crea Account". Per attivarle: copia email e password qui
          sotto, crea il login su Supabase (Authentication → Add user) con quegli stessi dati, poi
          premi "Approvata": impresa, nome utente e attività vengono copiati in automatico sul
          profilo appena creato.
        </p>

        {richieste.length === 0 && <p style={{ color: "#8a8f98", fontSize: 13 }}>Nessuna richiesta in attesa.</p>}

        {richieste.map((r) => (
          <div
            key={r.id}
            style={{
              border: "1px solid #e1eafb",
              backgroundColor: "#f7fafe",
              borderRadius: 8,
              padding: 14,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, columnGap: 24 }}>
              <span><strong>Nome:</strong> {r.nome} {r.cognome}</span>
              <span><strong>Email:</strong> {r.email}</span>
              <span><strong>Password:</strong> {r.parola || "—"}</span>
              <span><strong>Impresa:</strong> {r.impresa || "—"}</span>
              <span><strong>Attività:</strong> {r.attivita || "—"}</span>
              <span><strong>Nome utente:</strong> {r.nome_utente || "—"}</span>
              <span><strong>P.IVA:</strong> {r.piva || "—"}</span>
              <span><strong>Cod. fiscale:</strong> {r.codice_fiscale || "—"}</span>
              <span><strong>Indirizzo:</strong> {r.indirizzo || "—"}</span>
              <span><strong>Cellulare:</strong> {r.cellulare || "—"}</span>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                onClick={() => aggiornaStatoRichiesta(r, "approvato")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid #d6e6fb",
                  backgroundColor: "#eef4fd",
                  color: "#1a73e8",
                  cursor: "pointer",
                }}
              >
                Approvata (login già creato)
              </button>
              <button
                onClick={() => aggiornaStatoRichiesta(r, "rifiutato")}
                style={{
                  padding: "6px 14px",
                  borderRadius: 6,
                  border: "1px solid #e4e7ec",
                  backgroundColor: "transparent",
                  color: "#666",
                  cursor: "pointer",
                }}
              >
                Rifiuta
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 17, marginBottom: 4 }}>Account esistenti</h2>
      <p style={{ color: "#666", fontSize: 14 }}>
        Gestisci piano, ruolo, dati azienda e data abbonamento di ogni account. Il codice azienda
        si aggiorna da solo quando salvi, se nome azienda e data abbonamento sono presenti.
      </p>

      <input
        placeholder="Cerca per email o nome azienda..."
        value={ricerca}
        onChange={(e) => setRicerca(e.target.value)}
        style={{ padding: 8, width: "100%", maxWidth: 400, marginBottom: 16, borderRadius: 6, border: "1px solid #d0d5dd" }}
      />

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #e4e7ec" }}>
              <th style={{ padding: 8 }}>Email</th>
              <th style={{ padding: 8 }}>Nome azienda</th>
              <th style={{ padding: 8 }}>Nome utente</th>
              <th style={{ padding: 8 }}>Ruolo</th>
              <th style={{ padding: 8 }}>Piano</th>
              <th style={{ padding: 8 }}>Data abbonamento</th>
              <th style={{ padding: 8 }}>Codice azienda</th>
              <th style={{ padding: 8 }}>Autorità controllo</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {profiliFiltrati.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #eaf1fc" }}>
                <td style={{ padding: 8 }}>{p.email}</td>
                <td style={{ padding: 8 }}>
                  <input
                    value={p.impresa ?? ""}
                    onChange={(e) => aggiornaCampo(p.id, "impresa", e.target.value)}
                    style={{ padding: 6, width: 140, borderRadius: 6, border: "1px solid #d0d5dd" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    value={p.nome_utente ?? ""}
                    onChange={(e) => aggiornaCampo(p.id, "nome_utente", e.target.value)}
                    style={{ padding: 6, width: 120, borderRadius: 6, border: "1px solid #d0d5dd" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <select
                    value={p.ruolo}
                    onChange={(e) => aggiornaCampo(p.id, "ruolo", e.target.value)}
                    style={{ padding: 6, borderRadius: 6, border: "1px solid #d0d5dd" }}
                  >
                    {RUOLI.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <select
                    value={p.piano_id ?? ""}
                    onChange={(e) => aggiornaCampo(p.id, "piano_id", e.target.value || null)}
                    style={{ padding: 6, borderRadius: 6, border: "1px solid #d0d5dd" }}
                  >
                    <option value="">—</option>
                    {piani.map((pi) => (
                      <option key={pi.id} value={pi.id}>
                        {pi.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    type="date"
                    value={p.data_abbonamento ?? ""}
                    onChange={(e) => aggiornaCampo(p.id, "data_abbonamento", e.target.value || null)}
                    style={{ padding: 6, borderRadius: 6, border: "1px solid #d0d5dd" }}
                  />
                </td>
                <td style={{ padding: 8, fontWeight: 600 }}>{p.codice_azienda ?? "—"}</td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!p.autorita_controllo}
                    onChange={(e) => aggiornaCampo(p.id, "autorita_controllo", e.target.checked)}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => salvaRiga(p)}
                    disabled={salvataggioId === p.id}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "1px solid #d6e6fb",
                      backgroundColor: "#eef4fd",
                      color: "#1a73e8",
                      cursor: "pointer",
                    }}
                  >
                    {salvataggioId === p.id ? "..." : "Salva"}
                  </button>
                  {messaggioId === `ok:${p.id}` && <span style={{ color: "green", marginLeft: 6 }}>✓</span>}
                  {messaggioId?.startsWith(`errore:${p.id}`) && (
                    <span style={{ color: "red", marginLeft: 6, fontSize: 12 }}>
                      {messaggioId.split(":").slice(2).join(":")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {profiliFiltrati.length === 0 && <p style={{ color: "#666", marginTop: 16 }}>Nessun account trovato.</p>}
      </div>
    </div>
  );
}
