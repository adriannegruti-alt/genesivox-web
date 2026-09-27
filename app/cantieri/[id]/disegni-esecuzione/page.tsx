"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { supabase } from "@/lib/supabaseClient";
import { comprimiImmagine, verificaAntivirus, validaFile } from "@/lib/caricamentoFile";
import { salvaFileOffline, leggiFileOffline } from "@/lib/cacheOffline";

// Per questa area accettiamo solo PDF o immagini (le immagini vengono
// convertite in PDF automaticamente prima del caricamento).
const ACCEPT_DISEGNI = ".pdf,.jpg,.jpeg,.png,.webp";

type RigaDisegno = {
  id: string;
  cantiere_id: string;
  gruppo_id: string;
  titolo: string;
  versione: number;
  e_ultima: boolean;
  storage_path: string;
  nome_file: string | null;
  creato_il: string;
};

type Gruppo = {
  gruppo_id: string;
  corrente: RigaDisegno;
  storico: RigaDisegno[];
};

async function immagineInPdf(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  if (!file.type.startsWith("image/")) return file; // non dovrebbe succedere, validaFile filtra già

  const bitmap = await createImageBitmap(file);
  const orientamento = bitmap.width >= bitmap.height ? "l" : "p";
  const pdf = new jsPDF({ orientation: orientamento as "l" | "p", unit: "px", format: [bitmap.width, bitmap.height] });

  const dataUrl: string = await new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    resolve(canvas.toDataURL("image/jpeg", 0.85));
  });

  pdf.addImage(dataUrl, "JPEG", 0, 0, bitmap.width, bitmap.height);
  const blob = pdf.output("blob");
  const nomePdf = file.name.replace(/\.[^.]+$/, "") + ".pdf";
  return new File([blob], nomePdf, { type: "application/pdf" });
}

