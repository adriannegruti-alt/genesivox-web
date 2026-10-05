import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";
import { inviaPush } from "@/lib/push";

export const dynamic = "force-dynamic";

const APP_URL = "https://genesivox-web.vercel.app";

// Chi riceve l'email quando il documento è già scaduto al momento del caricamento
const RUOLI_SE_SCADUTO = ["impresa", "impresa_edile", "capocantiere", "cse_csp", "committente", "responsabile_lavori"];
const RUOLI_COPIA_SE_SCADUTO = ["rspp"];
// Chi riceve l'email per un normale documento nuovo
const RUOLI_SE_NUOVO = ["cse_csp", "committente", "responsabile_lavori", "capocantiere"];
// Chi può caricare documenti per conto di altre persone (stessi ruoli della pagina Imprese)
const RUOLI_CHE_GESTISCONO = ["committente", "impresa_edile", "rspp"];

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

export async function POST(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  // 1. Chi sta chiamando? Serve un utente loggato.
  const intestazione = richiesta.headers.get("authorization") || "";
  const token = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const { data: utenteData } = await admin.auth.getUser(token);
  const utente = utenteData?.user;
  if (!utente) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  let documentoId = "";
  try {
    const corpo = await richiesta.json();
    documentoId = String(corpo.documentoId || "");
  } catch {
    // corpo non valido: gestito sotto
  }
  if (!documentoId) return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });

  // 2. Il documento esiste?
  const { data: doc } = await admin
    .from("documenti")
    .select("id, cantiere_id, profilo_id, tipo_documento, nome_file, data_scadenza")
    .eq("id", documentoId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, errore: "Documento non trovato" }, { status: 404 });

  // 3. Dati del cantiere, di chi sta caricando e dei membri
  const { data: cantiere } = await admin.from("cantieri").select("nome, creato_da").eq("id", doc.cantiere_id).maybeSingle();
  const { data: chiHaCaricato } = await admin
    .from("profili")
    .select("email, impresa, nome_utente, ruolo")
    .eq("id", utente.id)
    .maybeSingle();

  const { data: membri } = await admin
    .from("cantiere_membri")
    .select("id, ruolo, profilo_id, nome_impresa, profili!profilo_id(email)")
    .eq("cantiere_id", doc.cantiere_id);
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

  // 4. Può avvisare solo chi ha caricato un file proprio, oppure chi gestisce il cantiere
  const chiamanteGestisce =
    chiHaCaricato?.ruolo === "admin" ||
    cantiere?.creato_da === utente.id ||
    elencoMembri.some((m) => m.profilo_id === utente.id && ruoliDi(m).some((r) => RUOLI_CHE_GESTISCONO.includes(r)));
  if (doc.profilo_id !== utente.id && !chiamanteGestisce) {
    return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 403 });
  }

  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const scaduto = !!doc.data_scadenza && doc.data_scadenza < oggi;
  const tipoEvento = scaduto ? "documento_caricato_scaduto" : "documento_caricato";

  // 5. Evita doppioni: se per questo documento l'avviso è già partito, ci fermiamo.
  const { error: erroreRegistro } = await admin
    .from("notifiche_inviate")
    .insert({ tipo_evento: tipoEvento, riferimento_id: doc.id, soglia: "unico" });
  if (erroreRegistro) {
    if (erroreRegistro.code === "23505") return NextResponse.json({ ok: true, giaInviata: true });
    return NextResponse.json({ ok: false, errore: erroreRegistro.message }, { status: 500 });
  }

  // 6. Chi sono i destinatari?
  const ruoliPrincipali = scaduto ? RUOLI_SE_SCADUTO : RUOLI_SE_NUOVO;
  const destinatari = new Set<string>();
  const copia = new Set<string>();
  const idPerPush = new Set<string>();

  for (const m of elencoMembri) {
    const profilo = Array.isArray(m.profili) ? m.profili[0] : m.profili;
    const email: string | undefined = profilo?.email;
    if (!email) continue;

    // Per un documento normale, chi lo ha caricato non riceve l'avviso
    if (!scaduto && m.profilo_id === utente.id) continue;

    const ruoli = ruoliDi(m);
    if (ruoli.some((r) => ruoliPrincipali.includes(r))) {
      destinatari.add(email);
      idPerPush.add(m.profilo_id);
    } else if (scaduto && ruoli.some((r) => RUOLI_COPIA_SE_SCADUTO.includes(r))) {
      copia.add(email);
      idPerPush.add(m.profilo_id);
    }
  }
  Array.from(destinatari).forEach((e) => copia.delete(e));

  if (destinatari.size === 0) {
    return NextResponse.json({ ok: true, inviate: 0, scaduto });
  }

  // 7. Testo dell'email
  const nomeCantiere = cantiere?.nome || "cantiere";
  const nomeCaricatore = chiHaCaricato?.impresa || chiHaCaricato?.nome_utente || chiHaCaricato?.email || "un utente";

  const membroProprietario = elencoMembri.find((m) => m.profilo_id === doc.profilo_id);
  const { data: profiloProprietario } = await admin
    .from("profili")
    .select("email, impresa, nome_utente")
    .eq("id", doc.profilo_id)
    .maybeSingle();
  const nomeProprietario =
    membroProprietario?.nome_impresa ||
    profiloProprietario?.impresa ||
    profiloProprietario?.nome_utente ||
    profiloProprietario?.email ||
    "";

  const percorso = `/cantieri/${doc.cantiere_id}/imprese/${doc.profilo_id}`;
  const link = `${APP_URL}${percorso}`;

  const oggetto = scaduto
    ? `⚠ Documento caricato già scaduto — ${nomeCantiere}`
    : `Nuovo documento caricato — ${nomeCantiere}`;

  const intro = scaduto
    ? `<p><strong style="color:#c0392b">Attenzione:</strong> è stato caricato un documento che risulta <strong>già scaduto</strong>.</p>`
    : `<p>È stato caricato un nuovo documento nel cantiere.</p>`;

  const rigaProprietario =
    doc.profilo_id !== utente.id && nomeProprietario
      ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Documento di</td><td>${esc(nomeProprietario)}</td></tr>`
      : "";

  const html = `
    <div style="font-family:sans-serif;max-width:560px">
      ${intro}
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Cantiere</td><td><strong>${esc(nomeCantiere)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Tipo di documento</td><td>${esc(doc.tipo_documento || "")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">File</td><td>${esc(doc.nome_file || "")}</td></tr>
        ${rigaProprietario}
        <tr><td style="padding:4px 12px 4px 0;color:#666">Caricato da</td><td>${esc(nomeCaricatore)}</td></tr>
        ${doc.data_scadenza ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Scadenza</td><td>${formattaData(doc.data_scadenza)}</td></tr>` : ""}
      </table>
      <p><a href="${link}">Apri i documenti su GENESIVOX</a></p>
    </div>`;

  const esito = await inviaEmail(
    Array.from(destinatari),
    oggetto,
    html,
    copia.size > 0 ? Array.from(copia) : undefined
  );

  // Se l'invio fallisce, togliamo il segno di "già inviata" così si potrà riprovare
  if (!esito.ok) {
    await admin.from("notifiche_inviate").delete().eq("tipo_evento", tipoEvento).eq("riferimento_id", doc.id);
    return NextResponse.json({ ok: false, errore: esito.errore }, { status: 500 });
  }

  // 8. Notifica push (non blocca mai: se fallisce, l'email è già partita)
  const titoloPush = scaduto ? "⚠ Documento caricato già scaduto" : "Nuovo documento caricato";
  const testoPush = `${doc.tipo_documento || "Documento"} — ${nomeCantiere}`;
  const pushInviate = await inviaPush(admin, Array.from(idPerPush), {
    titolo: titoloPush,
    testo: testoPush,
    url: percorso,
  });

  return NextResponse.json({ ok: true, inviate: destinatari.size + copia.size, push: pushInviate, scaduto });
}
