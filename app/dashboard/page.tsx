"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function giorniTra(da: string, a: string): number {
  const [y1, m1, d1] = da.split("-").map(Number);
  const [y2, m2, d2] = a.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function formatData(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

const GIORNI_PREAVVISO = 60;

type Scadenza = { id: string; tipo: string; data_scadenza: string; nome: string; cognome: string; giorni: number };

const cardStile: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e4e7ec",
  borderRadius: 12,
  padding: "14px 16px",
  textDecoration: "none",
  color: "#3c4149",
  display: "block",
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
};

function Card(props: { titolo: string; valore: string | number; nota?: string; colore?: string; href?: string }) {
  const contenuto = (
    <>
      <div style={{ fontSize: 13, color: "#667085" }}>{props.titolo}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: props.colore || "#1a3c6e", lineHeight: 1.2, marginTop: 4 }}>
        {props.valore}
      </div>
      {props.nota && <div style={{ fontSize: 12, color: "#667085", marginTop: 2 }}>{props.nota}</div>}
    </>
  );
  return props.href ? (
    <Link href={props.href} style={cardStile}>
      {contenuto}
    </Link>
  ) : (
    <div style={cardStile}>{contenuto}</div>
  );
}

export default function DashboardPage() {
  const [profilo, setProfilo] = useState<any>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [cantieriAttivi, setCantieriAttivi] = useState<number | null>(null);
  const [presentiOggi, setPresentiOggi] = useState<number | null>(null);
  const [lavoratoriAttivi, setLavoratoriAttivi] = useState<number | null>(null);
  const [scadenze, setScadenze] = useState<Scadenza[]>([]);

  async function carica() {
    setCaricamento(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setCaricamento(false);
      return;
    }

    const { data } = await supabase
      .from("profili")
      .select("email, ruolo, impresa, nome_utente, codice_azienda, data_abbonamento, autorita_controllo, prova_scade_il, piani(nome)")
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

    // ---- Riepilogo (ogni pezzo è indipendente: se uno fallisce gli altri restano) ----
    const oggi = oggiRoma();

    const { count: nCantieri } = await supabase
      .from("cantieri")
      .select("id", { count: "exact", head: true })
      .eq("archiviato", false);
    setCantieriAttivi(nCantieri ?? 0);

    const { count: nPresenti, error: errPres } = await supabase
      .from("presenze")
      .select("id", { count: "exact", head: true })
      .eq("data", oggi)
      .is("ora_uscita", null);
    setPresentiOggi(errPres ? null : nPresenti ?? 0);

    const { count: nLav, error: errLav } = await supabase
      .from("lavoratori")
      .select("id", { count: "exact", head: true })
      .eq("attivo", true);
    setLavoratoriAttivi(errLav ? null : nLav ?? 0);

    const { data: docs } = await supabase
      .from("documenti_lavoratore")
      .select("id, tipo, data_scadenza, lavoratori(nome, cognome, attivo)")
      .not("data_scadenza", "is", null)
      .order("data_scadenza", { ascending: true });
    const elenco: Scadenza[] = (docs || [])
      .filter((d: any) => d.lavoratori && d.lavoratori.attivo !== false)
      .map((d: any) => ({
        id: d.id,
        tipo: d.tipo,
        data_scadenza: d.data_scadenza,
        nome: d.lavoratori.nome,
        cognome: d.lavoratori.cognome,
        giorni: giorniTra(oggi, d.data_scadenza),
      }))
      .filter((d: Scadenza) => d.giorni <= GIORNI_PREAVVISO);
    setScadenze(elenco);
  }

  useEffect(() => {
    carica();
  }, []);

  const oggi = oggiRoma();
  const scaduti = scadenze.filter((s) => s.giorni < 0).length;
  const inScadenza = scadenze.filter((s) => s.giorni >= 0).length;
  const mostraPersonale = profilo && !profilo.autorita_controllo && profilo.ruolo !== "lavoratore";
  const giorniProva =
    profilo?.prova_scade_il && !profilo?.data_abbonamento ? giorniTra(oggi, String(profilo.prova_scade_il).slice(0, 10)) : null;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>
        {profilo?.impresa ? `Ciao, ${profilo.impresa}` : "La tua area GENESIVOX"}
      </h1>
      <p style={{ marginTop: 0, color: "#667085" }}>Cosa richiede la tua attenzione oggi.</p>

      {caricamento && <p>Caricamento...</p>}
      {!caricamento && !profilo && <p>Impossibile caricare il profilo.</p>}

      {!caricamento && profilo && (
        <>
          {giorniProva !== null && giorniProva >= 0 && giorniProva <= 10 && (
            <div style={{ background: "#fff7e0", border: "1px solid #ffd666", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
              La tua prova gratuita scade tra {giorniProva} {giorniProva === 1 ? "giorno" : "giorni"}. Scrivici a{" "}
              <a href="mailto:info@genesivox.com">info@genesivox.com</a> per continuare.
            </div>
          )}

          {cantieriAttivi === 0 ? (
            <div style={{ ...cardStile, textAlign: "center", padding: 28 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a3c6e" }}>Inizia dal tuo primo cantiere</div>
              <p style={{ color: "#667085" }}>
                Crea il cantiere, indica cosa c&apos;è dentro e stampa il QR-code per le presenze.
              </p>
              <Link
                href="/cantieri"
                style={{ background: "#1a73e8", color: "#fff", padding: "9px 18px", borderRadius: 8, textDecoration: "none", display: "inline-block" }}
              >
                Crea il primo cantiere
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <Card titolo="Cantieri attivi" valore={cantieriAttivi ?? "—"} href="/cantieri" />
              <Card
                titolo="Presenti in cantiere ora"
                valore={presentiOggi ?? "—"}
                nota={presentiOggi === 0 ? "Nessun ingresso registrato oggi" : "Ingressi di oggi senza uscita"}
              />
              {mostraPersonale && (
                <>
                  <Card titolo="Lavoratori attivi" valore={lavoratoriAttivi ?? "—"} href="/lavoratori" />
                  <Card
                    titolo="Documenti scaduti"
                    valore={scaduti}
                    colore={scaduti > 0 ? "#c0392b" : "#16a34a"}
                    nota={scaduti > 0 ? "Da rinnovare subito" : "Nessuno scaduto"}
                    href="/scadenze"
                  />
                  <Card
                    titolo={`In scadenza entro ${GIORNI_PREAVVISO} giorni`}
                    valore={inScadenza}
                    colore={inScadenza > 0 ? "#b7791f" : "#16a34a"}
                    href="/scadenze"
                  />
                </>
              )}
            </div>
          )}

          {mostraPersonale && scadenze.length > 0 && (
            <div style={{ ...cardStile, marginTop: 18 }}>
              <div style={{ fontWeight: 700, color: "#1a3c6e", marginBottom: 8 }}>Da sistemare</div>
              {scadenze.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid #f0f2f5", fontSize: 14 }}
                >
                  <span>
                    <strong>{s.cognome} {s.nome}</strong> — {s.tipo}
                  </span>
                  <span style={{ color: s.giorni < 0 ? "#c0392b" : "#b7791f", whiteSpace: "nowrap" }}>
                    {s.giorni < 0 ? `scaduto il ${formatData(s.data_scadenza)}` : `scade il ${formatData(s.data_scadenza)}`}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 8 }}>
                <Link href="/scadenze" style={{ color: "#1a73e8", fontSize: 14 }}>
                  Vedi tutte le scadenze →
                </Link>
              </div>
            </div>
          )}

          <details style={{ marginTop: 22 }}>
            <summary style={{ cursor: "pointer", color: "#667085" }}>Il tuo account</summary>
            <div style={{ maxWidth: 480, marginTop: 8 }}>
              <p>Email: {profilo.email}</p>
              <p>Ruolo: {profilo.ruolo}</p>
              <p>Nome azienda: {profilo.impresa || "—"}</p>
              <p>Nome utente: {profilo.nome_utente || "—"}</p>
              <p>Codice azienda: {profilo.codice_azienda ? <strong>{profilo.codice_azienda}</strong> : "—"}</p>
              <p>Piano attivo: {profilo.piani?.nome ?? "—"}</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