export default function DisegniEsecuzionePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const CHIAVE_RIGHE_LOCALI = `disegni_righe_${cantiereId}`;
  const CHIAVE_PERMESSI_LOCALI = `disegni_permessi_${cantiereId}`;

  const [caricamento, setCaricamento] = useState(true);
  const [puoVedere, setPuoVedere] = useState(false);
  const [puoGestire, setPuoGestire] = useState(false);
  const [righe, setRighe] = useState<RigaDisegno[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [espansi, setEspansi] = useState<Set<string>>(new Set());
  const [modalitaOffline, setModalitaOffline] = useState(false);

  // form nuovo disegno
  const [mostraForm, setMostraForm] = useState(false);
  const [titoloNuovo, setTitoloNuovo] = useState("");
  const [uploadInCorso, setUploadInCorso] = useState(false);

  // form "aggiorna" (nuova versione di un gruppo esistente)
  const [gruppoInAggiornamento, setGruppoInAggiornamento] = useState<string | null>(null);

  // viewer
  const [fileAperto, setFileAperto] = useState<{ url: string; tipo: string; titolo: string; offline: boolean } | null>(null);
  const [zoom, setZoom] = useState(1);

  async function calcolaPermessi() {
    // OFFLINE: usiamo l'ultimo risultato salvato su questo dispositivo,
    // così chi ha già i permessi non li perde solo perché non c'è rete.
    if (!navigator.onLine) {
      const salvato = localStorage.getItem(CHIAVE_PERMESSI_LOCALI);
      if (salvato) {
        const { puoVedere: v, puoGestire: g } = JSON.parse(salvato);
        setPuoVedere(v);
        setPuoGestire(g);
      }
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    const { data: profiloMio } = await supabase.from("profili").select("ruolo").eq("id", uid).maybeSingle();
    if (profiloMio?.ruolo === "admin") {
      setPuoVedere(true);
      setPuoGestire(true);
      localStorage.setItem(CHIAVE_PERMESSI_LOCALI, JSON.stringify({ puoVedere: true, puoGestire: true }));
      return;
    }

    const { data: cantiere } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
    if (cantiere?.creato_da === uid) {
      setPuoVedere(true);
      setPuoGestire(true);
      localStorage.setItem(CHIAVE_PERMESSI_LOCALI, JSON.stringify({ puoVedere: true, puoGestire: true }));
      return;
    }

    const { data: membroMio } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", uid)
      .maybeSingle();

    let ruoliMiei: string[] = membroMio?.ruolo ? [membroMio.ruolo] : [];
    if (membroMio) {
      const { data: ruoliExtraPropri } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", membroMio.id);
      ruoliMiei = ruoliMiei.concat((ruoliExtraPropri || []).map((r) => r.ruolo));
    }

    const gestisce = ruoliMiei.some((r) => ["committente", "impresa_edile", "responsabile_lavori"].includes(r));
    const vede = gestisce || ruoliMiei.some((r) => ["cse_csp", "rspp"].includes(r));

    setPuoGestire(gestisce);
    setPuoVedere(vede);
    localStorage.setItem(CHIAVE_PERMESSI_LOCALI, JSON.stringify({ puoVedere: vede, puoGestire: gestisce }));
  }

  async function carica() {
    // OFFLINE: usiamo l'ultimo elenco salvato su questo dispositivo.
    if (!navigator.onLine) {
      const salvato = localStorage.getItem(CHIAVE_RIGHE_LOCALI);
      setRighe(salvato ? JSON.parse(salvato) : []);
      setModalitaOffline(true);
      setCaricamento(false);
      return;
    }

    setModalitaOffline(false);
    const { data } = await supabase
      .from("disegni_esecuzione")
      .select("id, cantiere_id, gruppo_id, titolo, versione, e_ultima, storage_path, nome_file, creato_il")
      .eq("cantiere_id", cantiereId)
      .order("creato_il", { ascending: false });
    setRighe(data || []);
    if (data) localStorage.setItem(CHIAVE_RIGHE_LOCALI, JSON.stringify(data));
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) {
      calcolaPermessi();
      carica();
    }
  }, [cantiereId]);

  // Raggruppa le righe per gruppo_id: versione corrente + storico, ordinati
  // per data dell'ultimo aggiornamento (il più recente in cima, in verde).
  const gruppi: Gruppo[] = (() => {
    const mappa = new Map<string, RigaDisegno[]>();
    for (const r of righe) {
      if (!mappa.has(r.gruppo_id)) mappa.set(r.gruppo_id, []);
      mappa.get(r.gruppo_id)!.push(r);
    }
    const risultato: Gruppo[] = [];
    Array.from(mappa.entries()).forEach(([gruppo_id, versioni]) => {
      versioni.sort((a, b) => b.versione - a.versione);
      const corrente = versioni.find((v) => v.e_ultima) || versioni[0];
      const storico = versioni.filter((v) => v.id !== corrente.id);
      risultato.push({ gruppo_id, corrente, storico });
    });
    risultato.sort((a, b) => new Date(b.corrente.creato_il).getTime() - new Date(a.corrente.creato_il).getTime());
    return risultato;
  })();

  function toggleEspanso(gruppoId: string) {
    setEspansi((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(gruppoId)) nuovo.delete(gruppoId);
      else nuovo.add(gruppoId);
      return nuovo;
    });
  }

  async function prepaFileEControlli(file: File): Promise<File | null> {
    const validazione = validaFile(file);
    if (!validazione.valido) {
      setErrore(validazione.errore || "File non valido.");
      return null;
    }
    const compressa = await comprimiImmagine(file);
    const controllo = await verificaAntivirus(compressa);
    if (!controllo.verificato) {
      setErrore("Il controllo antivirus non è disponibile in questo momento. Riprova tra qualche minuto.");
      return null;
    }
    if (!controllo.pulito) {
      setErrore("Questo file è stato bloccato dal controllo antivirus: potrebbe contenere una minaccia.");
      return null;
    }
    try {
      return await immagineInPdf(compressa);
    } catch {
      setErrore("Non sono riuscito a convertire l'immagine in PDF. Riprova, oppure carica direttamente un PDF.");
      return null;
    }
  }

  async function caricaNuovoDisegno(file: File) {
    if (!titoloNuovo.trim()) {
      setErrore("Dai un titolo al disegno prima di caricarlo (es. \"Pianta piano terra\").");
      return;
    }
    setErrore(null);
    setUploadInCorso(true);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) { setUploadInCorso(false); return; }

    const finale = await prepaFileEControlli(file);
    if (!finale) { setUploadInCorso(false); return; }

    const gruppoId = crypto.randomUUID();
    const percorso = `${cantiereId}/${gruppoId}/1_${Date.now()}_${finale.name}`;

    const { error: uploadErr } = await supabase.storage.from("disegni-esecuzione").upload(percorso, finale);
    if (uploadErr) { setErrore(uploadErr.message); setUploadInCorso(false); return; }

    const { error: dbErr } = await supabase.from("disegni_esecuzione").insert({
      cantiere_id: cantiereId,
      gruppo_id: gruppoId,
      titolo: titoloNuovo.trim(),
      versione: 1,
      e_ultima: true,
      storage_path: percorso,
      nome_file: finale.name,
      caricato_da: uid,
    });
    if (dbErr) setErrore(dbErr.message);

    setTitoloNuovo("");
    setMostraForm(false);
    setUploadInCorso(false);
    carica();
  }

  async function aggiornaDisegno(gruppo: Gruppo, file: File) {
    setErrore(null);
    setUploadInCorso(true);

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) { setUploadInCorso(false); return; }

    const finale = await prepaFileEControlli(file);
    if (!finale) { setUploadInCorso(false); return; }

    const nuovaVersione = gruppo.corrente.versione + 1;
    const percorso = `${cantiereId}/${gruppo.gruppo_id}/${nuovaVersione}_${Date.now()}_${finale.name}`;

    const { error: uploadErr } = await supabase.storage.from("disegni-esecuzione").upload(percorso, finale);
    if (uploadErr) { setErrore(uploadErr.message); setUploadInCorso(false); return; }

    // Toglie il flag "ultima versione" da quella precedente...
    const { error: aggiornaErr } = await supabase
      .from("disegni_esecuzione")
      .update({ e_ultima: false })
      .eq("id", gruppo.corrente.id);
    if (aggiornaErr) { setErrore(aggiornaErr.message); setUploadInCorso(false); return; }

    // ...e inserisce la nuova come versione corrente.
    const { error: dbErr } = await supabase.from("disegni_esecuzione").insert({
      cantiere_id: cantiereId,
      gruppo_id: gruppo.gruppo_id,
      titolo: gruppo.corrente.titolo,
      versione: nuovaVersione,
      e_ultima: true,
      storage_path: percorso,
      nome_file: finale.name,
      caricato_da: uid,
    });
    if (dbErr) setErrore(dbErr.message);

    setGruppoInAggiornamento(null);
    setUploadInCorso(false);
    carica();
  }

  async function eliminaGruppo(gruppo: Gruppo) {
    if (!confirm(`Eliminare "${gruppo.corrente.titolo}" con tutte le sue versioni? L'operazione non è reversibile.`)) return;

    const tutteLeRighe = [gruppo.corrente, ...gruppo.storico];
    await supabase.storage.from("disegni-esecuzione").remove(tutteLeRighe.map((r) => r.storage_path));
    const { error } = await supabase.from("disegni_esecuzione").delete().eq("gruppo_id", gruppo.gruppo_id);
    if (error) { setErrore(error.message); return; }
    carica();
  }

  async function apriFile(riga: RigaDisegno) {
    setErrore(null);
    setZoom(1);
    const tipo = riga.nome_file?.toLowerCase().endsWith(".pdf") ? "pdf" : "immagine";
    const titolo = `${riga.titolo} (v${riga.versione})`;

    if (!navigator.onLine) {
      // OFFLINE: proviamo a leggere dalla cache locale del dispositivo.
      const blob = await leggiFileOffline(riga.storage_path);
      if (!blob) {
        setErrore(
          "Sei offline e questo disegno non è mai stato aperto con connessione su questo dispositivo: non è disponibile."
        );
        return;
      }
      const urlLocale = URL.createObjectURL(blob);
      setFileAperto({ url: urlLocale, tipo, titolo: `${titolo} — modalità offline`, offline: true });
      return;
    }

    const { data, error } = await supabase.storage.from("disegni-esecuzione").createSignedUrl(riga.storage_path, 120);
    if (error || !data) { setErrore("Impossibile aprire il file."); return; }

    // ONLINE: mostriamo il file dal link diretto del server, il modo più
    // affidabile su tutti i dispositivi (specialmente PDF su telefono).
    setFileAperto({ url: data.signedUrl, tipo, titolo, offline: false });

    // In parallelo, senza bloccare la visualizzazione, scarichiamo una copia
    // e la salviamo in locale per poterla aprire anche offline in futuro.
    fetch(data.signedUrl)
      .then((risposta) => risposta.blob())
      .then((blob) => salvaFileOffline(riga.storage_path, blob))
      .catch(() => {
        // Se il salvataggio in background fallisce, non è un problema ora:
        // semplicemente quel disegno non sarà disponibile offline.
      });
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  if (!puoVedere) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p><Link href={`/cantieri/${cantiereId}`}>← Torna alla Panoramica</Link></p>
        <p style={{ color: "#666", fontSize: 13, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 6 }}>
          {modalitaOffline
            ? "Sei offline e questo dispositivo non ha ancora un permesso salvato per quest'area: collegati almeno una volta con connessione."
            : "Non hai accesso ai Disegni di esecuzione di questo cantiere."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800 }}>
      <p><Link href={`/cantieri/${cantiereId}`}>← Torna alla Panoramica</Link></p>
      <h1>📐 Disegni di esecuzione</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        I disegni possono essere consultati solo qui: apertura a schermo con zoom, nessun download diretto.
        Nota: non è tecnicamente possibile impedire uno screenshot del dispositivo — questa è solo una misura
        per scoraggiare il salvataggio non autorizzato.
      </p>

      {modalitaOffline && (
        <p style={{ fontSize: 13, backgroundColor: "#fff3cd", color: "#8a6d00", padding: 10, borderRadius: 6 }}>
          ⚠ Sei offline: stai vedendo l'elenco salvato in precedenza su questo dispositivo. Solo i disegni già
          aperti almeno una volta con connessione sono consultabili.
        </p>
      )}

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {puoGestire && !modalitaOffline && (
        <div style={{ marginBottom: 20 }}>
          {!mostraForm ? (
            <button
              onClick={() => setMostraForm(true)}
              style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #1a73e8", backgroundColor: "#eef4fd", color: "#1a73e8", cursor: "pointer" }}
            >
              + Nuovo disegno
            </button>
          ) : (
            <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12 }}>
              <input
                placeholder='Titolo del disegno (es. "Pianta piano terra")'
                value={titoloNuovo}
                onChange={(e) => setTitoloNuovo(e.target.value)}
                style={{ padding: 8, width: "100%", maxWidth: 360, marginBottom: 10, borderRadius: 6, border: "1px solid #d0d5dd" }}
              />
              <br />
              <label style={{ display: "inline-block", padding: "8px 16px", backgroundColor: "#1a73e8", color: "#fff", borderRadius: 6, cursor: "pointer" }}>
                {uploadInCorso ? "Caricamento..." : "Scegli file (PDF o immagine)"}
                <input
                  type="file"
                  accept={ACCEPT_DISEGNI}
                  style={{ display: "none" }}
                  disabled={uploadInCorso}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaNuovoDisegno(f); }}
                />
              </label>
              <button onClick={() => { setMostraForm(false); setTitoloNuovo(""); }} style={{ marginLeft: 8, padding: "8px 12px", background: "none", border: "none", color: "#666", cursor: "pointer" }}>
                Annulla
              </button>
            </div>
          )}
        </div>
      )}

      {gruppi.length === 0 && <p style={{ color: "#666" }}>Nessun disegno caricato ancora.</p>}

      {gruppi.map((g, indice) => {
        const eIlPiuRecente = indice === 0;
        const espanso = espansi.has(g.gruppo_id);
        return (
          <div
            key={g.gruppo_id}
            style={{
              border: eIlPiuRecente ? "2px solid #34a853" : "1px solid #e0e0e0",
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
              backgroundColor: eIlPiuRecente ? "#f2fbf4" : "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong>{g.corrente.titolo}</strong>{" "}
                {eIlPiuRecente && (
                  <span style={{ fontSize: 11, color: "#fff", backgroundColor: "#34a853", padding: "2px 8px", borderRadius: 10, marginLeft: 6 }}>
                    ultimo aggiornato
                  </span>
                )}
                <div style={{ fontSize: 12, color: "#666" }}>
                  v{g.corrente.versione} · caricato il {new Date(g.corrente.creato_il).toLocaleDateString("it-IT")}
                  {g.storico.length > 0 && ` · ${g.storico.length} versione${g.storico.length > 1 ? "i" : ""} precedente${g.storico.length > 1 ? "i" : ""}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => apriFile(g.corrente)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #d0d5dd", cursor: "pointer" }}>
                  Apri
                </button>
                {puoGestire && !modalitaOffline && (
                  <>
                    <label style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #1a73e8", color: "#1a73e8", cursor: "pointer" }}>
                      Aggiorna
                      <input
                        type="file"
                        accept={ACCEPT_DISEGNI}
                        style={{ display: "none" }}
                        disabled={uploadInCorso}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) aggiornaDisegno(g, f); }}
                      />
                    </label>
                    <button
                      onClick={() => eliminaGruppo(g)}
                      style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #c0392b", color: "#c0392b", background: "none", cursor: "pointer" }}
                    >
                      Elimina
                    </button>
                  </>
                )}
                {g.storico.length > 0 && (
                  <button onClick={() => toggleEspanso(g.gruppo_id)} style={{ padding: "6px 12px", background: "none", border: "none", color: "#666", cursor: "pointer" }}>
                    {espanso ? "▲ storico" : "▼ storico"}
                  </button>
                )}
              </div>
            </div>

            {espanso && g.storico.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
                {g.storico.map((v) => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13, color: "#666" }}>
                    <span>v{v.versione} · {new Date(v.creato_il).toLocaleDateString("it-IT")}</span>
                    <button onClick={() => apriFile(v)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d0d5dd", cursor: "pointer" }}>
                      Apri
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {fileAperto && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 1000,
            display: "flex", flexDirection: "column", alignItems: "center",
          }}
        >
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12, color: "#fff" }}>
            <strong>{fileAperto.titolo}</strong>
            <div>
              <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} style={{ marginRight: 6, padding: "6px 12px", cursor: "pointer" }}>−</button>
              <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} style={{ marginRight: 12, padding: "6px 12px", cursor: "pointer" }}>+</button>
              <button
                onClick={() => {
                  if (fileAperto.url.startsWith("blob:")) URL.revokeObjectURL(fileAperto.url);
                  setFileAperto(null);
                }}
                style={{ padding: "6px 12px", cursor: "pointer" }}
              >
                ✕ Chiudi
              </button>
            </div>
          </div>
          <div style={{ flex: 1, width: "100%", overflow: "auto", display: "flex", justifyContent: "center", padding: 20 }}>
            {fileAperto.tipo === "pdf" ? (
              <iframe
                src={fileAperto.url}
                style={{ width: `${90 * zoom}%`, height: "85vh", border: "none", backgroundColor: "#fff" }}
              />
            ) : (
              <img
                src={fileAperto.url}
                onDragStart={(e) => e.preventDefault()}
                style={{ maxWidth: "none", height: `${85 * zoom}vh`, userSelect: "none" }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
