import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const BUCKET = "diario-cantieri";
const MAX_BYTE = 4 * 1024 * 1024;
const TIPI_AMMESSI = ["image/jpeg", "image/png", "image/webp"];

// POST multipart (campi: cantiereId, file) -> carica una foto e restituisce il percorso
// POST json { azione: "urls", cantiereId, percorsi } -> link temporanei per vedere le foto
// POST json { azione: "rimuovi", cantiereId, percorsi } -> cancella foto dall'archivio
export async function POST(richiesta: NextRequest) {
  const intestazione = richiesta.headers.get("authorization") || "";
  const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!jwt) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const admin = creaClientSupabaseAdmin();
  const { data: utenteData } = await admin.auth.getUser(jwt);
  if (!utenteData?.user) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  // Client con i permessi di chi chiede: serve a verificare l'accesso al cantiere
  const comeUtente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  async function puoAccedere(cantiereId: string): Promise<boolean> {
    if (!cantiereId) return false;
    const { data } = await comeUtente.rpc("puo_gestire_attivita", { cid: cantiereId });
    return data === true;
  }
  const soloDelCantiere = (cantiereId: string, percorsi: unknown): string[] =>
    (Array.isArray(percorsi) ? percorsi : [])
      .map((p) => String(p))
      .filter((p) => p.startsWith(`${cantiereId}/`) && !p.includes(".."))
      .slice(0, 60);

  const tipoContenuto = richiesta.headers.get("content-type") || "";

  if (tipoContenuto.includes("multipart/form-data")) {
    const form = await richiesta.formData();
    const cantiereId = String(form.get("cantiereId") || "");
    const file = form.get("file");
    if (!(await puoAccedere(cantiereId))) {
      return NextResponse.json({ ok: false, errore: "Non hai accesso a questo cantiere" }, { status: 403 });
    }
    if (!(file instanceof File)) return NextResponse.json({ ok: false, errore: "File mancante" }, { status: 400 });
    if (!TIPI_AMMESSI.includes(file.type)) {
      return NextResponse.json({ ok: false, errore: "Sono ammesse solo foto JPG, PNG o WebP" }, { status: 400 });
    }
    if (file.size > MAX_BYTE) {
      return NextResponse.json({ ok: false, errore: "La foto supera i 4 MB" }, { status: 400 });
    }
    const estensione = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const casuale = Math.random().toString(36).slice(2, 8);
    const percorso = `${cantiereId}/${Date.now()}_${casuale}.${estensione}`;
    const { error } = await admin.storage.from(BUCKET).upload(percorso, await file.arrayBuffer(), {
      contentType: file.type,
    });
    if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, percorso });
  }

  let corpo: any = {};
  try {
    corpo = await richiesta.json();
  } catch {
    return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });
  }
  const cantiereId = String(corpo.cantiereId || "");
  if (!(await puoAccedere(cantiereId))) {
    return NextResponse.json({ ok: false, errore: "Non hai accesso a questo cantiere" }, { status: 403 });
  }
  const percorsi = soloDelCantiere(cantiereId, corpo.percorsi);

  if (corpo.azione === "urls") {
    if (percorsi.length === 0) return NextResponse.json({ ok: true, urls: {} });
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(percorsi, 600);
    if (error) return NextResponse.json({ ok: false, errore: error.message }, { status: 500 });
    const urls: Record<string, string> = {};
    (data || []).forEach((d: any) => {
      if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    });
    return NextResponse.json({ ok: true, urls });
  }

  if (corpo.azione === "rimuovi") {
    // Si cancellano solo le foto non più collegate a nessuna voce del diario
    const { data: voci } = await admin.from("diario_cantiere").select("foto").eq("cantiere_id", cantiereId);
    const ancoraUsate = new Set<string>();
    (voci || []).forEach((v: any) => (Array.isArray(v.foto) ? v.foto : []).forEach((p: string) => ancoraUsate.add(p)));
    const daCancellare = percorsi.filter((p) => !ancoraUsate.has(p));
    if (daCancellare.length > 0) await admin.storage.from(BUCKET).remove(daCancellare);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, errore: "Azione non valida" }, { status: 400 });
}
