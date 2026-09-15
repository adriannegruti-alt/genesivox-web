"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TipoDocumento = { id: string; nome: string; obbligatorio: boolean };
type Documento = { id: string; tipo_documento: string; nome_file: string | null; storage_path: string; creato_il: string };

export default function DocumentiCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [mioRuolo, setMioRuolo] = useState<string | null>(null);
  const [tipiRichiesti, setTipiRichiesti] = useState<TipoDocumento[]>([]);
  const [documentiCaricati, setDocumentiCaricati] = useState<Documento[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [uploadInCorso, setUploadInCorso] = useState<string | null>(null);

  async function carica() {
    setErrore(null);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: membro } = await supabase
      .from("cantiere_membri")
      .select("ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", userData.user.id)
      .maybeSingle();

    if (!membro) {
      setErrore("Non sei ancora membro approvato di questo cantiere.");
      setCaricamento(false);
      return;
    }
    setMioRuolo(membro.ruolo);

    const { data: tipi } = await supabase
      .from("tipi_documento")
      .select("id, nome, obbligatorio")
      .eq("ruolo", membro.ruolo)
      .order("obbligatorio", { ascending: false });
    setTipiRichiesti(tipi || []);

    const { data: docs } = await supabase
      .from("documenti")
      .select("id, tipo_documento, nome_file, storage_path, creato_il")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", userData.user.id);
    setDocumentiCaricati(docs || []);

    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  async function caricaFile(tipoNome: string, file: File) {
    setUploadInCorso(tipoNome);
    setErrore(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;

    const percorso = `${cantiereId}/${userData.user.id}/${Date.now()}_${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from("documenti-cantieri")
      .upload(percorso, file);

    if (uploadErr) {
      setErrore(uploadErr.message);
      setUploadInCorso(null);
      return;
    }

    const { error: dbErr } = await supabase.from("documenti").insert({
      cantiere_id: cantiereId,
      profilo_id: userData.user.id,
      tipo_documento: tipoNome,
      storage_path: percorso,
      nome_file: file.name,
    });

    if (dbErr) {
      setErrore(dbErr.message);
    }

    setUploadInCorso(null);
    carica();
  }

  async function scaricaFile(storagePath: string, nomeFile: string | null) {
    const { data, error } = await supabase.storage.from("documenti-cantieri").createSignedUrl(storagePath, 60);
    if (error || !data) {
      setErrore("Impossibile aprire il file.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore && !mioRuolo) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Documenti — {cantiere?.nome}</h1>
      <p style={{ color: "#666" }}>Il tuo ruolo in questo cantiere: <strong>{mioRuolo}</strong></p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {tipiRichiesti.map((tipo) => {
        const documento = documentiCaricati.find((d) => d.tipo_documento === tipo.nome);
        return (
          <div
            key={tipo.id}
            style={{
              padding: 12,
              marginBottom: 8,
              border: "1px solid #ddd",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>{tipo.nome}</strong>{" "}
              {tipo.obbligatorio ? (
                <span style={{ color: "#c0392b", fontSize: 12 }}>(obbligatorio)</span>
              ) : (
                <span style={{ color: "#888", fontSize: 12 }}>(condizionale)</span>
              )}
              <div style={{ fontSize: 13, color: documento ? "green" : "#c0392b" }}>
                {documento ? `Caricato: ${documento.nome_file}` : "Mancante"}
              </div>
            </div>
            <div>
              {documento && (
                <button
                  onClick={() => scaricaFile(documento.storage_path, documento.nome_file)}
                  style={{ marginRight: 8, padding: "4px 10px" }}
                >
                  Apri
                </button>
              )}
              <label style={{ padding: "4px 10px", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}>
                {uploadInCorso === tipo.nome ? "Caricamento..." : documento ? "Sostituisci" : "Carica"}
                <input
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) caricaFile(tipo.nome, file);
                  }}
                />
              </label>
            </div>
          </div>
        );
      })}
      {tipiRichiesti.length === 0 && <p>Nessun documento richiesto per il tuo ruolo.</p>}
    </div>
  );
}
