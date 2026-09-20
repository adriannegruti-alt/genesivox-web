import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Questa funzione gira SOLO sul server (mai nel browser), quindi può usare
// la chiave "service role" di Supabase, che ha il permesso di creare
// utenti direttamente — cosa che il sito pubblico non può fare da solo.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, nome, cognome, nomeUtente, impresa, attivita } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email e password sono obbligatorie." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "La password deve avere almeno 6 caratteri." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const chiaveServizio = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!chiaveServizio) {
      return NextResponse.json(
        { error: "Configurazione mancante sul server (SUPABASE_SERVICE_ROLE_KEY). Contatta l'amministratore." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, chiaveServizio, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Crea l'utente in Supabase Auth, con email già confermata: può accedere subito.
    const { data: nuovoUtente, error: erroreCreazione } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (erroreCreazione || !nuovoUtente?.user) {
      return NextResponse.json(
        { error: erroreCreazione?.message || "Impossibile creare l'account." },
        { status: 400 }
      );
    }

    const nomeCompleto = [nome, cognome].filter(Boolean).join(" ");

    // Completa il profilo come lavoratore gratuito: nessun piano collegato,
    // ruolo "lavoratore" (vede solo i cantieri a cui viene assegnato).
    const { error: erroreProfilo } = await supabaseAdmin
      .from("profili")
      .update({
        ruolo: "lavoratore",
        nome_utente: nomeUtente || nomeCompleto || null,
        impresa: impresa || null,
        attivita_base: attivita || null,
        piano_id: null,
      })
      .eq("id", nuovoUtente.user.id);

    if (erroreProfilo) {
      return NextResponse.json({ error: erroreProfilo.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Errore imprevisto." }, { status: 500 });
  }
}
