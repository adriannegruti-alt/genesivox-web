// Funzioni condivise usate ovunque nel sito si carichi un file (Documenti,
// Preventivi, ecc.): comprimono le foto prima di caricarle, e controllano
// che il file non contenga virus.

/**
 * Se il file è un'immagine, la ridimensiona e la comprime (qualità JPEG),
 * per farla pesare molto meno senza perdita visibile. I PDF e altri
 * formati non vengono toccati. Se qualcosa va storto, restituisce il
 * file originale (non blocca mai il caricamento).
 */
export async function comprimiImmagine(file: File, latoMassimo = 1600, qualita = 0.75): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    if (width > latoMassimo || height > latoMassimo) {
      const scala = latoMassimo / Math.max(width, height);
      width = Math.round(width * scala);
      height = Math.round(height * scala);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualita));
    if (!blob || blob.size >= file.size) return file;

    const nomeCompresso = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nomeCompresso, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Manda il file al nostro server per un controllo antivirus, prima di
 * caricarlo su Supabase. Per sicurezza, se il controllo non può essere
 * completato per qualsiasi motivo (servizio non raggiungibile, errore di
 * rete, ecc.) il file viene considerato NON sicuro: meglio bloccare un
 * caricamento in più che rischiare di far passare qualcosa di infetto.
 */
export async function verificaAntivirus(file: File): Promise<{ pulito: boolean; verificato: boolean }> {
  try {
    const datiForm = new FormData();
    datiForm.append("file", file);

    const risposta = await fetch("/api/scansiona-virus", { method: "POST", body: datiForm });
    if (!risposta.ok) return { pulito: false, verificato: false };

    const risultato = await risposta.json();
    return { pulito: !!risultato.pulito, verificato: !!risultato.verificato };
  } catch {
    return { pulito: false, verificato: false };
  }
}
