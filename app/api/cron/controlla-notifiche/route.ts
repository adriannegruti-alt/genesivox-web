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

  const debugMembri: any[] = [];

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

    const { data: membri, error: erroreMembri } = await supabase
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

    debugMembri.push({
      documento: doc.nome_file,
      cantiere_id: doc.cantiere_id,
      erroreMembri: erroreMembri?.message ?? null,
      membriTrovati: membri,
      destinatari,
    });

    if (destinatari.length === 0) continue;

    const nomeCantiere = (doc.cantieri as any)?.nome ?? "cantiere";
    const oggetto =
      giorni > 0
        ? `⚠️ Documento in scadenza tra ${giorni} giorni – ${nomeCantiere}`
        : `🚨 Documento scaduto oggi
