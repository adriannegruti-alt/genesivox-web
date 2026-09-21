import { NextResponse } from "next/server";

// Questa route riceve la richiesta quando un preventivo viene approvato.
// Per ora NON invia ancora nessuna email: registra solo la richiesta.
// Domani, quando colleghiamo il servizio email (es. Resend), qui dentro
// aggiungeremo il codice che invia davvero il messaggio formale
// all'impresa che ha caricato il preventivo.

export async function POST(request: Request) {
  const body = await request.json();
  const { nomeImpresa, emailImpresa, cantiereId, preventivoId } = body || {};

  // TODO (domani): inviare email vera con Resend, usando emailImpresa.
  console.log("Preventivo approvato — notifica da inviare (email non ancora collegata):", {
    nomeImpresa,
    emailImpresa,
    cantiereId,
    preventivoId,
  });

  return NextResponse.json({
    inviata: false,
    messaggio: "Servizio email non ancora collegato.",
  });
}
