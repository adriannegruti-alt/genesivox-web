import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const URL_APP = "https://app.genesivox.com";

function escapeHtml(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Solo un amministratore può creare il login di un cliente la cui richiesta è stata approvata.
// Crea l'utente (senza password) e gli invia da notifiche@genesivox.com il link per sceglierla.
export async function POST(request: NextRequest) {
  try {
    const admin = creaClientSupabaseAdmin();

    // 1. Serve un utente loggato
    const intestazione = request.headers.get("authorization") || "";
    const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
    if (!jwt) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
    const { data: chiamante } = await admin.auth.getUser(jwt);
    if (!chiamante?.user) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

    // 2. ...che sia amministratore
    const { data: profiloChiamante } = await admin
      .from("profili")
      .select("ruolo")
      .eq("id", chiamante.user.id)
      .maybeSingle();
    if (profiloChiamante?.ruolo !== "admin") {
      return NextResponse.json({ error: "Solo un amministratore può farlo." }, { status: 403 });
    }

    // 3. Dati
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const nome = String(body?.nome || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email non valida." }, { status: 400 });
    }

    // 4. Se il login esiste già non fa nulla
    const { data: esistente } = await admin.from("profili").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
    if (esistente) return NextResponse.json({ ok: true, esistente: true, emailInviata: false });

    // 5. Crea l'utente, già confermato e senza password (la sceglie il cliente)
    const { error: erroreCreazione } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (erroreCreazione) {
      return NextResponse.json({ error: erroreCreazione.message }, { status: 400 });
    }

    // 6. Link per scegliere la password + email in italiano
    let emailInviata = false;
    const { data: link } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${URL_APP}/reimposta-password` },
    });
    const azione = link?.properties?.action_link;
    if (azione) {
      const saluto = nome ? `Gentile ${escapeHtml(nome)},` : "Buongiorno,";
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:520px;color:#14202B">
          <h2>Il tuo account GENESIVOX è pronto</h2>
          <p>${saluto}</p>
          <p>abbiamo approvato la tua richiesta. Per attivare l'account scegli la tua password cliccando qui:</p>
          <p><a href="${azione}" style="display:inline-block;background:#19D3F0;color:#0B1B33;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Scegli la tua password</a></p>
          <p>Poi accedi da <a href="${URL_APP}/login">app.genesivox.com</a> con questa email e la password scelta.</p>
          <p>Se il pulsante non funziona o il link è scaduto, apri la pagina di accesso e premi "Password dimenticata?".</p>
          <p>Il team GENESIVOX</p>
        </div>`;
      const esito = await inviaEmail(email, "Il tuo account GENESIVOX è pronto", html);
      emailInviata = !!esito.ok;
    }

    return NextResponse.json({ ok: true, creato: true, emailInviata });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Errore imprevisto." }, { status: 500 });
  }
}
