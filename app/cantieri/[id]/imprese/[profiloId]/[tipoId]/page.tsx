"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { comprimiImmagine, verificaAntivirus, validaFile, ACCEPT_INPUT_FILE } from "@/lib/caricamentoFile";

type Documento = {
  id: string;
  nome_file: string | null;
  storage_path: string;
  creato_il: string;
};

export default function DettaglioTipoDocumentoMembroPage() {
  const params = useParams();
  const cantiereId = params.id as string;
  const profiloId = params.profiloId as string;
  const tipoId = params.tipoId as string;

  const [tipo, setTipo] = useState<any>(null);
  const [documenti, setDocumenti] = useState<Documento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [uploadInCorso, setUploadInCorso] = useState(false);
  const [esitoAntivirus, setEsitoAntivirus] = useState<string | null>(null);
  const [puoGestire, setPuoGestire] = useState(false);

  async function calcolaPermessi() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    if (uid === profiloId) {
      setPuoGestire(true); // sei il proprietario dei documenti
      return;
    }

    const { data: profiloMio } = await supabase.from("profili").select("ruolo").eq("id", uid).maybeSingle();
    if (profiloMio?.ruolo === "admin") {
      setPuoGestire(true);
      return;
    }

    const { data: cantiere } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
    if (cantiere?.creato_da === uid) {
      setPuoGestire(true);
      return;
    }

    const { data: membro } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", uid)
      .maybeSingle();

    let ruoliMiei: string[] = membro?.ruolo ? [membro.ruolo] : [];
    if (membro) {
      const { data: ruoliExtra } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", membro.id);
      ruoliMiei = ruoliMiei.concat((ruoliExtra || []).map((r) => r.ruolo));
    }

    const autorizzato = ruoliMiei.some((r) => ["committente", "impresa_edile", "rspp"].includes(r));
    setPuoGestire(autorizzato);
  }

  async function carica() {
    setErrore(null);

    const { data: t } = await supabase.from("tipi_documento").select("id, nome, obbligatorio").eq("id", tipoId).single();
    setTipo(t);
    if (!t) {
      setCaricamento(false);
      return;
    }

    const { data: docs } = await supabase
      .from("documenti")
      .select("id, nome_file, storage_path, creato_il")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", profiloId)
      .eq("tipo_documento", t.nome)
      .order("creato_il", { ascending: false });

    setDocumenti(docs || []);
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId && profiloId && tipoId) {
      carica();
      calcolaPermessi();
    }
  }, [cantiereId, profiloId, tipoId]);

  async function caricaFile(file: File) {
    if (!tipo) return;
    setUploadInCorso(true);
    setErrore(null);
    setEsitoAntivirus(null);

    const fileDaCaricare = await comprimiImmagine(file);

    const validazione = validaFile(fileDaCaricare);
    if (!validazione.valido) {
      setErrore(validazione.errore || "File non valido.");
      setUploadInCorso(false);
      return;
    }

    const controllo = await verificaAntivirus(fileDaCaricare);
    if (!controllo.verificato) {
      setErrore("Il controllo antivirus non è disponibile in questo momento. Riprova tra qualche minuto.");
      setUploadInCorso(false);
      return;
    }
    if (!controllo.pulito) {
      setErrore("Questo file è stato bloccato dal controllo antivirus: potrebbe contenere una minaccia.");
      setUploadInCorso(false);
      return;
    }
    setEsitoAntivirus("✅ Controllo antivirus: nessuna minaccia rilevata.");

    const percorso = `${cantiereId}/${profiloId}/${Date.now()}_${fileDaCaricare.name}`;

    const { error: uploadErr } = await supabase.storage.from("documenti-cantieri").upload(percorso, fileDaCaricare);
    if (uploadErr) {
      setErrore(uploadErr.message);
      setUploadInCorso(false);
      return;
    }

    const { error: dbErr } = await supabase.from("documenti").insert({
      cantiere_id: cantiereId,
      profilo_id: profiloId,
      tipo_documento: tipo.nome,
      storage_path: percorso,
      nome_file: fileDaCaricare.name,
    });

    if (dbErr) setErrore(dbErr.message);

    setUploadInCorso(false);
    carica();
  }

  async function apriFile(storagePath: string) {
    const { data, error } = await supabase.storage.from("documenti-cantieri").createSignedUrl(storagePath, 60);
    if (error || !data) {
      setErrore("Impossibile aprire il file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function eliminaFile(documento: Documento) {
    if (!confirm(`Eliminare "${documento.nome_file}"? L'operazione non è reversibile.`)) return;

    await supabase.storage.from("documenti-cantieri").remove([documento.storage_path]);
    const { error } = await supabase.from("documenti").delete().eq("id", documento.id);

    if (error) {
      setErrore(error.message);
      return;
    }
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!tipo) return <p style={{ padding: 24 }}>Documento non trovato.</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <p>
        <Link href={`/cantieri/${cantiereId}/imprese/${profiloId}`}>← Torna ai documenti della persona</Link>
      </p>
      <h1>{tipo.nome}</h1>

      {puoGestire ? (
        <label
          style={{
            display: "inline-block",
            padding: "10px 20px",
            backgroundColor: "#1a73e8",
            color: "#fff",
            borderRadius: 6,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          {uploadInCorso ? "Caricamento..." : "+ Carica nuovo file"}
          <input
            type="file"
            accept={ACCEPT_INPUT_FILE}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) caricaFile(file);
            }}
          />
        </label>
      ) : (
        <p style={{ color: "#666", fontSize: 13, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 6 }}>
          Puoi consultare i file qui sotto, ma non puoi caricarne di nuovi né eliminarli per questa persona.
        </p>
      )}

      {errore && <p style={{ color: "red" }}>{errore}</p>}
      {esitoAntivirus && (
        <p style={{ color: esitoAntivirus.startsWith("✅") ? "#1e7e34" : "#b45309", fontSize: 13 }}>
          {esitoAntivirus}
        </p>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>File</th>
            <th style={{ padding: 8 }}>Caricato il</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {documenti.map((d) => (
            <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{d.nome_file}</td>
              <td style={{ padding: 8 }}>{new Date(d.creato_il).toLocaleDateString("it-IT")}</td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <button onClick={() => apriFile(d.storage_path)} style={{ marginRight: 8, padding: "4px 10px" }}>
                  Apri
                </button>
                {puoGestire && (
                  <button
                    onClick={() => eliminaFile(d)}
                    style={{ padding: "4px 10px", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 4, background: "none" }}
                  >
                    Elimina
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {documenti.length === 0 && <p>Nessun file caricato ancora.</p>}
    </div>
  );
}
