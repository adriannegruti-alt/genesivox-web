"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ReimpostaPasswordPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [nuovaParola, setNuovaParola] = useState("");
  const [confermaNuovaParola, setConfermaNuovaParola] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggioInCorso, setSalvataggioInCorso] = useState(false);
  const [fatto, setFatto] = useState(false);

  useEffect(() => {
    // Il link ricevuto via email crea automaticamente una sessione temporanea
    // (evento PASSWORD_RECOVERY): aspettiamo che sia pronta prima di mostrare il modulo.
    const { data: listener } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "PASSWORD_RECOVERY") {
        setPronto(true);
      }
    });

    // Se la sessione è già presente (es. pagina ricaricata), mostriamo comunque il modulo.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function salvaNuovaParola(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (nuovaParola.length < 6) {
      setErrore("La password deve avere almeno 6 caratteri.");
      return;
    }
    if (nuovaParola !== confermaNuovaParola) {
      setErrore("Le due password non coincidono.");
      return;
    }

    setSalvataggioInCorso(true);
    const { error } = await supabase.auth.updateUser({ password: nuovaParola });
    setSalvataggioInCorso(false);

    if (error) {
      setErrore(error.message);
      return;
    }

    setFatto(true);
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Scegli una nuova password</h1>

      {!pronto && !fatto && (
        <p style={{ color: "#666", fontSize: 14 }}>
          Apertura del link in corso... Se non succede nulla, assicurati di aver aperto questa
          pagina dal link ricevuto via email.
        </p>
      )}

      {pronto && !fatto && (
        <form onSubmit={salvaNuovaParola}>
          <div style={{ marginBottom: 12 }}>
            <label>Nuova password</label>
            <input
              type="password"
              value={nuovaParola}
              onChange={(e) => setNuovaParola(e.target.value)}
              required
              minLength={6}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Conferma nuova password</label>
            <input
              type="password"
              value={confermaNuovaParola}
              onChange={(e) => setConfermaNuovaParola(e.target.value)}
              required
              minLength={6}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          {errore && <p style={{ color: "red" }}>{errore}</p>}
          <button type="submit" disabled={salvataggioInCorso} style={{ padding: "8px 16px" }}>
            {salvataggioInCorso ? "Salvataggio..." : "Salva nuova password"}
          </button>
        </form>
      )}

      {fatto && (
        <div>
          <p>Password aggiornata. Ora puoi accedere con la nuova password.</p>
          <button onClick={() => router.push("/login")} style={{ padding: "8px 16px" }}>
            Vai al login
          </button>
        </div>
      )}
    </div>
  );
}
