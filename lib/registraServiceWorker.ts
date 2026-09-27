export function registraServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Se la registrazione fallisce (browser non supportato, ecc.),
      // l'app continua a funzionare normalmente online: non blocchiamo nulla.
    });
  });
}
