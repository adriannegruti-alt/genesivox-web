"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PanoramicaCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [azienda, setAzienda] = useState<string>("");

  useEffect(() => {
    async function carica() {
      const { data } = await supabase
        .from("cantieri")
        .select("id, nome, indirizzo, qr_token, creato_da")
        .eq("id", cantiereId)
        .single();
      setCantiere(data);

      // Nome azienda = azienda di chi ha creato il cantiere
      if (data?.creato_da) {
        const { data: creatore } = await supabase
          .from("profili")
          .select("impresa")
          .eq("id", data.creato_da)
          .single();
        if (creatore?.impresa) setAzienda(creatore.impresa);
      }
    }
    if (cantiereId) carica();
  }, [cantiereId]);

  if (!cantiere) return <p style={{ padding: 24 }}>Caricamento...</p>;

  const linkPubblico = `https://genesivox-web.vercel.app/c/${cantiere.qr_token}`;
  const urlQrPiccolo = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(linkPubblico)}`;
  const urlQrGrande = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=10&data=${encodeURIComponent(linkPubblico)}`;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      {/* Regole di stampa: in stampa compare solo il foglio del QR */}
      <style>{`
        .solo-stampa { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body * { visibility: hidden !important; }
          .solo-stampa, .solo-stampa * { visibility: visible !important; }
          .solo-stampa {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            text-align: center;
            font-family: sans-serif;
            color: #000;
          }
        }
      `}</style>

      <h1>Panoramica</h1>

      <div style={{ margin: "8px 0 16px" }}>
        {azienda && (
          <p style={{ margin: "4px 0" }}>
            <strong>Azienda:</strong> {azienda}
          </p>
        )}
        <p style={{ margin: "4px 0" }}>
          <strong>Cantiere:</strong> {cantiere.nome}
        </p>
        {cantiere.indirizzo && (
          <p style={{ margin: "4px 0", color: "#666" }}>
            <strong style={{ color: "#000" }}>Indirizzo:</strong> {cantiere.indirizzo}
          </p>
        )}
      </div>

      <div style={{ margin: "16px 0", padding: 16, border: "1px solid #ddd", borderRadius: 8, textAlign: "center" }}>
        <h3>QR-code del cantiere</h3>
        <img src={urlQrPiccolo} alt="QR code cantiere" />
        <p style={{ fontSize: 13, color: "#666", wordBreak: "break-all" }}>{linkPubblico}</p>
        <p style={{ fontSize: 13 }}>
          Stampa questo codice e affiggilo in cantiere. Chi lo scansiona può registrarsi per accedere.
        </p>
        <button
          onClick={() => window.print()}
          style={{
            marginTop: 8,
            padding: "10px 20px",
            fontSize: 15,
            background: "#1a73e8",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          🖨️ Stampa QR
        </button>
      </div>

      {/* Foglio A4 che viene stampato (invisibile a schermo) */}
      <div className="solo-stampa">
        {azienda && <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>{azienda}</div>}
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 6 }}>{cantiere.nome}</div>
        {cantiere.indirizzo && <div style={{ fontSize: 22, marginBottom: 24 }}>{cantiere.indirizzo}</div>}
        <img src={urlQrGrande} alt="QR code cantiere" style={{ width: "120mm", height: "120mm" }} />
        <div style={{ fontSize: 26, fontWeight: 700, marginTop: 24 }}>Inquadra il QR per accedere al cantiere</div>
        <div style={{ fontSize: 18, marginTop: 8 }}>
          Registrati o accedi con il tuo smartphone
        </div>
        <div style={{ fontSize: 12, marginTop: 32, color: "#444", wordBreak: "break-all" }}>{linkPubblico}</div>
      </div>
    </div>
  );
}
