import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Salva (o aggiorna) l'iscrizione alle notifiche push di un dispositivo,
// collegandola all'utente che sta usando l'app in questo momento.
export async function POST(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  const intestazione = richiesta.headers.get("authorization") || "";
  const token = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const { data: utenteData } = await admin.auth.getUser(token);
  const utente = utenteData?.user;
  if (!utente) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  let endpoint = "";
  let p256dh = "";
  let auth = "";
  try {
    const corpo = await richiesta.json();
    const s = corpo.sottoscrizione;
    endpoint = String(s?.endpoint || "");
    p256dh = String(s?.keys?.p256dh || "");
    auth = String(s?.keys?.auth || "");
  } catch {
    // corpo non valido: gestito sotto
  }
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });
  }

  const { error } = await admin
    .from("sottoscrizioni_push")
    .upsert({ profilo_id: utente.id, endpoint, p256dh, auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// Scollega un dispositivo (chiamato quando l'utente preme "Esci").
// Non serve il login: l'indirizzo del dispositivo è lungo e non indovinabile,
// e al peggio il dispositivo smette di ricevere avvisi finché non rientri.
export async function DELETE(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  let endpoint = "";
  try {
    const corpo = await richiesta.json();
    endpoint = String(corpo.endpoint || "");
  } catch {
    // corpo non valido: gestito sotto
  }
  if (!endpoint.startsWith("https://")) {
    return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });
  }

  const { error } = await admin.from("sottoscrizioni_push").delete().eq("endpoint", endpoint);
  if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
