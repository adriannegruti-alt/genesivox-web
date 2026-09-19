"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Sigle societarie italiane da togliere dal nome azienda quando si genera
// il codice azienda (es. "Costruzioni Rossi S.r.l." -> "COSTRUZIONIROSSI")
const SIGLE_SOCIETARIE = [
  "S\\.?R\\.?L\\.?S\\.?",
  "S\\.?R\\.?L\\.?",
  "S\\.?A\\.?S\\.?",
  "S\\.?N\\.?C\\.?",
  "S\\.?P\\.?A\\.?",
  "S\\.?S\\.?D\\.?",
  "S\\.?S\\.?",
  "S\\.?A\\.?",
  "SOCIETA['’ ]?\\s*COOPERATIVA",
  "SOC\\.?\\s*COOP\\.?",
  "COOPERATIVA",
  "COOP\\.?",
  "DITTA\\s+INDIVIDUALE",
  "IMPRESA\\s+INDIVIDUALE",
];

function generaCodiceAzienda(nomeAzienda: string, dataRiferimento: Date): string {
  let nome = nomeAzienda.toUpperCase();

  // toglie accenti (es. "città" -> "citta")
  nome = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");

  // toglie le sigle societarie (come parole intere)
  for (const sigla of SIGLE_SOCIETARIE) {
    const pattern = new RegExp("\\b" + sigla + "\\b", "g");
    nome = nome.replace(pattern, " ");
  }

  // tiene solo lettere e numeri
  nome = nome.replace(/[^A-Z0-9]/g, "");

  // accorcia se troppo lungo, cosi' il codice resta leggibile
  if (nome.length > 14) nome = nome.slice(0, 14);
  if (!nome) nome = "AZIENDA";

  const mese = String(dataRiferimento.getMonth() + 1).padStart(2, "0");
  const anno = dataRiferimento.getFullYear();

  return `${nome}${mese}${anno}`;
}

export default function DashboardPage() {
  const [profilo, setProfilo] = useState<any>(null);
  const [caricamento, setCaricamento] = useState(true);

  async function carica() {
    setCaricamento(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setCaricamento(false);
      return;
    }

    const { data } = await supabase
      .from("profili")
      .select("email, ruolo, impresa, nome_utente, codice_azienda, data_abbonamento, piani(nome)")
      .eq("id", userData.user.id)
      .single();

    setProfilo(data);
    setCaricamento(false);

    // Se abbiamo sia il nome azienda che la data abbonamento, il codice
    // azienda si genera/aggiorna da solo, in automatico.
    if (data && data.impresa && data.data_abbonamento) {
      const dataRiferimento = new Date(data.data_abbonamento);
      const codiceCalcolato = generaCodiceAzienda(data.impresa, dataRiferimento);

      if (codiceCalcolato !== data.codice_azienda) {
        const { error } = await supabase
          .from("profili")
          .update({ codice_azienda: codiceCalcolato })
          .eq("id", userData.user.id);

        if (!error) {
          setProfilo((prev: any) => ({ ...prev, codice_azienda: codiceCalcolato }));
        }
      }
    }
  }

  useEffect(() => {
    carica();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>La tua area GENESIVOX</h1>
      {caricamento && <p>Caricamento profilo...</p>}
      {!caricamento && profilo && (
        <div style={{ maxWidth: 480 }}>
          <p>Email: {profilo.email}</p>
          <p>Ruolo: {profilo.ruolo}</p>
          <p>Nome azienda: {profilo.impresa || "—"}</p>
          <p>Nome utente: {profilo.nome_utente || "—"}</p>
          <p>Codice azienda: {profilo.codice_azienda ? <strong>{profilo.codice_azienda}</strong> : "—"}</p>
          <p>Piano attivo: {profilo.piani?.nome ?? "—"}</p>
        </div>
      )}
      {!caricamento && !profilo && <p>Impossibile caricare il profilo.</p>}
      {/* Qui andranno: upload documenti, QR code, notifiche, cantieri assegnati, ecc. */}
    </div>
  );
}
