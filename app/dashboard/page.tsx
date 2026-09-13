"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DashboardPage() {
  const [profilo, setProfilo] = useState<any>(null);

  useEffect(() => {
    async function carica() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data } = await supabase
        .from("profili")
        .select("email, ruolo, piani(nome)")
        .eq("id", userData.user.id)
        .single();

      setProfilo(data);
    }
    carica();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>La tua area GENESIVOX</h1>
      {profilo ? (
        <div>
          <p>Email: {profilo.email}</p>
          <p>Ruolo: {profilo.ruolo}</p>
          <p>Piano attivo: {profilo.piani?.nome ?? "—"}</p>
        </div>
      ) : (
        <p>Caricamento profilo...</p>
      )}
      {/* Qui andranno: upload documenti, QR code, notifiche, cantieri assegnati, ecc. */}
    </div>
  );
}
