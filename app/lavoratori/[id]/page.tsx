"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabaseClient";

const SITO = "https://genesivox-web.vercel.app";

type Lavoratore = {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  data_assunzione: string | null;
  foto_path: string | null;
  qr_token: string;
  attivo: boolean;
};

// Ritaglia la foto in formato tessera (4:5) e la rimpicciolisce: pesa poco e
// non conserviamo l'immagine originale ad alta risoluzione.
function preparaFoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const W = 360;
      const H = 450;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Immagine non supportata."));
        return;
      }
      const rapporto = W / H;
      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;
      if (sw / sh > rapporto) {
        const nuovaLarghezza = sh * rapporto;
        sx = (sw - nuovaLarghezza) / 2;
        sw = nuovaLarghezza;
      } else {
        const nuovaAltezza = sw / rapporto;
        sy = (sh - nuovaAltezza) / 2;
        sh = nuovaAltezza;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Non riesco a preparare la foto."))),
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Non riesco a leggere la foto."));
    };
    img.src = url;
  });
}

export default function TesserinoPage() {
  const params = useParams();
  const lavoratoreId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [lavoratore, setLavoratore] = useState<Lavoratore | null>(null);
  const [impresa, setImpresa] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [inCaricamentoFoto, setInCaricamentoFoto] = useState(false);

  async function carica() {
    const { data: u } = await supabase.auth.getUser();
    setUserId(u?.user?.id ?? null);
    if (!u?.user) {
      setCaricamento(false);
      return;
    }

    const { data: l, error } = await supabase
      .from("lavoratori")
      .select("id, nome, cognome, mansione, data_assunzione, foto_path, qr_token, attivo")
      .eq("id", lavoratoreId)
      .maybeSingle();

    if (error || !l) {
      setErrore(error?.message ?? "Lavoratore non trovato.");
      setCaricamento(false);
      return;
    }
    setLavoratore(l);

    const { data: profilo } = await supabase
      .from("profili")
      .select("impresa, nome_utente")
      .eq("id", u.user.id)
      .maybeSingle();
    setImpresa(profilo?.impresa || profilo?.nome_utente || "");

    // QR: contiene solo il codice casuale del tesserino, nessun dato personale
    const qr = await QRCode.toDataURL(`${SITO}/t/${l.qr_token}`, {
      margin: 1,
      width: 400,
      errorCorrectionLevel: "M",
    });
    setQrUrl(qr);

    if (l.foto_path) {
      const { data: firmato } = await supabase.storage.from("foto-lavoratori").createSignedUrl(l.foto_path, 3600);
      setFotoUrl(firmato?.signedUrl ?? null);
    } else {
      setFotoUrl(null);
    }

    setCaricamento(false);
  }

  useEffect(() => {
    if (lavoratoreId) carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lavoratoreId]);

  async function caricaFoto(file: File | undefined) {
    if (!file || !lavoratore || !userId) return;
    setErrore(null);
    setMessaggio(null);
    setInCaricamentoFoto(true);
    try {
      const blob = await preparaFoto(file);
      const percorso = `${userId}/${lavoratore.id}.jpg`;
      const { error: erroreUpload } = await supabase.storage
        .from("foto-lavoratori")
        .upload(percorso, blob, { upsert: true, contentType: "image/jpeg" });
      if (erroreUpload) throw new Error(erroreUpload.message);

      const { error: erroreAggiorna } = await supabase
        .from("lavoratori")
        .update({ foto_path: percorso })
        .eq("id", lavoratore.id);
      if (erroreAggiorna) throw new Error(erroreAggiorna.message);

      setMessaggio("Foto salvata.");
      await carica();
    } catch (e: any) {
      setErrore(e?.message || "Non è stato possibile salvare la foto.");
    }
    setInCaricamentoFoto(false);
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!userId) return <p style={{ padding: 24 }}>Devi accedere per vedere il tesserino.</p>;
  if (!lavoratore) return <p style={{ padding: 24, color: "red" }}>{errore ?? "Lavoratore non trovato."}</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body * { visibility: hidden !important; }
          .tesserino-stampa, .tesserino-stampa * { visibility: visible !important; }
          .tesserino-stampa {
            position: fixed !important;
            left: 0;
            top: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <p style={{ margin: "0 0 8px" }}>
        <Link href="/lavoratori" style={{ color: "#1a73e8", textDecoration: "none" }}>
          ← Torna all&apos;elenco
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>
        Tesserino di {lavoratore.nome} {lavoratore.cognome}
      </h1>

      {!lavoratore.attivo && (
        <p style={{ color: "#c0392b" }}>Questo lavoratore è disattivato: riattivalo prima di stampare il tesserino.</p>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 14, display: "block", marginBottom: 6 }}>
          {fotoUrl ? "Cambia la foto" : "Carica la foto"} (puoi scattarla con il telefono):
        </label>
        <input
          type="file"
          accept="image/*"
          disabled={inCaricamentoFoto}
          onChange={(e) => caricaFoto(e.target.files?.[0])}
        />
        {inCaricamentoFoto && <p style={{ fontSize: 13, color: "#666" }}>Caricamento della foto...</p>}
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        {messaggio && <p style={{ color: "#16a34a" }}>{messaggio}</p>}
      </div>

      {/* Il tesserino, a misura reale (formato carta di credito 85,6 x 54 mm) */}
      <div
        className="tesserino-stampa"
        style={{
          width: "85.6mm",
          height: "54mm",
          border: "0.3mm solid #1a73e8",
          borderRadius: "3mm",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#fff",
          color: "#000",
          fontFamily: "sans-serif",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            height: "8mm",
            backgroundColor: "#1a73e8",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 3mm",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: "3.2mm", fontWeight: 700 }}>TESSERINO DI CANTIERE</span>
          <span style={{ fontSize: "2.6mm", fontWeight: 700 }}>GENESIVOX</span>
        </div>

        <div style={{ flex: 1, display: "flex", gap: "2.5mm", padding: "2.5mm", minHeight: 0 }}>
          <div
            style={{
              width: "24mm",
              height: "30mm",
              flexShrink: 0,
              backgroundColor: "#eee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "3mm",
              color: "#888",
              overflow: "hidden",
            }}
          >
            {fotoUrl ? (
              <img src={fotoUrl} alt="Foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "FOTO"
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.8mm" }}>
            <div style={{ fontSize: "4.2mm", fontWeight: 700, textTransform: "uppercase", lineHeight: 1.1 }}>
              {lavoratore.cognome}
            </div>
            <div style={{ fontSize: "3.6mm", lineHeight: 1.1 }}>{lavoratore.nome}</div>
            {lavoratore.mansione && (
              <div style={{ fontSize: "3mm", color: "#333", lineHeight: 1.1 }}>{lavoratore.mansione}</div>
            )}
            <div style={{ marginTop: "1.5mm", fontSize: "2.2mm", color: "#666" }}>Datore di lavoro</div>
            <div style={{ fontSize: "3mm", fontWeight: 700, lineHeight: 1.1 }}>{impresa || "—"}</div>
            {lavoratore.data_assunzione && (
              <div style={{ fontSize: "2.6mm", color: "#333" }}>
                Assunto il {new Date(lavoratore.data_assunzione).toLocaleDateString("it-IT")}
              </div>
            )}
          </div>

          <div
            style={{
              width: "20mm",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            {qrUrl && <img src={qrUrl} alt="QR" style={{ width: "20mm", height: "20mm" }} />}
            <div style={{ fontSize: "2mm", color: "#666" }}>Scansiona per verificare</div>
          </div>
        </div>
      </div>

      <button
        onClick={() => window.print()}
        disabled={!lavoratore.attivo}
        style={{
          marginTop: 20,
          padding: "10px 22px",
          fontSize: 15,
          backgroundColor: "#1a73e8",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: lavoratore.attivo ? "pointer" : "not-allowed",
          opacity: lavoratore.attivo ? 1 : 0.5,
        }}
      >
        🖨️ Stampa tesserino
      </button>
      <p style={{ fontSize: 12, color: "#777" }}>
        Si stampa a misura reale (formato carta di credito) in alto sul foglio A4: poi si ritaglia e si plastifica.
      </p>
    </div>
  );
}
