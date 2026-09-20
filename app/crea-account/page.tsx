"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CreaAccountPage() {
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
        <h1>Richiesta inviata</h1>
        <p>La richiesta di creazione account è stata registrata ed è in attesa di approvazione.</p>
        <p style={{ marginTop: 20, fontSize: 14 }}>
          <a href="/login" style={{ color: "#1a73e8" }}>
            Torna al login
          </a>
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500, margin: "0 auto" }}>
      <h1>Crea Account</h1>
      <p style={{ color: "#666" }}>Compila i dati per richiedere la creazione di un nuovo account, soggetto ad approvazione.</p>

      <form onSubmit={invia}>
        {[
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
        ].map((f) => (
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
          {invioInCorso ? "Invio in corso..." : "Invia richiesta"}
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
