"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// cm = lato del QR, carta = foglio necessario (misure in mm), t = ingrandimento dei testi
const FORMATI = [
  { cm: 10, carta: "A4", w: 210, h: 297, t: 1 },
  { cm: 18, carta: "A4", w: 210, h: 297, t: 0.8 },
  { cm: 30, carta: "A2", w: 420, h: 594, t: 3 },
  { cm: 50, carta: "A1", w: 594, h: 841, t: 3 },
];
const MARGINE_MM = 10;

export default function PanoramicaCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [azienda, setAzienda] = useState<string>("");
  const [dimensione, setDimensione] = useState<number>(10);

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
  const urlQrGrande = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=10&data=${encodeURIComponent(linkPubblico)}`;

  const formato = FORMATI.find((f) => f.cm === dimensione) || FORMATI[0];
  const larghezzaUtile = formato.w - 2 * MARGINE_MM;
  const altezzaUtile = formato.h - 2 * MARGINE_MM - 2;
  const t = formato.t;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      {/* Regole di stampa: in stampa compare solo il foglio del QR, centrato */}
      <style>{`
        .solo-stampa { display: none; }
        @media print {
          @page { size: ${formato.carta} portrait; margin: ${MARGINE_MM}mm; }
          body * { visibility: hidden !important; }
          .solo-stampa, .solo-stampa * { visibility: visible !important; }
          .solo-stampa {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: fixed;
            left: 0;
            top: 0;
            width: ${larghezzaUtile}mm;
            height: ${altezzaUtile}mm;
            overflow: hidden;
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

        <div style={{ margin: "12px 0" }}>
          <label style={{ fontSize: 14, marginRight: 8 }}>Dimensione del QR:</label>
          <select
            value={dimensione}
            onChange={(e) => setDimensione(Number(e.target.value))}
            style={{ padding: "8px 10px", fontSize: 15, borderRadius: 6, border: "1px solid #bbb" }}
          >
            {FORMATI.map((f) => (
              <option key={f.cm} value={f.cm}>
                {f.cm} × {f.cm} cm (foglio {f.carta})
                {f.cm === 10 ? " – da vicino" : f.cm === 18 ? " – da più lontano" : " – grande formato"}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: "#666", margin: "6px 0 0" }}>
            Per A2 e A1 scegli &quot;Salva come PDF&quot; e portalo in tipografia.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          style={{
            marginTop: 4,
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

      {/* Foglio che viene stampato (invisibile a schermo).
          Nessun link scritto: così il telefono vede solo il QR da scansionare. */}
      <div className="solo-stampa">
        {azienda && (
          <div style={{ fontSize: `${7 * t}mm`, fontWeight: 700, marginBottom: `${2 * t}mm` }}>{azienda}</div>
        )}
        <div style={{ fontSize: `${9 * t}mm`, fontWeight: 700, marginBottom: `${2 * t}mm` }}>{cantiere.nome}</div>
        {cantiere.indirizzo && (
          <div style={{ fontSize: `${5 * t}mm`, marginBottom: `${8 * t}mm` }}>{cantiere.indirizzo}</div>
        )}
        <img
          src={urlQrGrande}
          alt="QR code cantiere"
          style={{
            width: `${dimensione * 10}mm`,
            height: `${dimensione * 10}mm`,
            imageRendering: "pixelated",
          }}
        />
        <div style={{ fontSize: `${6 * t}mm`, fontWeight: 700, marginTop: `${8 * t}mm` }}>
          Inquadra il QR per accedere al cantiere
        </div>
        <div style={{ fontSize: `${4 * t}mm`, marginTop: `${2 * t}mm` }}>
          Registrati o accedi con il tuo smartphone
        </div>
      </div>
    </div>
  );
}
