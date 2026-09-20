"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(false);
  const router = useRouter();

  // Modulo "Password dimenticata?"
  const [mostraRecupero, setMostraRecupero] = useState(false);
  const [emailRecupero, setEmailRecupero] = useState("");
  const [recuperoInviato, setRecuperoInviato] = useState(false);
  const [erroreRecupero, setErroreRecupero] = useState<string | null>(null);
  const [invioRecuperoInCorso, setInvioRecuperoInCorso] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    setCaricamento(false);

    if (error) {
      setErrore(error.message);
      return;
    }

    // Controlla il ruolo per decidere dove mandare l'utente
    const { data: profilo } = await supabase
      .from("profili")
      .select("ruolo")
      .eq("id", data.user.id)
      .single();

    if (profilo?.ruolo === "admin") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  }

  async function handleRecupero(e: React.FormEvent) {
    e.preventDefault();
    setErroreRecupero(null);
    setInvioRecuperoInCorso(true);

    const { error } = await supabase.auth.resetPasswordForEmail(emailRecupero, {
      redirectTo: `${window.location.origin}/reimposta-password`,
    });

    setInvioRecuperoInCorso(false);

    if (error) {
      setErroreRecupero(error.message);
      return;
    }

    setRecuperoInviato(true);
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Accedi a GENESIVOX</h1>

      {!mostraRecupero && (
        <>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 12 }}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            {errore && <p style={{ color: "red" }}>{errore}</p>}
            <button type="submit" disabled={caricamento} style={{ padding: "8px 16px" }}>
              {caricamento ? "Accesso in corso..." : "Accedi"}
            </button>
          </form>

          <p style={{ marginTop: 16, fontSize: 14 }}>
            <button
              type="button"
              onClick={() => {
                setMostraRecupero(true);
                setEmailRecupero(email);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#1a73e8",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 14,
              }}
            >
              Password dimenticata?
            </button>
          </p>

          <p style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
            Il primo accesso avviene tramite il link ricevuto via email dopo l'acquisto del piano.
          </p>

          <p style={{ marginTop: 20, fontSize: 14, borderTop: "1px solid #eee", paddingTop: 16 }}>
            Non hai ancora un account?{" "}
            <a href="/crea-account" style={{ color: "#1a73e8" }}>
              Crea Account
            </a>
          </p>
        </>
      )}

      {mostraRecupero && !recuperoInviato && (
        <div>
          <p style={{ fontSize: 14, color: "#666" }}>
            Inserisci la tua email: ti mandiamo un link per scegliere una nuova password.
          </p>
          <form onSubmit={handleRecupero}>
            <div style={{ marginBottom: 12 }}>
              <label>Email</label>
              <input
                type="email"
                value={emailRecupero}
                onChange={(e) => setEmailRecupero(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            {erroreRecupero && <p style={{ color: "red" }}>{erroreRecupero}</p>}
            <button type="submit" disabled={invioRecuperoInCorso} style={{ padding: "8px 16px" }}>
              {invioRecuperoInCorso ? "Invio in corso..." : "Invia link di recupero"}
            </button>
          </form>
          <p style={{ marginTop: 16, fontSize: 14 }}>
            <button
              type="button"
              onClick={() => setMostraRecupero(false)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: "#1a73e8",
                cursor: "pointer",
                textDecoration: "underline",
                fontSize: 14,
              }}
            >
              Torna al login
            </button>
          </p>
        </div>
      )}

      {mostraRecupero && recuperoInviato && (
        <div>
          <p>
            Ti abbiamo inviato un'email a <strong>{emailRecupero}</strong> con il link per
            reimpostare la password. Controlla anche la cartella spam.
          </p>
          <button
            type="button"
            onClick={() => {
              setMostraRecupero(false);
              setRecuperoInviato(false);
            }}
            style={{ padding: "8px 16px", marginTop: 8 }}
          >
            Torna al login
          </button>
        </div>
      )}
    </div>
  );
}
