"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registraServiceWorker } from "@/lib/registraServiceWorker";

// Componente "invisibile": attiva il service worker e, ad ogni cambio
// di pagina, chiede in background di salvarla in cache — necessario
// perché la navigazione interna dell'app (click sui link) non genera
// mai una richiesta "vera" che il service worker possa intercettare da solo.
export default function RegistraPWA() {
  const percorsoAttuale = usePathname();

  useEffect(() => {
    registraServiceWorker();
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    if (!percorsoAttuale) return;
    fetch(percorsoAttuale, { method: "GET" }).catch(() => {
      // Se la richiesta fallisce (es. offline), non è un problema:
      // semplicemente quella pagina non verrà aggiornata in cache ora.
    });
  }, [percorsoAttuale]);

  return null;
}
