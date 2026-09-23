import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Controlla un file caricato tramite il servizio antivirus Cloudmersive,
// prima che venga salvato su Supabase. Per sicurezza: se il controllo non
// può essere completato per qualsiasi motivo (chiave mancante, servizio
// irraggiungibile, errore di rete), il file NON viene considerato sicuro
// e il caricamento viene bloccato — meglio bloccare un caricamento in più
// che rischiare di far passare un file infetto.
export async function POST(request: Request) {
  const chiaveApi = process.env.CLOUDMERSIVE_API_KEY;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ errore: "Nessun file ricevuto." }, { status: 400 });
  }

  if (!chiaveApi) {
    return NextResponse.json({ pulito: false, verificato: false });
  }

  try {
    const inoltro = new FormData();
    inoltro.append("inputFile", file, file.name);

    const risposta = await fetch("https://api.cloudmersive.com/virus/scan/file", {
      method: "POST",
      headers: { Apikey: chiaveApi },
      body: inoltro,
    });

    if (!risposta.ok) {
      return NextResponse.json({ pulito: false, verificato: false });
    }

    const risultato = await risposta.json();
    return NextResponse.json({
      pulito: !!risultato.CleanResult,
      verificato: true,
    });
  } catch {
    return NextResponse.json({ pulito: false, verificato: false });
  }
}
