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

  // 4. Che livello di accesso ha chi chiede?
  const proprietario = lav.impresa_id === utente.id;
  const { data: livello } = await admin.rpc("livello_accesso_lavoratore", {
    p_lavoratore: lav.id,
    p_utente: utente.id,
  });
  if (livello !== "completo" && livello !== "cantiere") {
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
      .select("id, categoria, file_path")
      .eq("id", documentoId)
      .eq("lavoratore_id", lav.id)
      .maybeSingle();
    if (!doc) return NextResponse.json({ ok: false, errore: "Documento non trovato" }, { status: 404 });

    // Il file dell'idoneità sanitaria è riservato a datore di lavoro e autorità di controllo
    if (doc.categoria === "idoneita_sanitaria" && livello !== "completo") {
      return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 403 });
    }
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
      ruolo: livello === "completo" ? "autorita_controllo" : "cantiere",
    });
  }

  return NextResponse.json({ ok: true, url: firmato.signedUrl });
}
