import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";
import { inviaPush } from "@/lib/push";

export const dynamic = "force-dynamic";

const APP_URL = "https://app.genesivox.com";

function esc(testo: string): string {
  return testo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formattaData(iso: string): string {
  const [anno, mese, giorno] = iso.split("-");
  return `${giorno}/${mese}/${anno}`;
}

// Avvisa chi di competenza quando un'attività / non conformità viene assegnata o chiusa.
// evento = "assegnata": avvisa la persona assegnata (se diversa da chi ha fatto l'azione)
// evento = "chiusa": avvisa chi l'ha creata (se diverso da chi l'ha chiusa)
export async function POST(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  const intestazione = richiesta.headers.get("authorization") || "";
  const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!jwt) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const { data: utenteData } = await admin.auth.getUser(jwt);
  const utente = utenteData?.user;
  if (!utente) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  let attivitaId = "";
  let evento = "";
  try {
    const corpo = await richiesta.json();
    attivitaId = String(corpo.attivitaId || "");
    evento = String(corpo.evento || "");
  } catch {
    // gestito sotto
  }
  if (!attivitaId || !["assegnata", "chiusa"].includes(evento)) {
    return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });
  }

  const { data: att } = await admin
    .from("attivita_cantiere")
    .select("id, cantiere_id, tipo, titolo, descrizione, gravita, stato, assegnata_a, scadenza, creato_da, nota_chiusura")
    .eq("id", attivitaId)
    .maybeSingle();
  if (!att) return NextResponse.json({ ok: false, errore: "Non trovata" }, { status: 404 });

  // Può chiedere l'avviso solo chi l'ha creata o chi è assegnato
  if (att.creato_da !== utente.id && att.assegnata_a !== utente.id) {
    return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 403 });
  }

  const { data: cantiere } = await admin.from("cantieri").select("nome").eq("id", att.cantiere_id).maybeSingle();
  const nomeCantiere = cantiere?.nome || "";
  const eNc = att.tipo === "non_conformita";
  const etichetta = eNc ? "Non conformità" : "Attività";
  const link = `${APP_URL}/cantieri/${att.cantiere_id}/attivita`;

  let destinatarioId: string | null = null;
  if (evento === "assegnata") destinatarioId = att.assegnata_a;
  if (evento === "chiusa") destinatarioId = att.creato_da;
  if (!destinatarioId || destinatarioId === utente.id) {
    return NextResponse.json({ ok: true, avvisati: 0 });
  }

  const { data: dest } = await admin.from("profili").select("email").eq("id", destinatarioId).maybeSingle();
  const { data: mittente } = await admin.from("profili").select("email").eq("id", utente.id).maybeSingle();

  const oggetto =
    evento === "assegnata"
      ? `${etichetta} assegnata a te — ${att.titolo} (${nomeCantiere})`
      : `${etichetta} chiusa — ${att.titolo} (${nomeCantiere})`;

  const righe = [
    `<tr><td style="padding:4px 12px 4px 0;color:#666">Cantiere</td><td><strong>${esc(nomeCantiere)}</strong></td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;color:#666">${etichetta}</td><td><strong>${esc(att.titolo)}</strong></td></tr>`,
    att.gravita ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Gravità</td><td>${esc(att.gravita)}</td></tr>` : "",
    att.scadenza
      ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Scadenza</td><td>${formattaData(att.scadenza)}</td></tr>`
      : "",
    evento === "chiusa" && att.nota_chiusura
      ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Nota</td><td>${esc(att.nota_chiusura)}</td></tr>`
      : "",
  ].join("");

  const html = `
    <div style="font-family:sans-serif;max-width:560px">
      <p>${
        evento === "assegnata"
          ? `${esc(mittente?.email || "Un collega")} ti ha assegnato ${eNc ? "una non conformità" : "un'attività"} in un cantiere.`
          : `${eNc ? "La non conformità" : "L'attività"} che avevi creato è stata chiusa da ${esc(mittente?.email || "un collega")}.`
      }</p>
      <table style="border-collapse:collapse">${righe}</table>
      ${att.descrizione ? `<p style="color:#444">${esc(att.descrizione)}</p>` : ""}
      <p><a href="${link}">Apri su GENESIVOX</a></p>
    </div>`;

  let inviate = 0;
  if (dest?.email) {
    const esito = await inviaEmail(dest.email, oggetto, html);
    if (esito.ok) inviate += 1;
  }
  const push = await inviaPush(admin, [destinatarioId], {
    titolo: evento === "assegnata" ? `${etichetta} assegnata a te` : `${etichetta} chiusa`,
    testo: `${att.titolo} — ${nomeCantiere}`,
    url: link,
  });

  return NextResponse.json({ ok: true, avvisati: 1, inviate, push });
}
