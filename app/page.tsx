"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function PanoramicaPage() {
  const [utente, setUtente] = useState<{ email: string } | null>(null);
  const [numeroCantieri, setNumeroCantieri] = useState<number | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    async function carica() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setCaricamento(false);
        return;
      }
      setUtente({ email: userData.user.email ?? "" });

      const { count } = await supabase.from("cantieri").select("id", { count: "exact", head: true });
      setNumeroCantieri(count ?? 0);
      setCaricamento(false);
    }
    carica();
  }, []);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Panoramica</h1>
      {utente ? (
        <>
          <p style={{ color: "#666" }}>Bentornato, {utente.email}.</p>
          <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginTop: 16 }}>
            <strong style={{ fontSize: 24 }}>{numeroCantieri}</strong>
            <div style={{ color: "#666" }}>cantieri attivi</div>
          </div>
          <p style={{ marginTop: 20 }}>
            <Link href="/cantieri" style={{ color: "#1a73e8" }}>
              Vai a "I miei cantieri" →
            </Link>
          </p>
        </>
      ) : (
        <p>
          <Link href="/login">Accedi</Link> per vedere la tua panoramica.
        </p>
      )}
    </div>
  );
}
