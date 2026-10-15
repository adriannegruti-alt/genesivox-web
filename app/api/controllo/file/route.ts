import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  // 1. Serve un utente loggato
  const intestazione = richiesta.headers.get("authorization") || "";
  const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!jwt) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const { data: utenteData } = await admin.auth.getUser(jwt);
  const utente = utenteData?.user;
  if (!utente) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  // 2. Cosa viene chiesto
  let tokenQr = "";
  let documentoId = "";
  let foto = false;
  try {
    const corpo = await richiesta.json();
    tokenQr = String(corpo.token || "");
    documentoId = String(corpo.documentoId || "");
    foto = corpo.foto === true;
  } catch {
    // corpo non valido: gestito sotto
  }
  if (!tokenQr || (!foto && !documentoId)) {
    return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });
  }

  // 3. Il lavoratore esiste?
  const { data: lav } = await admin
    .from("lavoratori")
    .select("id, impresa_id, foto_path")
    .eq("qr_token", tokenQr)
    .maybeSingle();
  if (!lav) return NextResponse.json({ ok: false, errore: "Non trovato" }, { status: 404 });

  // 4. Chi chiede può vedere? Datore di lavoro (proprietario) o autorità di controllo
  const proprietario = lav.impresa_id === utente.id;
  let autorita = false;
  if (!proprietario) {
    const { data: profilo } = await admin
      .from("profili")
      .select("autorita_controllo")
      .eq("id", utente.id)
      .maybeSingle();
    autorita = !!profilo?.autorita_controllo;
  }
  if (!proprietario && !autorita) {
    return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 403 });
  }

  // 5. Quale file
  let bucket = "";
  let percorso: string | null = null;
  let idDocumento: string | null = null;

  if (foto) {
    bucket = "foto-lavoratori";
    percorso = lav.foto_path;
  } else {
    const { data: doc } = await admin
      .from("documenti_lavoratore")
      .select("id, file_path")
      .eq("id", documentoId)
      .eq("lavoratore_id", lav.id)
      .maybeSingle();
    if (!doc) return NextResponse.json({ ok: false, errore: "Documento non trovato" }, { status: 404 });
    bucket = "documenti-lavoratori";
    percorso = doc.file_path;
    idDocumento = doc.id;
  }
  if (!percorso) return NextResponse.json({ ok: false, errore: "File non presente" }, { status: 404 });

  // 6. Link valido solo 2 minuti
  const { data: firmato, error } = await admin.storage.from(bucket).createSignedUrl(percorso, 120);
  if (error || !firmato) return NextResponse.json({ ok: false, errore: "Errore nel file" }, { status: 500 });

  // 7. Registro l'apertura del documento (non quella del datore di lavoro, né la foto)
  if (!proprietario && !foto) {
    await admin.from("accessi_documenti").insert({
      lavoratore_id: lav.id,
      documento_id: idDocumento,
      utente_id: utente.id,
      motivo: "file",
      ruolo: "autorita_controllo",
    });
  }

  return NextResponse.json({ ok: true, url: firmato.signedUrl });
}
