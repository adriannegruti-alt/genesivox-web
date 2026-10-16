import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Chi può creare account lavoratore
const RUOLI_AMMESSI = ["admin", "impresa", "impresa_edile"];

// Gira SOLO sul server: usa la chiave "service role" di Supabase, che può creare utenti.
// Per questo prima controlla chi sta chiamando.
export async function POST(request: NextRequest) {
  try {
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

    // 1. Serve un utente loggato
    const intestazione = request.headers.get("authorization") || "";
    const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
    if (!jwt) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

    const { data: chiamante } = await supabaseAdmin.auth.getUser(jwt);
    if (!chiamante?.user) return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });

    // 2. Con un ruolo abilitato
    const { data: profiloChiamante } = await supabaseAdmin
      .from("profili")
      .select("ruolo")
      .eq("id", chiamante.user.id)
      .maybeSingle();
    if (!profiloChiamante || !RUOLI_AMMESSI.includes(profiloChiamante.ruolo)) {
      return NextResponse.json({ error: "Non hai i permessi per creare lavoratori." }, { status: 403 });
    }

    // 3. Dati richiesti
    const body = await request.json();
    const { email, password, nome, cognome, nomeUtente, impresa, attivita } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email e password sono obbligatorie." }, { status: 400 });
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Email non valida." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "La password deve avere almeno 8 caratteri." }, { status: 400 });
    }

    // 4. Crea l'utente con email già confermata: può accedere subito
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

    // 5. Completa il profilo come lavoratore gratuito
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
