"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CreaAccountPage() {
  const [form, setForm] = useState({
    nome: "",
    cognome: "",
    impresa: "",
    piva: "",
    codiceFiscale: "",
    indirizzo: "",
    email: "",
    cellulare: "",
  });
  const [consensoPrivacy, setConsensoPrivacy] = useState(false);
  const [consensoAltro, setConsensoAltro] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [invioInCorso, setInvioInCorso] = useState(false);

  function aggiorna(campo: string, valore: string) {
    setForm((f) => ({ ...f, [campo]: valore }));
  }

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!consensoPrivacy) {
      setErrore("Devi accettare il trattamento dei dati personali per proseguire.");
      return;
    }

    setInvioInCorso(true);

    const { error } = await supabase.from("richieste_account").insert({
      nome: form.nome,
      cognome: form.cognome,
      impresa: form.impresa || null,
      piva: form.piva || null,
      codice_fiscale: form.codiceFiscale || null,
      indirizzo: form.indirizzo || null,
      email: form.email,
      cellulare: form.cellulare || null,
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
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500 }}>
        <h1>Richiesta inviata</h1>
        <p>La richiesta di creazione account è stata registrata ed è in attesa di approvazione.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500 }}>
      <h1>Crea Account</h1>
      <p style={{ color: "#666" }}>Compila i dati per richiedere la creazione di un nuovo account, soggetto ad approvazione.</p>

      <form onSubmit={invia}>
        {[
          { campo: "nome", label: "Nome", obbligatorio: true },
          { campo: "cognome", label: "Cognome", obbligatorio: true },
          { campo: "impresa", label: "Impresa" },
          { campo: "piva", label: "P.IVA" },
          { campo: "codiceFiscale", label: "Codice Fiscale" },
          { campo: "indirizzo", label: "Indirizzo" },
          { campo: "email", label: "Email", obbligatorio: true, tipo: "email" },
          { campo: "cellulare", label: "Cellulare" },
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
    </div>
  );
}
