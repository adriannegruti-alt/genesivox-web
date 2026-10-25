import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";
import { inviaPush } from "@/lib/push";

export const dynamic = "force-dynamic";

const APP_URL = "https://app.genesivox.com";
const GIORNO_MS = 24 * 60 * 60 * 1000;
const GIORNI_PREAVVISO = 7; // avviso quando mancano 7 giorni o meno
const GIORNI_TOLLERANZA = 3; // l'avviso "scaduta" parte solo se è scaduta da meno di 3 giorni

function esc(testo: string): string {
  return testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formattaData(data: Date): string {
  return data.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Rome",
  });
}

function saluto(p: any): string {
  const nome = String(p.nome || p.nome_completo || "").trim();
  return nome ? `Ciao ${esc(nome)},` : "Buongiorno,";
}

function cornice(corpo: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;line-height:1.5;color:#14202B">
      ${corpo}
      <p style="margin:24px 0">
        <a href="${APP_URL}" style="background:#08D6EE;color:#08182F;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Apri GENESIVOX</a>
      </p>
      <p style="color:#666;font-size:13px">GENESIVOX S.r.l. · <a href="mailto:info@genesivox.com">info@genesivox.com</a></p>
    </div>`;
}

function emailPreavviso(p: any, scadenza: Date, giorniRimasti: number): { oggetto: string; html: string } {
  const data = formattaData(scadenza);
  const quando = giorniRimasti <= 1 ? "domani" : `tra ${giorniRimasti} giorni`;
  return {
    oggetto: `La tua prova gratuita di GENESIVOX scade il ${data}`,
    html: cornice(`
      <p>${saluto(p)}</p>
      <p>la tua prova gratuita di GENESIVOX termina il <strong>${data}</strong> (${quando}).</p>
      <p>Cosa succede dopo la scadenza: i tuoi cantieri, i lavoratori e i documenti restano al loro posto e li puoi continuare a consultare. Non potrai però creare nuovi cantieri finché non attivi un piano.</p>
      <p>Vuoi continuare? Scrivici a <a href="mailto:info@genesivox.com">info@genesivox.com</a> e ti aiutiamo a scegliere il piano più adatto. Se ti serve più tempo per provare l'app, scrivici lo stesso.</p>`),
  };
}

function emailScaduta(p: any, scadenza: Date): { oggetto: string; html: string } {
  const data = formattaData(scadenza);
  return {
    oggetto: "La tua prova gratuita di GENESIVOX è terminata",
    html: cornice(`
      <p>${saluto(p)}</p>
      <p>la tua prova gratuita di GENESIVOX è terminata il <strong>${data}</strong>.</p>
      <p>I tuoi cantieri, i lavoratori e i documenti sono al sicuro e puoi consultarli. Per creare nuovi cantieri serve attivare un piano.</p>
      <p>Scrivici a <a href="mailto:info@genesivox.com">info@genesivox.com</a>: ti aiutiamo a scegliere il piano più adatto e a riprendere da dove eri rimasto.</p>`),
  };
}

