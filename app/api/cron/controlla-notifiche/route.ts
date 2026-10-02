import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";

const SOGLIE_GIORNI = [30, 15, 7, 0];
const RUOLI_DESTINATARI = ["impresa", "capocantiere", "cse_csp", "committente", "responsabile_lavori"];
const RUOLI_COPIA_CONOSCENZA = ["rspp"];

function giorniMancanti(dataScadenza: string): number {
  const oggi = new Date();
  const oggiUTC = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  const [anno, mese, giorno] = dataScadenza.split("-").map(Number);
  const scadenzaUTC = Date.UTC(anno, mese - 1, giorno);
  return Math.round((scadenzaUTC - oggiUTC) / 86400000);
}

export async function GET(request: NextRequest) {
  // Protezione: solo Vercel (con il nostro CRON_SECRET) può chiamare questo indirizzo
    const autorizzazione = request.headers.get("authorization");
  const secretDaUrl = request.nextUrl.searchParams.get("secret");
  const autorizzato =
    autorizzazione === `Bearer ${process.env.CRON_SECRET}` || secretDaUrl === process.env.CRON_SECRET;
  if (!autorizzato) {
    return NextResponse.json({ errore: "Non autorizzato" }, { status: 401 });
  }

  const supabase = creaClientSupabaseAdmin();
  let emailScadenzeInviate = 0;
  let emailLimitiInviate = 0;

  // --- PARTE 1: documenti in scadenza o scaduti ---
  const { data: documenti, error: erroreDocumenti } = await supabase
    .from("documenti")
    .select("id, cantiere_id, tipo_documento, nome_file, data_scadenza, cantieri(nome)")
    .not("data_scadenza", "is", null);

  if (erroreDocumenti) {
    return NextResponse.json({ errore: erroreDocumenti.message }, { status: 500 });
  }

    const debugDocumenti = (documenti ?? []).map((d: any) => ({
    nome_file: d.nome_file,
    data_scadenza: d.data_scadenza,
    giorni: giorniMancanti(d.data_scadenza as string),
  }));
  for (const doc of documenti ?? []) {
    const giorni = giorniMancanti(doc.data_scadenza as string);
    if (!SOGLIE_GIORNI.includes(giorni)) continue;

    const soglia = `${giorni}gg`;

    // Salta se abbiamo già mandato questa notifica per questo documento/soglia
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
      .select("ruolo, profili(email)")
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

  // --- PARTE 2: account vicini al limite storage/cantieri ---
  const { data: accountVicini } = await supabase
    .from("riepilogo_limiti_account")
    .select("*")
    .eq("vicino_al_limite", true);

  const meseCorrente = new Date().toISOString().slice(0, 7); // es. "2026-10"

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

    return NextResponse.json({ ok: true, emailScadenzeInviate, emailLimitiInviate, debugDocumenti });
