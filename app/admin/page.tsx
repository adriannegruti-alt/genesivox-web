"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profilo = {
  id: string;
  email: string;
  ruolo: string;
  attivo: boolean;
  creato_il: string;
  piani: { nome: string } | null;
};

export default function AdminPage() {
  const [utenti, setUtenti] = useState<Profilo[]>([]);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    async function carica() {
      const { data, error } = await supabase
        .from("profili")
        .select("id, email, ruolo, attivo, creato_il, piani(nome)")
        .order("creato_il", { ascending: false });

      if (!error && data) setUtenti(data as unknown as Profilo[]);
      setCaricamento(false);
    }
    carica();
  }, []);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Dashboard Admin — Utenti</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Ruolo</th>
            <th style={{ padding: 8 }}>Piano</th>
            <th style={{ padding: 8 }}>Attivo</th>
            <th style={{ padding: 8 }}>Registrato il</th>
          </tr>
        </thead>
        <tbody>
          {utenti.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{u.email}</td>
              <td style={{ padding: 8 }}>{u.ruolo}</td>
              <td style={{ padding: 8 }}>{u.piani?.nome ?? "—"}</td>
              <td style={{ padding: 8 }}>{u.attivo ? "Sì" : "No"}</td>
              <td style={{ padding: 8 }}>
                {new Date(u.creato_il).toLocaleDateString("it-IT")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {utenti.length === 0 && <p>Nessun utente ancora registrato.</p>}
    </div>
  );
}
