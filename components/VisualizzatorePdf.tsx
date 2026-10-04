"use client";

import { useEffect, useRef, useState } from "react";

// Visualizza un PDF pagina per pagina disegnandolo su <canvas>, invece di
// affidarci al lettore PDF nativo del browser — su Android Chrome l'anteprima
// nativa dentro un iframe spesso non funziona e il telefono apre un'altra
// app (es. Note) invece di mostrare il disegno.
export default function VisualizzatorePdf({ url, zoom }: { url: string; zoom: number }) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;

    async function disegna() {
      setCaricamento(true);
      setErroreLocale(null);
      try {
        const pdfjsLib: any = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

        const documento = await pdfjsLib.getDocument(url).promise;
        if (annullato || !contenitoreRef.current) return;
        contenitoreRef.current.innerHTML = "";

        for (let numeroPagina = 1; numeroPagina <= documento.numPages; numeroPagina++) {
          const pagina = await documento.getPage(numeroPagina);
          const viewport = pagina.getViewport({ scale: zoom * 1.5 });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.marginBottom = "12px";
          canvas.style.backgroundColor = "#fff";

          const contesto = canvas.getContext("2d")!;
          await pagina.render({ canvasContext: contesto, viewport }).promise;

          if (annullato || !contenitoreRef.current) return;
          contenitoreRef.current.appendChild(canvas);
        }
      } catch (err) {
        if (!annullato) setErroreLocale("Non riesco a mostrare questo PDF.");
      } finally {
        if (!annullato) setCaricamento(false);
      }
    }

    disegna();
    return () => {
      annullato = true;
    };
  }, [url, zoom]);

  return (
    <div>
      {caricamento && <p style={{ color: "#fff" }}>Apertura del disegno...</p>}
      {erroreLocale && <p style={{ color: "#ff8a8a" }}>{erroreLocale}</p>}
      <div ref={contenitoreRef} />
    </div>
  );
}
