"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { comprimiImmagine, verificaAntivirus } from "@/lib/caricamentoFile";

type Preventivo = {
  id: string;
  profilo_id: string;
  nome_impresa: string | null;
  attivita: string | null;
  referente: string | null;
  storage_path: string;
  nome_file: string | null;
  creato_il: string;
  approvato: boolean;
  approvato_il: string | null;
  profili: { email: string } | null;
};

export default function PreventiviPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [preventivi, setPreventivi] = useState<Preventivo[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [uploadInCorso, setUploadInCorso] = useState(false);
  const [utenteId, setUtenteId] = useState<string | null>(null);

  const [nomeImpresa, setNomeImpresa] = useState("");
  const [attivita, setAttivita] = useState("");
  const [referente, setReferente] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const inputFileRef = useRef<HTMLInputElement>(null);

  const [impreseSuggerite, setImpreseSuggerite] = useState<string[]>([]);
  const [attivitaSuggerite, setAttivitaSuggerite] = useState<string[]>([]);

  async function carica() {
    setErrore(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setCaricamento(false);
      return;
    }
    setUtenteId(userData.user.id);

    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    // Suggerimenti presi dalle persone già assegnate a questo cantiere
    const { data: membri } = await supabase
      .from("cantiere_membri")
      .select("nome_impresa, attivita, profili(impresa)")
      .eq("cantiere_id", cantiereId);

    const imprese = new Set<string>();
    const attivitaTutte = new Set<string>();
    (membri || []).forEach((m: any) => {
      const nomeImp = m.nome_impresa || m.profili?.impresa;
      if (nomeImp) imprese.add(nomeImp);
      if (m.attivita) attivitaTutte.add(m.attivita);
    });
    setImpreseSuggerite(Array.from(imprese).sort());
    setAttivitaSuggerite(Array.from(attivitaTutte).sort());

    const { data: elenco, error: erroreElenco } = await supabase
      .from("preventivi")
      .select(
        "id, profilo_id, nome_impresa, attivita, referente, storage_path, nome_file, creato_il, approvato, approvato_il, profili!preventivi_profilo_id_fkey(email)"
      )
      .eq("cantiere_id", cantiereId)
      .order("creato_il", { ascending: false });

    if (erroreElenco) setErrore(erroreElenco.message);
    setPreventivi((elenco as any) || []);
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!file) {
      setErrore("Seleziona il file del preventivo da caricare.");
      return;
    }
    if (!utenteId) return;

    setUploadInCorso(true);

    const fileDaCaricare = await comprimiImmagine(file);

    const controllo = await verificaAntivirus(fileDaCaricare);
    if (!controllo.pulito) {
      setErrore("Questo file è stato bloccato dal controllo antivirus. Caricamento annullato.");
      setUploadInCorso(false);
      return;
    }

    const percorso = `${cantiereId}/${utenteId}/preventivo_${Date.now()}_${fileDaCaricare.name}`;

    const { error: uploadErr } = await supabase.storage.from("documenti-cantieri").upload(percorso, fileDaCaricare);
    if (uploadErr) {
      setErrore(uploadErr.message);
      setUploadInCorso(false);
      return;
    }

    const { error: dbErr } = await supabase.from("preventivi").insert({
      cantiere_id: cantiereId,
      profilo_id: utenteId,
      nome_impresa: nomeImpresa || null,
      attivita: attivita || null,
      referente: referente || null,
      storage_path: percorso,
      nome_file: fileDaCaricare.name,
    });

    if (dbErr) {
      setErrore(`${dbErr.message} — verifica di essere membro di questo cantiere.`);
      setUploadInCorso(false);
      return;
    }

    setNomeImpresa("");
    setAttivita("");
    setReferente("");
    setFile(null);
    if (inputFileRef.current) inputFileRef.current.value = "";
    setUploadInCorso(false);
    carica();
  }

  async function apriFile(storagePath: string, nomeFile: string | null) {
    const { data, error } = await supabase.storage.from("documenti-cantieri").createSignedUrl(storagePath, 300);
    if (error || !data) {
      setErrore("Impossibile aprire il file.");
      return;
    }

    const finestra = window.open("", "_blank");
    if (!finestra) {
      setErrore("Il browser ha bloccato l'apertura della finestra. Consenti i popup per questo sito.");
      return;
    }

    const estensione = (nomeFile || "").split(".").pop()?.toLowerCase() || "";
    const eImmagine = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(estensione);
    const ePdf = estensione === "pdf";
    const siPuoVisualizzare = eImmagine || ePdf;

    const nomeScaricato = (nomeFile || "preventivo").replace(/"/g, "");

    const contenuto = ePdf
      ? `<embed id="visore" src="${data.signedUrl}" type="application/pdf" />`
      : eImmagine
      ? `<div id="cornice-immagine"><img id="visore-immagine" src="${data.signedUrl}" /></div>`
      : `<div id="non-visualizzabile">
           <p>Questo tipo di file (.${estensione || "sconosciuto"}) non può essere visualizzato direttamente nel browser.</p>
           <a id="scarica-grande" href="${data.signedUrl}" download="${nomeScaricato}">⬇️ Scarica il file per aprirlo</a>
         </div>`;

    finestra.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${nomeFile || "Preventivo"}</title>
          <style>
            html, body { margin: 0; padding: 0; height: 100%; font-family: sans-serif; background: #525659; }
            #barra {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px 16px;
              background: #1a73e8;
            }
            #barra span { color: #fff; font-size: 14px; }
            #barra .azioni { display: flex; gap: 8px; }
            #barra button, #barra a {
              padding: 8px 18px;
              background: #fff;
              color: #1a73e8;
              border: none;
              border-radius: 6px;
              font-weight: 600;
              cursor: pointer;
              font-size: 14px;
              text-decoration: none;
              display: inline-block;
            }
            #visore { width: 100%; height: calc(100% - 46px); border: none; display: block; }
            #cornice-immagine {
              height: calc(100% - 46px);
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: auto;
            }
            #visore-immagine { max-width: 100%; max-height: 100%; background: #fff; }
            #non-visualizzabile {
              height: calc(100% - 46px);
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: #fff;
              text-align: center;
              padding: 24px;
            }
            #scarica-grande { margin-top: 16px; }
            @media print {
              #barra { display: none; }
              #visore, #cornice-immagine { height: 100%; }
              @page { size: A4; margin: 10mm; }
            }
          </style>
        </head>
        <body>
          <div id="barra">
            <span>${nomeFile || "Preventivo"}</span>
            <div class="azioni">
              <a href="${data.signedUrl}" download="${nomeScaricato}">⬇️ Scarica</a>
              ${siPuoVisualizzare ? `<button onclick="window.print()">🖨️ Stampa</button>` : ""}
            </div>
          </div>
          ${contenuto}
        </body>
      </html>
    `);
    finestra.document.close();
  }

  async function approvaPreventivo(p: Preventivo) {
    if (p.approvato) return;
    if (!confirm(`Approvare il preventivo di ${p.nome_impresa || "questa impresa"}?`)) return;

    const { data, error } = await supabase
      .from("preventivi")
      .update({ approvato: true, approvato_il: new Date().toISOString(), approvato_da: utenteId })
      .eq("id", p.id)
      .select("id");

    if (error) {
      setErrore(error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Non hai i permessi per approvare questo preventivo.");
      return;
    }

    // La notifica vera (email) verrà collegata a breve: per ora la richiesta
    // viene solo registrata, l'approvazione nel gestionale è già effettiva.
    try {
      const risposta = await fetch("/api/notifica-approvazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preventivoId: p.id,
          cantiereId,
          nomeImpresa: p.nome_impresa,
          emailImpresa: p.profili?.email,
        }),
      });
      const risultato = await risposta.json();
      if (risultato?.inviata) {
        alert("Preventivo approvato. Notifica inviata all'impresa.");
      } else {
        alert("Preventivo approvato. (L'invio automatico della notifica sarà attivo a breve.)");
      }
    } catch {
      alert("Preventivo approvato. (Non è stato possibile inviare la notifica in questo momento.)");
    }

    carica();
  }

  async function eliminaPreventivo(p: Preventivo) {
    if (!confirm(`Eliminare il preventivo "${p.nome_file}" di ${p.nome_impresa || "—"}? L'operazione non è reversibile.`)) return;

    await supabase.storage.from("documenti-cantieri").remove([p.storage_path]);

    const { data, error } = await supabase.from("preventivi").delete().eq("id", p.id).select("id");

    if (error) {
      setErrore(error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Non hai i permessi per eliminare questo preventivo.");
      return;
    }
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800 }}>
      <h1>Preventivi — {cantiere?.nome}</h1>
      <p style={{ color: "#666", marginBottom: 20 }}>
        Elenco condiviso dei preventivi caricati dalle imprese e subappaltatori assegnati a questo cantiere.
      </p>

      <form
        onSubmit={invia}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "#fafafa",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Carica un nuovo preventivo</h3>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Nome impresa"
            value={nomeImpresa}
            onChange={(e) => setNomeImpresa(e.target.value)}
            list="lista-imprese-suggerite"
            style={{ width: "100%", padding: 8 }}
          />
          <datalist id="lista-imprese-suggerite">
            {impreseSuggerite.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Attività di base"
            value={attivita}
            onChange={(e) => setAttivita(e.target.value)}
            list="lista-attivita-suggerite"
            style={{ width: "100%", padding: 8 }}
          />
          <datalist id="lista-attivita-suggerite">
            {attivitaSuggerite.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Referente"
            value={referente}
            onChange={(e) => setReferente(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <input
            type="file"
            ref={inputFileRef}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ width: "100%" }}
          />
        </div>
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        <button
          type="submit"
          disabled={uploadInCorso}
          style={{
            padding: "10px 20px",
            backgroundColor: "#1a73e8",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {uploadInCorso ? "Caricamento..." : "Carica preventivo"}
        </button>
      </form>

      <h3>Preventivi caricati</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Impresa</th>
            <th style={{ padding: 8 }}>Attività</th>
            <th style={{ padding: 8 }}>Referente</th>
            <th style={{ padding: 8 }}>Caricato il</th>
            <th style={{ padding: 8 }}>Stato</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {preventivi.map((p) => (
            <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{p.nome_impresa || "—"}</td>
              <td style={{ padding: 8 }}>{p.attivita || "—"}</td>
              <td style={{ padding: 8 }}>{p.referente || "—"}</td>
              <td style={{ padding: 8 }}>{new Date(p.creato_il).toLocaleDateString("it-IT")}</td>
              <td style={{ padding: 8 }}>
                {p.approvato ? (
                  <span style={{ color: "#1e7e34", fontWeight: 600 }}>✅ Approvato</span>
                ) : (
                  <span style={{ color: "#999" }}>In attesa</span>
                )}
              </td>
              <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                <button onClick={() => apriFile(p.storage_path, p.nome_file)} style={{ marginRight: 8, padding: "4px 10px" }}>
                  Apri
                </button>
                {!p.approvato && (
                  <button
                    onClick={() => approvaPreventivo(p)}
                    style={{
                      marginRight: 8,
                      padding: "4px 10px",
                      color: "#1e7e34",
                      border: "1px solid #1e7e34",
                      borderRadius: 4,
                      background: "none",
                    }}
                  >
                    Approvato
                  </button>
                )}
                <button
                  onClick={() => eliminaPreventivo(p)}
                  style={{ padding: "4px 10px", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 4, background: "none" }}
                >
                  Elimina
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preventivi.length === 0 && <p>Nessun preventivo caricato ancora.</p>}
    </div>
  );
}
