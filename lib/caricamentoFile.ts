// Funzioni condivise usate ovunque nel sito si carichi un file (Documenti,
// Preventivi, ecc.): comprimono le foto prima di caricarle, controllano che
// il tipo e la dimensione siano ammessi, e controllano che il file non
// contenga virus.

// Formati accettati: PDF, immagini comuni, documenti Office, testo.
// Qualsiasi altra estensione (es. .exe, .bat, .js, .zip) viene rifiutata.
export const ESTENSIONI_CONSENTITE = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
];

// Vercel (dove gira il sito) limita a 4,5 MB i file che passano dal nostro
// controllo antivirus: restiamo sotto quel tetto per sicurezza.
export const DIMENSIONE_MASSIMA_MB = 4;

// Da usare nell'attributo "accept" degli input file, per filtrare già
// nella finestra di selezione del telefono/computer.
export const ACCEPT_INPUT_FILE = ESTENSIONI_CONSENTITE.map((e) => "." + e).join(",");

/**
 * Controlla che il file abbia un'estensione ammessa e non superi la
 * dimensione massima. Va chiamata PRIMA di caricare qualsiasi file.
 */
export function validaFile(file: File): { valido: boolean; errore?: string } {
  const estensione = file.name.split(".").pop()?.toLowerCase() || "";

  if (!ESTENSIONI_CONSENTITE.includes(estensione)) {
    return {
      valido: false,
      errore: `Tipo di file non ammesso (.${estensione || "sconosciuto"}). Sono accettati: PDF, immagini (JPG, PNG, ecc.), Word, Excel, PowerPoint, testo.`,
    };
  }

  if (file.size > DIMENSIONE_MASSIMA_MB * 1024 * 1024) {
    const pesoMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      valido: false,
      errore: `Il file è troppo grande (${pesoMB} MB). Il massimo consentito è ${DIMENSIONE_MASSIMA_MB} MB.`,
    };
  }

  return { valido: true };
}

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
