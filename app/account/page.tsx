"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [impresa, setImpresa] = useState("");
  const [nomeUtente, setNomeUtente] = useState("");
  const [caricamento, setCaricamento] = useState(true);

  const [nuovaParola, setNuovaParola] = useState("");
  const [confermaNuovaParola, setConfermaNuovaParola] = useState("");

  const [messaggioProfilo, setMessaggioProfilo] = useState<string | null>(null);
  const [erroreProfilo, setErroreProfilo] = useState<string | null>(null);
  const [messaggioParola, setMessaggioParola] = useState<string | null>(null);
  const [erroreParola, setErroreParola] = useState<string | null>(null);

  async function carica() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setCaricamento(false);
      return;
    }
    setEmail(userData.user.email ?? "");

    const { data: profilo } = await supabase
      .from("profili")
      .select("impresa, nome_utente")
      .eq("id", userData.user.id)
      .maybeSingle();

    setImpresa(profilo?.impresa ?? "");
    setNomeUtente(profilo?.nome_utente ?? "");
    setCaricamento(false);
  }

  useEffect(() => {
    carica();
  }, []);

  async function salvaProfilo(e: React.FormEvent) {
    e.preventDefault();
    setErroreProfilo(null);
    setMessaggioProfilo(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { error } = await supabase
      .from("profili")
      .update({ impresa, nome_utente: nomeUtente })
      .eq("id", userData.user.id);

    if (error) {
      setErroreProfilo(error.message);
      return;
    }
    setMessaggioProfilo("Dati salvati.");
  }

  async function cambiaPassword(e: React.FormEvent) {
    e.preventDefault();
    setErroreParola(null);
    setMessaggioParola(null);

    if (nuovaParola.length < 6) {
      setErroreParola("La password deve avere almeno 6 caratteri.");
      return;
    }
    if (nuovaParola !== confermaNuovaParola) {
      setErroreParola("Le due password non coincidono.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nuovaParola });

    if (error) {
      setErroreParola(error.message);
      return;
    }

    setMessaggioParola("Password aggiornata.");
    setNuovaParola("");
    setConfermaNuovaParola("");
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 500 }}>
      <h1>Impostazioni account</h1>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Dati account</h3>
        <p style={{ fontSize: 13, color: "#666" }}>Email: {email}</p>
        <form onSubmit={salvaProfilo}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Nome azienda</label>
            <input value={impresa} onChange={(e) => setImpresa(e.target.value)} style={{ width: "100%", padding: 8 }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Nome utente</label>
            <input value={nomeUtente} onChange={(e) => setNomeUtente(e.target.value)} style={{ width: "100%", padding: 8 }} />
          </div>
          {erroreProfilo && <p style={{ color: "red" }}>{erroreProfilo}</p>}
          {messaggioProfilo && <p style={{ color: "green" }}>{messaggioProfilo}</p>}
          <button type="submit" style={{ padding: "8px 16px" }}>Salva</button>
        </form>
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Cambia password</h3>
        <form onSubmit={cambiaPassword}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Nuova password</label>
            <input
              type="password"
              value={nuovaParola}
              onChange={(e) => setNuovaParola(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>Conferma nuova password</label>
            <input
              type="password"
              value={confermaNuovaParola}
              onChange={(e) => setConfermaNuovaParola(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          {erroreParola && <p style={{ color: "red" }}>{erroreParola}</p>}
          {messaggioParola && <p style={{ color: "green" }}>{messaggioParola}</p>}
          <button type="submit" style={{ padding: "8px 16px" }}>Aggiorna password</button>
        </form>
      </div>

      <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Abbonamento</h3>
        <p style={{ fontSize: 13, color: "#666" }}>Per rinnovare o modificare il tuo piano, contattaci.</p>
        <a
          href="mailto:info@genesivox.com?subject=Rinnovo abbonamento"
          style={{
            display: "inline-block",
            padding: "8px 16px",
            backgroundColor: "#1a73e8",
            color: "#fff",
            borderRadius: 6,
            textDecoration: "none",
          }}
        >
          Rinnova il mio abbonamento
        </a>
      </div>
    </div>
  );
}
