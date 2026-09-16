"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PanoramicaCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);

  useEffect(() => {
    async function carica() {
      const { data } = await supabase
        .from("cantieri")
        .select("id, nome, indirizzo, qr_token")
        .eq("id", cantiereId)
        .single();
      setCantiere(data);
    }
    if (cantiereId) carica();
  }, [cantiereId]);

  if (!cantiere) return <p style={{ padding: 24 }}>Caricamento...</p>;

  const linkPubblico = `https://genesivox-web.vercel.app/c/${cantiere.qr_token}`;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Panoramica</h1>
      {cantiere.indirizzo && <p style={{ color: "#666" }}>{cantiere.indirizzo}</p>}

      <div style={{ margin: "16px 0", padding: 16, border: "1px solid #ddd", borderRadius: 8, textAlign: "center" }}>
        <h3>QR-code del cantiere</h3>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkPubblico)}`}
          alt="QR code cantiere"
        />
        <p style={{ fontSize: 13, color: "#666", wordBreak: "break-all" }}>{linkPubblico}</p>
        <p style={{ fontSize: 13 }}>Stampa questo codice e affiggilo in cantiere. Chi lo scansiona può registrarsi per accedere.</p>
      </div>
    </div>
  );
}
