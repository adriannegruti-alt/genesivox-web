import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const APP_URL = "https://genesivox-web.vercel.app";

// Chi riceve sempre l'avviso, nei cantieri in cui il lavoratore è assegnato
const RUOLI_SEMPRE = ["rspp", "capocantiere"];
// Chi lo riceve solo se il documento è già scaduto
const RUOLI_SE_SCADUTO = ["committente", "impresa_edile", "responsabile_lavori"];

const ETICHETTE_RUOLO: Record<string, string> = {
  rspp: "RSPP",
  capocantiere: "Capocantiere / preposto",
  committente: "Committente",
  impresa_edile: "Impresa edile",
  responsabile_lavori: "Responsabile dei lavori",
  responsabile_cantiere: "Responsabile del cantiere",
};

function esc(testo: string): string {
  return testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formattaData(iso: string): string {
  const [anno, mese, giorno] = iso.split("-");
  return `${giorno}/${mese}/${anno}`;
}

function riga(etichetta: string, valore: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#666">${etichetta}</td><td>${valore}</td></tr>`;
}

type Destinatario = { cantieri: Set<string>; ruoli: Set<string>; cantiereId: string };

export async function POST(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  // 1. Serve un utente loggato
  const intestazione = richiesta.headers.get("authorization") || "";
  const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!jwt) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const { data: utenteData } = await admin.auth.getUser(jwt);
  const utente = utenteData?.user;
  if (!utente) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  let documentoId = "";
  let note = "";
  try {
    const corpo = await richiesta.json();
    documentoId = String(corpo.documentoId || "");
    note = String(corpo.note || "").slice(0, 500);
  } catch {
    // corpo non valido: gestito sotto
  }
  if (!documentoId) return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });

  // 2. Il documento è di un lavoratore di questa impresa ed è un corso di formazione?
  const { data: doc } = await admin
    .from("documenti_lavoratore")
    .select("id, lavoratore_id, impresa_id, categoria, tipo, data_scadenza")
    .eq("id", documentoId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, errore: "Documento non trovato" }, { status: 404 });
  if (doc.impresa_id !== utente.id) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 403 });
  if (doc.categoria !== "formazione") {
    return NextResponse.json({ ok: false, errore: "La richiesta di corso vale solo per la formazione." }, { status: 400 });
  }

  const { data: lav } = await admin
    .from("lavoratori")
    .select("nome, cognome, email")
    .eq("id", doc.lavoratore_id)
    .maybeSingle();
  if (!lav) return NextResponse.json({ ok: false, errore: "Lavoratore non trovato" }, { status: 404 });

  // 3. Evita doppioni: se c'è già una richiesta aperta per questo documento, ci fermiamo
  const { data: aperta } = await admin
    .from("richieste_corso")
    .select("id")
    .eq("documento_id", doc.id)
    .in("stato", ["nuova", "inoltrata"])
    .limit(1)
    .maybeSingle();
  if (aperta) return NextResponse.json({ ok: true, giaInviata: true });

  const { error: erroreInserimento } = await admin.from("richieste_corso").insert({
    impresa_id: utente.id,
    lavoratore_id: doc.lavoratore_id,
    documento_id: doc.id,
    tipo_corso: doc.tipo,
    note: note.trim() || null,
  });
  if (erroreInserimento) {
    return NextResponse.json({ ok: false, errore: erroreInserimento.message }, { status: 500 });
  }

  // 4. Dati per le email
  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const scaduto = !!doc.data_scadenza && doc.data_scadenza < oggi;

  const { data: datore } = await admin
    .from("profili")
    .select("email, impresa, nome_utente")
    .eq("id", utente.id)
    .maybeSingle();
  const nomeImpresa = datore?.impresa || datore?.nome_utente || "";
  const nomeLavoratore = `${lav.nome} ${lav.cognome}`;

  // 5. Chi va avvisato nei cantieri in cui il lavoratore è assegnato
  const destinatari = new Map<string, Destinatario>();
  const aggiungi = (email: string | undefined | null, nomeCantiere: string, ruolo: string, cantiereId: string) => {
    if (!email) return;
    const chiave = email.toLowerCase();
    if (chiave === (datore?.email || "").toLowerCase()) return; // il datore riceve già la sua email
    if (chiave === (lav.email || "").toLowerCase()) return; // il lavoratore riceve la sua
    const attuale = destinatari.get(chiave) || { cantieri: new Set<string>(), ruoli: new Set<string>(), cantiereId };
    attuale.cantieri.add(nomeCantiere);
    attuale.ruoli.add(ruolo);
    destinatari.set(chiave, attuale);
  };

  const { data: assegnazioni } = await admin
    .from("lavoratori_cantiere")
    .select("cantiere_id")
    .eq("lavoratore_id", doc.lavoratore_id);
  const idCantieri = (assegnazioni || []).map((a: any) => a.cantiere_id);

  if (idCantieri.length > 0) {
    const { data: cantieri } = await admin.from("cantieri").select("id, nome, creato_da").in("id", idCantieri);
    const { data: membri } = await admin
      .from("cantiere_membri")
      .select("id, ruolo, profilo_id, cantiere_id, stato, profili!profilo_id(email)")
      .in("cantiere_id", idCantieri)
      .eq("stato", "approvato");
    const elencoMembri = (membri || []) as any[];

    const idMembri = elencoMembri.map((m) => m.id);
    let ruoliExtra: any[] = [];
    if (idMembri.length > 0) {
      const { data: extra } = await admin.from("membro_ruoli").select("membro_id, ruolo").in("membro_id", idMembri);
      ruoliExtra = extra || [];
    }
    const ruoliDi = (m: any): string[] => [
      m.ruolo,
      ...ruoliExtra.filter((e) => e.membro_id === m.id).map((e) => e.ruolo),
    ];

    // Chi ha creato il cantiere riceve l'avviso solo per documenti scaduti
    const idCreatori = scaduto ? Array.from(new Set((cantieri || []).map((c: any) => c.creato_da).filter(Boolean))) : [];
    let creatori: any[] = [];
    if (idCreatori.length > 0) {
      const { data: profiliCreatori } = await admin.from("profili").select("id, email").in("id", idCreatori);
      creatori = profiliCreatori || [];
    }

    for (const c of (cantieri || []) as any[]) {
      for (const m of elencoMembri.filter((x) => String(x.cantiere_id) === String(c.id))) {
        const profilo = Array.isArray(m.profili) ? m.profili[0] : m.profili;
        const ruoli = ruoliDi(m);
        const ruoloUtile =
          ruoli.find((r) => RUOLI_SEMPRE.includes(r)) ||
          (scaduto ? ruoli.find((r) => RUOLI_SE_SCADUTO.includes(r)) : undefined);
        if (ruoloUtile) aggiungi(profilo?.email, c.nome, ruoloUtile, String(c.id));
      }
      if (scaduto && c.creato_da) {
        const creatore = creatori.find((p) => p.id === c.creato_da);
        aggiungi(creatore?.email, c.nome, "responsabile_cantiere", String(c.id));
      }
    }
  }

  // 6. Costruzione ed invio delle email (una per persona)
  const intestazioneCorso = `
    <table style="border-collapse:collapse">
      ${riga("Lavoratore", `<strong>${esc(nomeLavoratore)}</strong>`)}
      ${riga("Impresa", esc(nomeImpresa || "—"))}
      ${riga("Corso richiesto", esc(doc.tipo))}
      ${doc.data_scadenza ? riga("Scadenza attuale", formattaData(doc.data_scadenza)) : ""}
      ${scaduto ? riga("Stato", `<strong style="color:#c0392b">Scaduto</strong>`) : ""}
    </table>`;

  const etichetteAvvisati = new Set<string>();
  destinatari.forEach((d) => d.ruoli.forEach((r) => etichetteAvvisati.add(ETICHETTE_RUOLO[r] || r)));
  const elencoAvvisati = [
    ...(lav.email ? ["il lavoratore"] : []),
    ...Array.from(etichetteAvvisati).map((e) => e.toLowerCase()),
  ];

  let inviate = 0;

  // 6a. Datore di lavoro
  if (datore?.email) {
    const html = `
      <div style="font-family:sans-serif;max-width:560px">
        <p>Abbiamo ricevuto la tua richiesta di corso di formazione. Ti ricontatteremo con le opzioni disponibili.</p>
        ${intestazioneCorso}
        ${note.trim() ? `<p><strong>Nota:</strong> ${esc(note.trim())}</p>` : ""}
        <p style="color:#666">Per questa richiesta abbiamo avvisato via email anche: ${
          elencoAvvisati.length > 0 ? esc(elencoAvvisati.join(", ")) : "nessun altro (nessun destinatario collegato)"
        }.</p>
        <p><a href="${APP_URL}/scadenze">Vai alle scadenze su GENESIVOX</a></p>
      </div>`;
    const esito = await inviaEmail(datore.email, `Richiesta di corso inviata — ${doc.tipo} per ${nomeLavoratore}`, html);
    if (esito.ok) inviate += 1;
  }

  // 6b. Lavoratore (solo se ha un'email registrata)
  if (lav.email) {
    const html = `
      <div style="font-family:sans-serif;max-width:560px">
        <p>Ciao ${esc(lav.nome)},</p>
        <p>${esc(nomeImpresa || "La tua impresa")} ha richiesto per te il corso <strong>${esc(doc.tipo)}</strong>
        per tenere aggiornata la tua formazione sulla sicurezza.</p>
        <p>Riceverai indicazioni su date e sede appena disponibili.</p>
      </div>`;
    const esito = await inviaEmail(lav.email, `Corso di formazione richiesto — ${doc.tipo}`, html);
    if (esito.ok) inviate += 1;
  }

  // 6c. RSPP, capocantiere e, se scaduto, committente / impresa edile / responsabili
  for (const [email, d] of Array.from(destinatari.entries())) {
    const ruoli = Array.from(d.ruoli).map((r) => ETICHETTE_RUOLO[r] || r);
    const cantieriTesto = Array.from(d.cantieri).join(", ");
    const html = `
      <div style="font-family:sans-serif;max-width:560px">
        <p>${
          scaduto
            ? `<strong style="color:#c0392b">Attenzione:</strong> per un lavoratore assegnato al cantiere, un documento di formazione risulta <strong>scaduto</strong>. L'impresa ha richiesto il corso.`
            : `L'impresa ha richiesto un corso di formazione per un lavoratore assegnato al cantiere.`
        }</p>
        ${intestazioneCorso}
        <table style="border-collapse:collapse">
          ${riga("Cantiere", `<strong>${esc(cantieriTesto)}</strong>`)}
          ${riga("Ricevi questo avviso come", esc(ruoli.join(", ")))}
        </table>
        <p><a href="${APP_URL}/cantieri/${d.cantiereId}/lavoratori">Apri l'elenco dei lavoratori del cantiere</a></p>
      </div>`;
    const oggetto = scaduto
      ? `⚠ Formazione scaduta — ${nomeLavoratore} (${cantieriTesto})`
      : `Corso di formazione richiesto — ${nomeLavoratore} (${cantieriTesto})`;
    const esito = await inviaEmail(email, oggetto, html);
    if (esito.ok) inviate += 1;
  }

  // 6d. Copia interna a Genesivox (solo se l'indirizzo è impostato su Vercel)
  const emailInterna = process.env.EMAIL_GENESIVOX;
  if (emailInterna) {
    const html = `
      <div style="font-family:sans-serif;max-width:560px">
        <p>Nuova richiesta di corso.</p>
        ${intestazioneCorso}
        ${note.trim() ? `<p><strong>Nota:</strong> ${esc(note.trim())}</p>` : ""}
        <p>Impresa: ${esc(nomeImpresa || "—")} (${esc(datore?.email || "—")})</p>
        <p>Avvisati: ${esc(elencoAvvisati.join(", ") || "nessuno")}</p>
      </div>`;
    await inviaEmail(emailInterna, `[Richiesta corso] ${doc.tipo} — ${nomeLavoratore}`, html);
  }

  return NextResponse.json({ ok: true, inviate, avvisati: elencoAvvisati });
}
