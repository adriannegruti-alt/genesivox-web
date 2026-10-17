import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";
import { inviaPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = "https://genesivox-web.vercel.app";

// ---- Documenti dei cantieri (come prima) ----
const SOGLIE_GIORNI = [30, 15, 7, 0];
const RUOLI_DESTINATARI = ["impresa", "capocantiere", "cse_csp", "committente", "responsabile_lavori"];
const RUOLI_COPIA_CONOSCENZA = ["rspp"];

// ---- Documenti dei lavoratori ----
const RUOLI_SEMPRE = ["rspp", "capocantiere"];
const RUOLI_SE_SCADUTO = ["committente", "impresa_edile", "responsabile_lavori"];
const ETICHETTE_RUOLO: Record<string, string> = {
  rspp: "RSPP",
  capocantiere: "Capocantiere / preposto",
  committente: "Committente",
  impresa_edile: "Impresa edile",
  responsabile_lavori: "Responsabile dei lavori",
  responsabile_cantiere: "Responsabile del cantiere",
};
// Un documento scaduto da più di questi giorni non genera un nuovo avviso "scaduto"
const GIORNI_MAX_SCADUTO = 30;

function giorniMancanti(dataScadenza: string): number {
  const oggi = new Date();
  const oggiUTC = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const [anno, mese, giorno] = dataScadenza.split("-").map(Number);
  const scadenzaUTC = Date.UTC(anno, mese - 1, giorno);
  return Math.round((scadenzaUTC - oggiUTC) / 86400000);
}

function oggiRoma(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

function giorniTra(da: string, a: string): number {
  const [y1, m1, d1] = da.split("-").map(Number);
  const [y2, m2, d2] = a.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function formattaData(iso: string): string {
  const [anno, mese, giorno] = iso.split("-");
  return `${giorno}/${mese}/${anno}`;
}

function esc(testo: string): string {
  return testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function riga(etichetta: string, valore: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#666">${etichetta}</td><td>${valore}</td></tr>`;
}

// Quale "gradino" di avviso vale oggi per un documento (o null se è troppo presto/tardi)
function sogliaLavoratore(giorni: number): string | null {
  if (giorni < 0) return giorni >= -GIORNI_MAX_SCADUTO ? "scaduto" : null;
  if (giorni === 0) return "0gg";
  if (giorni <= 7) return "7gg";
  if (giorni <= 30) return "30gg";
  if (giorni <= 60) return "60gg";
  return null;
}

type Destinatario = { cantieri: Set<string>; ruoli: Set<string>; cantiereId: string; profiloId: string | null };

// RSPP, capocantiere (sempre) e committente / impresa edile / responsabili (solo se scaduto)
// dei cantieri in cui il lavoratore è assegnato
async function destinatariCantieri(
  supabase: any,
  lavoratoreId: string,
  scaduto: boolean,
  esclusi: string[]
): Promise<Map<string, Destinatario>> {
  const risultato = new Map<string, Destinatario>();
  const aggiungi = (
    email: string | undefined | null,
    nomeCantiere: string,
    ruolo: string,
    cantiereId: string,
    profiloId: string | null
  ) => {
    if (!email) return;
    const chiave = email.toLowerCase();
    if (esclusi.includes(chiave)) return;
    const attuale = risultato.get(chiave) || {
      cantieri: new Set<string>(),
      ruoli: new Set<string>(),
      cantiereId,
      profiloId,
    };
    attuale.cantieri.add(nomeCantiere);
    attuale.ruoli.add(ruolo);
    risultato.set(chiave, attuale);
  };

  const { data: assegnazioni } = await supabase
    .from("lavoratori_cantiere")
    .select("cantiere_id")
    .eq("lavoratore_id", lavoratoreId);
  const idCantieri = (assegnazioni || []).map((a: any) => a.cantiere_id);
  if (idCantieri.length === 0) return risultato;

  const { data: cantieri } = await supabase.from("cantieri").select("id, nome, creato_da").in("id", idCantieri);
  const { data: membri } = await supabase
    .from("cantiere_membri")
    .select("id, ruolo, profilo_id, cantiere_id, stato, profili!profilo_id(email)")
    .in("cantiere_id", idCantieri)
    .eq("stato", "approvato");
  const elencoMembri = (membri || []) as any[];

  const idMembri = elencoMembri.map((m) => m.id);
  let ruoliExtra: any[] = [];
  if (idMembri.length > 0) {
    const { data: extra } = await supabase.from("membro_ruoli").select("membro_id, ruolo").in("membro_id", idMembri);
    ruoliExtra = extra || [];
  }
  const ruoliDi = (m: any): string[] => [
    m.ruolo,
    ...ruoliExtra.filter((e) => e.membro_id === m.id).map((e) => e.ruolo),
  ];

  const idCreatori = scaduto ? Array.from(new Set((cantieri || []).map((c: any) => c.creato_da).filter(Boolean))) : [];
  let creatori: any[] = [];
  if (idCreatori.length > 0) {
    const { data: profiliCreatori } = await supabase.from("profili").select("id, email").in("id", idCreatori);
    creatori = profiliCreatori || [];
  }

  for (const c of (cantieri || []) as any[]) {
    for (const m of elencoMembri.filter((x) => String(x.cantiere_id) === String(c.id))) {
      const profilo = Array.isArray(m.profili) ? m.profili[0] : m.profili;
      const ruoli = ruoliDi(m);
      const ruoloUtile =
        ruoli.find((r) => RUOLI_SEMPRE.includes(r)) ||
        (scaduto ? ruoli.find((r) => RUOLI_SE_SCADUTO.includes(r)) : undefined);
      if (ruoloUtile) aggiungi(profilo?.email, c.nome, ruoloUtile, String(c.id), m.profilo_id ?? null);
    }
    if (scaduto && c.creato_da) {
      const creatore = creatori.find((p) => p.id === c.creato_da);
      aggiungi(creatore?.email, c.nome, "responsabile_cantiere", String(c.id), c.creato_da);
    }
  }
  return risultato;
}

// Avvisi di scadenza per formazione e idoneità dei lavoratori
async function avvisiLavoratori(supabase: any): Promise<{ email: number; push: number }> {
  let email = 0;
  let push = 0;
  const oggi = oggiRoma();

  const { data: documenti } = await supabase
    .from("documenti_lavoratore")
    .select("id, lavoratore_id, impresa_id, categoria, tipo, data_scadenza, lavoratori(nome, cognome, email, attivo)")
    .not("data_scadenza", "is", null);

  const cacheDatori = new Map<string, any>();

  for (const doc of (documenti || []) as any[]) {
    const lav = Array.isArray(doc.lavoratori) ? doc.lavoratori[0] : doc.lavoratori;
    if (!lav || lav.attivo === false) continue;

    const giorni = giorniTra(oggi, doc.data_scadenza as string);
    const livello = sogliaLavoratore(giorni);
    if (!livello) continue;

    // Includere la data nella soglia: se il documento viene rinnovato gli avvisi ripartono
    const soglia = `${livello}|${doc.data_scadenza}`;
    const { data: giaInviata } = await supabase
      .from("notifiche_inviate")
      .select("id")
      .eq("tipo_evento", "scadenza_lavoratore")
      .eq("riferimento_id", doc.id)
      .eq("soglia", soglia)
      .maybeSingle();
    if (giaInviata) continue;

    if (!cacheDatori.has(doc.impresa_id)) {
      const { data: datore } = await supabase
        .from("profili")
        .select("email, impresa, nome_utente")
        .eq("id", doc.impresa_id)
        .maybeSingle();
      cacheDatori.set(doc.impresa_id, datore);
    }
    const datore = cacheDatori.get(doc.impresa_id);
    const nomeImpresa = datore?.impresa || datore?.nome_utente || "";
    const nomeLavoratore = `${lav.nome} ${lav.cognome}`;
    const scaduto = giorni < 0;
    const nomeDoc = doc.categoria === "idoneita_sanitaria" ? "Idoneità sanitaria" : doc.tipo;
    const esclusi = [(datore?.email || "").toLowerCase(), (lav.email || "").toLowerCase()].filter(Boolean);
    const destinatari = await destinatariCantieri(supabase, doc.lavoratore_id, scaduto, esclusi);

    const quando =
      giorni > 0
        ? `scade tra <strong>${giorni} giorni</strong> (il ${formattaData(doc.data_scadenza)})`
        : giorni === 0
        ? `<strong>scade oggi</strong>`
        : `è <strong style="color:#c0392b">scaduto</strong> il ${formattaData(doc.data_scadenza)}`;
    const quandoBreve =
      giorni > 0 ? `scade tra ${giorni} giorni` : giorni === 0 ? "scade oggi" : "scaduto";
    const prefisso = giorni > 7 ? "⚠️" : "🚨";

    const dettagli = `
      <table style="border-collapse:collapse">
        ${riga("Lavoratore", `<strong>${esc(nomeLavoratore)}</strong>`)}
        ${riga("Impresa", esc(nomeImpresa || "—"))}
        ${riga("Documento", esc(nomeDoc))}
        ${riga("Scadenza", formattaData(doc.data_scadenza))}
      </table>`;

    let inviatiQui = 0;

    // Datore di lavoro
    if (datore?.email) {
      const html = `
        <div style="font-family:sans-serif;max-width:560px">
          <p>Per un tuo lavoratore, un documento ${quando}.</p>
          ${dettagli}
          <p>${
            doc.categoria === "formazione"
              ? `Puoi richiedere il corso dalla pagina Scadenze.`
              : `Ricordati di prenotare per tempo la visita con il medico competente.`
          }</p>
          <p><a href="${APP_URL}/scadenze">Apri le scadenze su GENESIVOX</a></p>
        </div>`;
      const esito = await inviaEmail(
        datore.email,
        `${prefisso} ${nomeDoc} ${quandoBreve} — ${nomeLavoratore}`,
        html
      );
      if (esito.ok) inviatiQui++;
    }
    push += await inviaPush(supabase, [doc.impresa_id], {
      titolo: `${nomeDoc}: ${quandoBreve}`,
      testo: nomeLavoratore,
      url: `${APP_URL}/scadenze`,
    });

    // Lavoratore (se ha un'email registrata)
    if (lav.email) {
      const html = `
        <div style="font-family:sans-serif;max-width:560px">
          <p>Ciao ${esc(lav.nome)},</p>
          <p>${
            doc.categoria === "formazione"
              ? `il tuo documento di formazione <strong>${esc(doc.tipo)}</strong> ${quando}.`
              : `la tua idoneità sanitaria ${quando}.`
          }</p>
          <p>Parlane con ${esc(nomeImpresa || "il tuo datore di lavoro")} per organizzare il rinnovo.</p>
        </div>`;
      const esito = await inviaEmail(lav.email, `${prefisso} ${nomeDoc} ${quandoBreve}`, html);
      if (esito.ok) inviatiQui++;
    }

    // RSPP, capocantiere e, se scaduto, committente / impresa edile / responsabili
    for (const [indirizzo, d] of Array.from(destinatari.entries())) {
      const ruoli = Array.from(d.ruoli).map((r) => ETICHETTE_RUOLO[r] || r);
      const cantieriTesto = Array.from(d.cantieri).join(", ");
      const html = `
        <div style="font-family:sans-serif;max-width:560px">
          <p>Per un lavoratore assegnato al cantiere, un documento ${quando}.</p>
          ${dettagli}
          <table style="border-collapse:collapse">
            ${riga("Cantiere", `<strong>${esc(cantieriTesto)}</strong>`)}
            ${riga("Ricevi questo avviso come", esc(ruoli.join(", ")))}
          </table>
          <p><a href="${APP_URL}/cantieri/${d.cantiereId}/lavoratori">Apri l'elenco dei lavoratori del cantiere</a></p>
        </div>`;
      const esito = await inviaEmail(
        indirizzo,
        `${prefisso} ${nomeDoc} ${quandoBreve} — ${nomeLavoratore} (${cantieriTesto})`,
        html
      );
      if (esito.ok) inviatiQui++;
      if (d.profiloId) {
        push += await inviaPush(supabase, [d.profiloId], {
          titolo: `${nomeDoc}: ${quandoBreve}`,
          testo: `${nomeLavoratore} — ${cantieriTesto}`,
          url: `${APP_URL}/cantieri/${d.cantiereId}/lavoratori`,
        });
      }
    }

    email += inviatiQui;
    if (inviatiQui > 0) {
      await supabase.from("notifiche_inviate").insert({
        tipo_evento: "scadenza_lavoratore",
        riferimento_id: doc.id,
        soglia,
      });
    }
  }

  return { email, push };
}

export async function GET(request: NextRequest) {
  const autorizzazione = request.headers.get("authorization");
  if (autorizzazione !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  const supabase = creaClientSupabaseAdmin();
  let emailScadenzeInviate = 0;
  let emailLimitiInviate = 0;

  const { data: documenti, error: erroreDocumenti } = await supabase
    .from("documenti")
    .select("id, cantiere_id, tipo_documento, nome_file, data_scadenza, cantieri(nome)")
    .not("data_scadenza", "is", null);

  if (erroreDocumenti) {
    return NextResponse.json({ errore: erroreDocumenti.message }, { status: 500 });
  }

  for (const doc of documenti ?? []) {
    const giorni = giorniMancanti(doc.data_scadenza as string);
    if (!SOGLIE_GIORNI.includes(giorni)) continue;

    const soglia = `${giorni}gg`;

    const { data: giaInviata } = await supabase
      .from("notifiche_inviate")
      .select("id")
      .eq("tipo_evento", "scadenza_documento")
      .eq("riferimento_id", doc.id)
      .eq("soglia", soglia)
      .maybeSingle();

    if (giaInviata) continue;

    const { data: membri } = await supabase
      .from("cantiere_membri")
      .select("ruolo, profili!profilo_id(email)")
      .eq("cantiere_id", doc.cantiere_id)
      .in("ruolo", [...RUOLI_DESTINATARI, ...RUOLI_COPIA_CONOSCENZA]);

    const destinatari = (membri ?? [])
      .filter((m: any) => RUOLI_DESTINATARI.includes(m.ruolo) && m.profili?.email)
      .map((m: any) => m.profili.email as string);

    const copiaConoscenza = (membri ?? [])
      .filter((m: any) => RUOLI_COPIA_CONOSCENZA.includes(m.ruolo) && m.profili?.email)
      .map((m: any) => m.profili.email as string);

    if (destinatari.length === 0) continue;

    const nomeCantiere = (doc.cantieri as any)?.nome ?? "cantiere";
    const oggetto =
      giorni > 0
        ? `⚠️ Documento in scadenza tra ${giorni} giorni – ${nomeCantiere}`
        : `🚨 Documento scaduto oggi – ${nomeCantiere}`;

    const corpoHtml = `
      <p>Il documento <strong>${doc.tipo_documento}</strong> (${doc.nome_file}) del cantiere <strong>${nomeCantiere}</strong>
      ${giorni > 0 ? `scade tra <strong>${giorni} giorni</strong> (il ${doc.data_scadenza}).` : "<strong>scade oggi</strong>."}</p>
      <p>Si prega di provvedere al rinnovo quanto prima tramite la piattaforma GENESIVOX.</p>
    `;

    const risultato = await inviaEmail(Array.from(new Set(destinatari)), oggetto, corpoHtml, Array.from(new Set(copiaConoscenza)));

    if (risultato.ok) {
      await supabase.from("notifiche_inviate").insert({
        tipo_evento: "scadenza_documento",
        riferimento_id: doc.id,
        soglia,
      });
      emailScadenzeInviate++;
    }
  }

  // Documenti dei lavoratori (formazione e idoneità)
  let lavoratori = { email: 0, push: 0 };
  let erroreLavoratori: string | null = null;
  try {
    lavoratori = await avvisiLavoratori(supabase);
  } catch (e: any) {
    erroreLavoratori = e?.message || "errore sconosciuto";
  }

  const { data: accountVicini } = await supabase
    .from("riepilogo_limiti_account")
    .select("*")
    .eq("vicino_al_limite", true);

  const meseCorrente = new Date().toISOString().slice(0, 7);

  for (const riga of accountVicini ?? []) {
    const idProfilo = (riga as any).id_profilo;
    if (!idProfilo) continue;

    const { data: giaInviata } = await supabase
      .from("notifiche_inviate")
      .select("id")
      .eq("tipo_evento", "limite_account")
      .eq("riferimento_id", idProfilo)
      .eq("soglia", meseCorrente)
      .maybeSingle();

    if (giaInviata) continue;

    const { data: profilo } = await supabase
      .from("profili")
      .select("email")
      .eq("id", idProfilo)
      .maybeSingle();

    if (!profilo?.email) continue;

    const corpoHtml = `
      <p>Il tuo account GENESIVOX si sta avvicinando al limite del tuo piano.</p>
      <p>Controlla la situazione nella tua area account per valutare se effettuare un upgrade.</p>
    `;

    const risultato = await inviaEmail(profilo.email, "⚠️ Stai per raggiungere il limite del tuo piano GENESIVOX", corpoHtml);

    if (risultato.ok) {
      await supabase.from("notifiche_inviate").insert({
        tipo_evento: "limite_account",
        riferimento_id: idProfilo,
        soglia: meseCorrente,
      });
      emailLimitiInviate++;
    }
  }

  return NextResponse.json({
    ok: true,
    emailScadenzeInviate,
    emailLimitiInviate,
    emailLavoratori: lavoratori.email,
    pushLavoratori: lavoratori.push,
    erroreLavoratori,
  });
}
