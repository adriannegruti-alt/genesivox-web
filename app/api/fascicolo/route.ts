import { NextRequest, NextResponse } from "next/server";
import { creaClientSupabaseAdmin } from "@/lib/supabaseAdmin";
import { inviaEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const APP_URL = "https://app.genesivox.com";

// Solo i documenti "dell'azienda", validi per qualsiasi cantiere. Restano fuori quelli che riguardano
// un cantiere preciso (POS, PiMUS, contratti di subappalto, congruità...) perché mostrerebbero ad altri
// committenti informazioni su cantieri non loro. I nomi devono coincidere con tipi_documento.nome.
const DOCUMENTI_FASCICOLO = [
  "Visura camerale",
  "DURC",
  "DVR",
  "Nomina RSPP",
  "Nomina RLS",
  "Nomina Medico Competente",
];

function esc(testo: string): string {
  return testo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escLike(testo: string): string {
  return testo.replace(/[\\%_]/g, "\\$&");
}

// Azioni (campo "azione" del corpo):
// - "condivisi":  elenco delle imprese che hanno condiviso il fascicolo con chi chiede
// - "fascicolo":  documenti dell'impresa (ultima versione di ogni tipo), se condiviso con chi chiede
// - "apri":       link temporaneo (60 secondi) per aprire un singolo documento
// - "avvisa":     email al destinatario quando l'impresa gli dà accesso (solo se ha già un account)
export async function POST(richiesta: NextRequest) {
  const admin = creaClientSupabaseAdmin();

  const intestazione = richiesta.headers.get("authorization") || "";
  const jwt = intestazione.startsWith("Bearer ") ? intestazione.slice(7) : "";
  if (!jwt) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });

  const { data: utenteData } = await admin.auth.getUser(jwt);
  const utente = utenteData?.user;
  if (!utente || !utente.email) return NextResponse.json({ ok: false, errore: "Non autorizzato" }, { status: 401 });
  const mioEmail = utente.email.trim().toLowerCase();

  let corpo: any = {};
  try {
    corpo = await richiesta.json();
  } catch {
    return NextResponse.json({ ok: false, errore: "Richiesta non valida" }, { status: 400 });
  }
  const azione = String(corpo.azione || "");

  // Verifica che l'impresa abbia condiviso il fascicolo con chi sta chiedendo
  async function haAccesso(impresaId: string): Promise<boolean> {
    if (impresaId === utente!.id) return true; // l'impresa vede il proprio
    const { data } = await admin
      .from("condivisioni_fascicolo")
      .select("id")
      .eq("impresa_id", impresaId)
      .ilike("email_destinatario", escLike(mioEmail))
      .limit(1);
    return !!data && data.length > 0;
  }

  // Nomi dei documenti "di impresa" (gli unici che il fascicolo condivide)
  async function nomiDocumentiImpresa(): Promise<string[]> {
    return DOCUMENTI_FASCICOLO;
  }

  if (azione === "condivisi") {
    const { data: righe } = await admin
      .from("condivisioni_fascicolo")
      .select("impresa_id, creato_il")
      .ilike("email_destinatario", escLike(mioEmail));
    const ids = Array.from(new Set((righe || []).map((r: any) => r.impresa_id as string)));
    if (ids.length === 0) return NextResponse.json({ ok: true, imprese: [] });
    const { data: profili } = await admin.from("profili").select("id, impresa, email").in("id", ids);
    const imprese = (profili || []).map((p: any) => ({
      id: p.id,
      nome: p.impresa || p.email,
    }));
    return NextResponse.json({ ok: true, imprese });
  }

  if (azione === "fascicolo") {
    const impresaId = String(corpo.impresaId || "");
    if (!impresaId || !(await haAccesso(impresaId))) {
      return NextResponse.json({ ok: false, errore: "Non hai accesso a questo fascicolo" }, { status: 403 });
    }
    const nomi = await nomiDocumentiImpresa();
    if (nomi.length === 0) return NextResponse.json({ ok: true, documenti: [] });

    const { data: docs } = await admin
      .from("documenti")
      .select("id, tipo_documento, nome_file, data_scadenza, creato_il")
      .eq("profilo_id", impresaId)
      .in("tipo_documento", nomi)
      .order("creato_il", { ascending: false });

    // Una sola riga per tipo di documento: l'ultima versione caricata
    const perTipo = new Map<string, any>();
    for (const d of docs || []) {
      if (!perTipo.has(d.tipo_documento)) perTipo.set(d.tipo_documento, d);
    }
    const documenti = Array.from(perTipo.values()).sort((a, b) =>
      String(a.tipo_documento).localeCompare(String(b.tipo_documento), "it")
    );
    return NextResponse.json({ ok: true, documenti });
  }

  if (azione === "apri") {
    const documentoId = String(corpo.documentoId || "");
    const { data: doc } = await admin
      .from("documenti")
      .select("id, profilo_id, tipo_documento, storage_path")
      .eq("id", documentoId)
      .maybeSingle();
    if (!doc || !(await haAccesso(doc.profilo_id))) {
      return NextResponse.json({ ok: false, errore: "Non hai accesso a questo documento" }, { status: 403 });
    }
    const nomi = await nomiDocumentiImpresa();
    if (!nomi.includes(doc.tipo_documento)) {
      return NextResponse.json({ ok: false, errore: "Documento non condivisibile" }, { status: 403 });
    }
    const { data: firmato, error } = await admin.storage.from("documenti-cantieri").createSignedUrl(doc.storage_path, 60);
    if (error || !firmato) return NextResponse.json({ ok: false, errore: "File non disponibile" }, { status: 500 });
    return NextResponse.json({ ok: true, url: firmato.signedUrl });
  }

  if (azione === "avvisa") {
    const destinatario = String(corpo.email || "").trim().toLowerCase();
    if (!destinatario) return NextResponse.json({ ok: false, errore: "Email mancante" }, { status: 400 });

    // L'avviso parte solo se la condivisione esiste davvero ed è tua
    const { data: cond } = await admin
      .from("condivisioni_fascicolo")
      .select("id")
      .eq("impresa_id", utente.id)
      .ilike("email_destinatario", escLike(destinatario))
      .limit(1);
    if (!cond || cond.length === 0) return NextResponse.json({ ok: false, errore: "Condivisione non trovata" }, { status: 404 });

    // Scriviamo solo a chi ha già un account: niente email a indirizzi sconosciuti
    const { data: dest } = await admin.from("profili").select("id").ilike("email", escLike(destinatario)).limit(1);
    if (!dest || dest.length === 0) {
      return NextResponse.json({ ok: true, inviata: false, motivo: "La persona non ha ancora un account GENESIVOX: avrà accesso appena ne crea uno con questa email." });
    }

    const { data: imp } = await admin.from("profili").select("impresa, email").eq("id", utente.id).maybeSingle();
    const nome = imp?.impresa || imp?.email || "Un'impresa";
    const esito = await inviaEmail(
      destinatario,
      `${nome} ha condiviso con te il suo fascicolo aziendale`,
      `<div style="font-family:sans-serif;max-width:560px">
        <p><strong>${esc(nome)}</strong> ti ha dato accesso ai documenti della sua impresa su GENESIVOX.</p>
        <p><a href="${APP_URL}/fascicolo">Apri il fascicolo</a></p>
        <p style="color:#666;font-size:13px">L'accesso può essere revocato dall'impresa in qualsiasi momento.</p>
      </div>`
    );
    return NextResponse.json({ ok: true, inviata: esito.ok, motivo: esito.ok ? "" : esito.errore || "invio non riuscito" });
  }

  return NextResponse.json({ ok: false, errore: "Azione non valida" }, { status: 400 });
}
