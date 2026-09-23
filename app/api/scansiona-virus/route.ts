import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Controlla un file caricato tramite il servizio antivirus Cloudmersive,
// prima che venga salvato su Supabase. Finché la chiave CLOUDMERSIVE_API_KEY
// non è impostata su Vercel, il controllo viene semplicemente saltato
// (il file passa, ma segnato come "non verificato") — così questa funzione
// non blocca mai i caricamenti finché non colleghiamo davvero il servizio.
export async function POST(request: Request) {
  const chiaveApi = process.env.CLOUDMERSIVE_API_KEY;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ errore: "Nessun file ricevuto." }, { status: 400 });
  }

  if (!chiaveApi) {
    return NextResponse.json({ pulito: true, verificato: false });
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
      // Se il servizio antivirus non risponde, non blocchiamo il lavoro
      // del cantiere: lasciamo passare, ma segnaliamo "non verificato".
      return NextResponse.json({ pulito: true, verificato: false });
    }

    const risultato = await risposta.json();
    return NextResponse.json({
      pulito: !!risultato.CleanResult,
      verificato: true,
    });
  } catch {
    return NextResponse.json({ pulito: true, verificato: false });
  }
}
