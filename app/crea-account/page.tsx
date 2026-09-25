"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const TIPI_ACCOUNT = [
  { value: "committente", label: "Committente", descrizione: "Chi commissiona i lavori e investe nel progetto." },
  { value: "impresa_edile", label: "Impresa edile", descrizione: "Chi gestisce l'esecuzione del cantiere." },
  { value: "entrambi", label: "Entrambi", descrizione: "Sei sia Committente che Impresa edile." },
];

const RUOLI_PROFESSIONISTA = [
  { value: "coordinatore", label: "CSE / CSP", descrizione: "Coordinatore per la sicurezza in fase di progettazione/esecuzione." },
  { value: "rspp", label: "RSPP", descrizione: "Responsabile del Servizio di Prevenzione e Protezione." },
];

export default function CreaAccountPage() {
  const [isLavoratore, setIsLavoratore] = useState(false);
  const [isProfessionista, setIsProfessionista] = useState(false);
  const [tipoAccount, setTipoAccount] = useState("committente");
  const [ruoloProfessionista, setRuoloProfessionista] = useState("coordinatore");

  const [form, setForm] = useState({
    nome: "",
    cognome: "",
    impresa: "",
    attivita: "",
    piva: "",
    codiceFiscale: "",
    indirizzo: "",
    email: "",
    cellulare: "",
    nomeUtente: "",
    parola: "",
    confermaParola: "",
  });
  const [nomeUtenteModificatoAMano, setNomeUtenteModificatoAMano] = useState(false);
  const [consensoPrivacy, setConsensoPrivacy] = useState(false);
  const [consensoAltro, setConsensoAltro] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [lavoratoreCreatoSubito, setLavoratoreCreatoSubito] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [invioInCorso, setInvioInCorso] = useState(false);

  function aggiorna(campo: string, valore: string) {
    setForm((f) => {
      const nuovo = { ...f, [campo]: valore };
      // Auto-compila il nome utente dall'impresa, finché l'utente non lo modifica a mano
      if (campo === "impresa" && !nomeUtenteModificatoAMano) {
        nuovo.nomeUtente = valore;
      }
      if (campo === "nomeUtente") {
        setNomeUtenteModificatoAMano(true);
      }
      return nuovo;
    });
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!consensoPrivacy) {
      setErrore("Devi accettare il trattamento dei dati personali per proseguire.");
      return;
    }

    if (form.parola.length < 6) {
      setErrore("La password deve avere almeno 6 caratteri.");
      return;
    }

    if (form.parola !== form.confermaParola) {
      setErrore("Le due password non coincidono.");
      return;
    }

    setInvioInCorso(true);

    if (isLavoratore) {
      // Lavoratore: account gratuito creato subito, nessuna attesa di approvazione.
      const risposta = await fetch("/api/crea-lavoratore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.parola,
          nome: form.nome,
          cognome: form.cognome,
          nomeUtente: form.nomeUtente || null,
          impresa: form.impresa || null,
          attivita: form.attivita || null,
        }),
      });

      const risultato = await risposta.json();
      setInvioInCorso(false);

      if (!risposta.ok) {
        setErrore(risultato.error || "Impossibile creare l'account.");
        return;
      }

      setLavoratoreCreatoSubito(true);
      setInviato(true);
      return;
    }

    // Impresa/Committente o Professionista tecnico: resta una richiesta soggetta ad approvazione.
    const { error } = await supabase.from("richieste_account").insert({
      nome: form.nome,
      cognome: form.cognome,
      impresa: form.impresa || null,
      attivita: form.attivita || null,
      piva: form.piva || null,
      codice_fiscale: form.codiceFiscale || null,
      indirizzo: form.indirizzo || null,
      email: form.email,
      cellulare: form.cellulare || null,
      nome_utente: form.nomeUtente || form.impresa || null,
      parola: form.parola,
      consenso_privacy: consensoPrivacy,
      consenso_altro: consensoAltro,
      tipo_account: isProfessionista ? null : tipoAccount,
      ruolo_richiesto: isProfessionista ? ruoloProfessionista : null,
    });

    setInvioInCorso(false);

    if (error) {
      setErrore(error.message);
      return;
    }

    setInviato(true);
  }

  if (inviato) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500, margin: "0 auto" }}>
        {lavoratoreCreatoSubito ? (
          <>
            <h1>Account creato</h1>
            <p>Il tuo account è pronto: puoi accedere subito con l'email e la password che hai scelto.</p>
          </>
        ) : (
          <>
            <h1>Richiesta inviata</h1>
            <p>La richiesta di creazione account è stata registrata ed è in attesa di approvazione.</p>
          </>
        )}
        <p style={{ marginTop: 20, fontSize: 14 }}>
          <a href="/login" style={{ color: "#1a73e8" }}>
            {lavoratoreCreatoSubito ? "Vai al login" : "Torna al login"}
          </a>
        </p>
      </div>
    );
  }

  const campiDaMostrare = isLavoratore
    ? [
        { campo: "nome", label: "Nome", obbligatorio: true },
        { campo: "cognome", label: "Cognome", obbligatorio: true },
        { campo: "impresa", label: "Impresa per cui lavori (facoltativo)" },
        { campo: "attivita", label: "Attività (es. idraulico, elettricista, muratore)" },
        { campo: "email", label: "Email", obbligatorio: true, tipo: "email" },
        { campo: "cellulare", label: "Cellulare" },
        { campo: "nomeUtente", label: "Nome utente (modificabile)", obbligatorio: true },
        { campo: "parola", label: "Password", obbligatorio: true, tipo: "password" },
        { campo: "confermaParola", label: "Conferma password", obbligatorio: true, tipo: "password" },
      ]
    : [
        { campo: "nome", label: "Nome", obbligatorio: true },
        { campo: "cognome", label: "Cognome", obbligatorio: true },
        { campo: "impresa", label: "Impresa" },
        { campo: "attivita", label: "Attività (es. idraulico, elettricista, impresa edile)" },
        { campo: "piva", label: "P.IVA" },
        { campo: "codiceFiscale", label: "Codice Fiscale" },
        { campo: "indirizzo", label: "Indirizzo" },
        { campo: "email", label: "Email", obbligatorio: true, tipo: "email" },
        { campo: "cellulare", label: "Cellulare" },
        { campo: "nomeUtente", label: "Nome utente (auto da impresa, modificabile)", obbligatorio: true },
        { campo: "parola", label: "Password", obbligatorio: true, tipo: "password" },
        { campo: "confermaParola", label: "Conferma password", obbligatorio: true, tipo: "password" },
      ];

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500, margin: "0 auto" }}>
      <h1>Crea Account</h1>
      <p style={{ color: "#666" }}>
        {isLavoratore
          ? "Compila i dati per creare subito il tuo account gratuito da lavoratore."
          : "Compila i dati per richiedere la creazione di un nuovo account, soggetto ad approvazione."}
      </p>

      <div
        style={{
          margin: "16px 0",
          padding: 12,
          border: "1px solid #d6e6fb",
          backgroundColor: "#eef4fd",
          borderRadius: 8,
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={isLavoratore}
            onChange={(e) => {
              setIsLavoratore(e.target.checked);
              if (e.target.checked) setIsProfessionista(false);
            }}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong>Sono un lavoratore</strong> — crea subito un account gratuito, senza attesa di
            approvazione. Vedrai solo i cantieri a cui verrai assegnato.
          </span>
        </label>
      </div>

      {!isLavoratore && (
        <div
          style={{
            margin: "16px 0",
            padding: 12,
            border: "1px solid #f6d9a0",
            backgroundColor: "#fff8ec",
            borderRadius: 8,
          }}
        >
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isProfessionista}
              onChange={(e) => setIsProfessionista(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>Sono un professionista tecnico</strong> — RSPP o CSE/CSP, nominato da un
              Committente/Impresa edile su un cantiere. Richiesta soggetta ad approvazione.
            </span>
          </label>

          {isProfessionista && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {RUOLI_PROFESSIONISTA.map((r) => (
                <label
                  key={r.value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: 10,
                    border: ruoloProfessionista === r.value ? "2px solid #1a73e8" : "1px solid #ddd",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    backgroundColor: "#fff",
                  }}
                >
                  <input
                    type="radio"
                    name="ruoloProfessionista"
                    checked={ruoloProfessionista === r.value}
                    onChange={() => setRuoloProfessionista(r.value)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong>{r.label}</strong>
                    <br />
                    <span style={{ color: "#666" }}>{r.descrizione}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={invia}>
        {!isLavoratore && !isProfessionista && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 600 }}>
              Che tipo di account sei?
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TIPI_ACCOUNT.map((t) => (
                <label
                  key={t.value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: 10,
                    border: tipoAccount === t.value ? "2px solid #1a73e8" : "1px solid #ddd",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="radio"
                    name="tipoAccount"
                    checked={tipoAccount === t.value}
                    onChange={() => setTipoAccount(t.value)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    <strong>{t.label}</strong>
                    <br />
                    <span style={{ color: "#666" }}>{t.descrizione}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {campiDaMostrare.map((f) => (
          <div key={f.campo} style={{ marginBottom: 10 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>{f.label}</label>
            <input
              type={f.tipo || "text"}
              value={(form as any)[f.campo]}
              onChange={(e) => aggiorna(f.campo, e.target.value)}
              required={f.obbligatorio}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
        ))}

        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={consensoPrivacy}
              onChange={(e) => setConsensoPrivacy(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Acconsento al trattamento dei dati personali ai sensi del Regolamento (UE) 2016/679 (GDPR). *</span>
          </label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={consensoAltro}
              onChange={(e) => setConsensoAltro(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>Accetto le condizioni generali del servizio.</span>
          </label>
        </div>

        {errore && <p style={{ color: "red" }}>{errore}</p>}

        <button type="submit" disabled={invioInCorso} style={{ padding: "10px 20px" }}>
          {invioInCorso ? "Invio in corso..." : isLavoratore ? "Crea account gratuito" : "Invia richiesta"}
        </button>
      </form>

      <p style={{ marginTop: 20, fontSize: 14 }}>
        Hai già un account?{" "}
        <a href="/login" style={{ color: "#1a73e8" }}>
          Accedi
        </a>
      </p>
    </div>
  );
}
