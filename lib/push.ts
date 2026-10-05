import webpush from "web-push";

type Contenuto = { titolo: string; testo: string; url: string };

let configurato = false;

function configura(): boolean {
  if (configurato) return true;
  const chiavePubblica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const chiavePrivata = process.env.VAPID_PRIVATE_KEY;
  const contatto = process.env.VAPID_SUBJECT;
  if (!chiavePubblica || !chiavePrivata || !contatto) return false;
  webpush.setVapidDetails(contatto, chiavePubblica, chiavePrivata);
  configurato = true;
  return true;
}

// Invia una notifica push a tutti i dispositivi iscritti delle persone indicate.
// Non solleva mai errori: se qualcosa va storto, l'email è già partita comunque.
export async function inviaPush(admin: any, profiloIds: string[], contenuto: Contenuto): Promise<number> {
  try {
    if (profiloIds.length === 0 || !configura()) return 0;

    const { data } = await admin
      .from("sottoscrizioni_push")
      .select("id, endpoint, p256dh, auth")
      .in("profilo_id", profiloIds);
    const righe = (data || []) as any[];

    let inviate = 0;
    const daEliminare: string[] = [];

    await Promise.all(
      righe.map(async (riga) => {
        try {
          await webpush.sendNotification(
            { endpoint: riga.endpoint, keys: { p256dh: riga.p256dh, auth: riga.auth } },
            JSON.stringify(contenuto),
            { TTL: 86400 }
          );
          inviate++;
        } catch (errore: any) {
          // 404/410 = il dispositivo non esiste più: lo togliamo dall'elenco
          if (errore?.statusCode === 404 || errore?.statusCode === 410) daEliminare.push(riga.id);
        }
      })
    );

    if (daEliminare.length > 0) {
      await admin.from("sottoscrizioni_push").delete().in("id", daEliminare);
    }
    return inviate;
  } catch {
    return 0;
  }
}
