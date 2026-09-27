"use client";

import { useEffect } from "react";
import { registraServiceWorker } from "@/lib/registraServiceWorker";

// Componente "invisibile": non mostra nulla, serve solo ad attivare il
// service worker (per l'app shell offline) quando la pagina si carica.
export default function RegistraPWA() {
  useEffect(() => {
    registraServiceWorker();
  }, []);

  return null;
}
