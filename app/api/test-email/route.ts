import { NextResponse } from "next/server";
import { inviaEmail } from "@/lib/email";

export async function GET() {
  const risultato = await inviaEmail(
    "adrian.negruti@gmail.com",
    "Test email GENESIVOX",
    "<p>Questa è una email di prova per verificare che l'invio funzioni correttamente tramite Resend.</p>"
  );

  return NextResponse.json(risultato);
}