export async function GET(richiesta: NextRequest) {
  // Solo la pianificazione di Vercel (o chi conosce il segreto) può far partire l'invio
  const segreto = process.env.CRON_SECRET;
  const intestazione = richiesta.headers.get("authorization") || "";
  if (!segreto || intestazione !== `Bearer ${segreto}`) {
    return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });
  }

  const admin = creaClientSupabaseAdmin();
  const ora = new Date();
  const limitePreavviso = new Date(ora.getTime() + GIORNI_PREAVVISO * GIORNO_MS);
  const limiteScaduta = new Date(ora.getTime() - GIORNI_TOLLERANZA * GIORNO_MS);

  const colonne = "id, email, nome, nome_completo, impresa, prova_scade_il";

  // 1. Prova che scade entro 7 giorni (e non è ancora scaduta), avviso non ancora inviato
  const { data: inScadenza, error: erroreA } = await admin
    .from("profili")
    .select(colonne)
    .eq("attivo", true)
    .not("piano_id", "is", null)
    .is("prova_avviso_7g_il", null)
    .gt("prova_scade_il", ora.toISOString())
    .lte("prova_scade_il", limitePreavviso.toISOString());

  // 2. Prova scaduta da poco, avviso di scadenza non ancora inviato
  const { data: scadute, error: erroreB } = await admin
    .from("profili")
    .select(colonne)
    .eq("attivo", true)
    .not("piano_id", "is", null)
    .is("prova_avviso_scadenza_il", null)
    .lte("prova_scade_il", ora.toISOString())
    .gt("prova_scade_il", limiteScaduta.toISOString());

  if (erroreA || erroreB) {
    console.error("promemoria-prova: errore lettura", erroreA?.message, erroreB?.message);
    return NextResponse.json({ ok: false, errore: "Errore di lettura dei profili" }, { status: 500 });
  }

  const inviatiPreavviso: string[] = [];
  const inviatiScaduta: string[] = [];
  const errori: string[] = [];

  for (const p of (inScadenza || []) as any[]) {
    if (!p.email) continue;
    const scadenza = new Date(p.prova_scade_il);
    const giorni = Math.max(1, Math.ceil((scadenza.getTime() - ora.getTime()) / GIORNO_MS));
    const { oggetto, html } = emailPreavviso(p, scadenza, giorni);
    const esito = await inviaEmail(p.email, oggetto, html);
    if (esito.ok) {
      await admin.from("profili").update({ prova_avviso_7g_il: ora.toISOString() }).eq("id", p.id);
      await inviaPush(admin, [p.id], {
        titolo: "Prova gratuita in scadenza",
        testo: `Termina il ${formattaData(scadenza)}`,
        url: APP_URL,
      });
      inviatiPreavviso.push(`${p.email} (scade il ${formattaData(scadenza)})`);
    } else {
      errori.push(`preavviso non inviato a ${p.email}`);
    }
  }

  for (const p of (scadute || []) as any[]) {
    if (!p.email) continue;
    const scadenza = new Date(p.prova_scade_il);
    const { oggetto, html } = emailScaduta(p, scadenza);
    const esito = await inviaEmail(p.email, oggetto, html);
    if (esito.ok) {
      await admin.from("profili").update({ prova_avviso_scadenza_il: ora.toISOString() }).eq("id", p.id);
      await inviaPush(admin, [p.id], {
        titolo: "Prova gratuita terminata",
        testo: "Per creare nuovi cantieri attiva un piano",
        url: APP_URL,
      });
      inviatiScaduta.push(`${p.email} (scaduta il ${formattaData(scadenza)})`);
    } else {
      errori.push(`avviso di scadenza non inviato a ${p.email}`);
    }
  }

  // Riepilogo per Genesivox: così sai chi contattare di persona
  const emailInterna = process.env.EMAIL_GENESIVOX;
  if (emailInterna && (inviatiPreavviso.length > 0 || inviatiScaduta.length > 0)) {
    const elenco = (titolo: string, righe: string[]) =>
      righe.length > 0
        ? `<p><strong>${titolo}</strong></p><ul>${righe.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
        : "";
    const html = `
      <div style="font-family:sans-serif;max-width:560px">
        <p>Promemoria prova gratuita inviati oggi. Un messaggio o una telefonata personale ora fa la differenza.</p>
        ${elenco("Prova in scadenza (avviso a 7 giorni)", inviatiPreavviso)}
        ${elenco("Prova scaduta", inviatiScaduta)}
        ${errori.length > 0 ? elenco("Da controllare", errori) : ""}
      </div>`;
    await inviaEmail(
      emailInterna,
      `[Prove] ${inviatiPreavviso.length} in scadenza, ${inviatiScaduta.length} scadute`,
      html
    );
  }

  return NextResponse.json({
    ok: true,
    preavvisi: inviatiPreavviso.length,
    scadute: inviatiScaduta.length,
    errori: errori.length,
  });
}
