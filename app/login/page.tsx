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

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h1>Accedi a GENESIVOX</h1>
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
      <p style={{ marginTop: 16, fontSize: 14, color: "#666" }}>
        Il primo accesso avviene tramite il link ricevuto via email dopo l'acquisto del piano.
      </p>
    </div>
  );
}
