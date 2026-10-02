import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Indirizzo mittente per tutte le email inviate dalla piattaforma.
// Funziona perché il dominio genesivox.com è verificato su Resend,
// non serve una casella email reale per "notifiche@genesivox.com".
const MITTENTE = "GENESIVOX <notifiche@genesivox.com>";

export async function inviaEmail(
  destinatari: string | string[],
  oggetto: string,
  corpoHtml: string,
  copiaConoscenza?: string | string[]
): Promise<{ ok: boolean; errore?: string }> {
  try {
    const risultato = await resend.emails.send({
      from: MITTENTE,
      to: destinatari,
      cc: copiaConoscenza,
      subject: oggetto,
      html: corpoHtml,
    });

    if (risultato.error) {
      return { ok: false, errore: risultato.error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      errore: err instanceof Error ? err.message : "Errore sconosciuto nell'invio email",
    };
  }
}
