"use client";

import { useEffect, useState } from "react";

// Striscia di avviso in cima alla pagina quando il dispositivo è offline,
// così chi usa la tablet in cantiere sa che sta vedendo dati salvati in
// precedenza e non l'ultima versione dal server.
export default function BannerOffline() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const segnaOnline = () => setOffline(false);
    const segnaOffline = () => setOffline(true);
    window.addEventListener("online", segnaOnline);
    window.addEventListener("offline", segnaOffline);
    return () => {
      window.removeEventListener("online", segnaOnline);
      window.removeEventListener("offline", segnaOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      style={{
        backgroundColor: "#fff3cd",
        color: "#8a6d00",
        padding: "8px 16px",
        textAlign: "center",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      ⚠ Sei offline — stai vedendo i dati salvati in precedenza su questo dispositivo.
    </div>
  );
}
