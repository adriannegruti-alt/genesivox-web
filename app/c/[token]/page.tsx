"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const RUOLI = [
  { value: "impresa", label: "Impresa / Subappaltatore" },
  { value: "lavoratore", label: "Lavoratore" },
  { value: "capocantiere", label: "Capocantiere" },
  { value: "cse_csp", label: "CSE / CSP" },
  { value: "rspp", label: "RSPP" },
  { value: "asl_ispettorato", label: "ASL / Ispettorato" },
];

export default function PaginaPubblicaCantierePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [fase, setFase] = useState<"form" | "inviato" | "errore">("form");
  const [errore, setErrore] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nomeImpresa, setNomeImpresa] = useState("");
  const [attivita, setAttivita] = useState("");
  const [ruolo, setRuolo] = useState("lavoratore");

  useEffect(() => {
    async function carica() {
      // Ricerca sicura: restituisce SOLO il cantiere corrispondente a questo
      // codice QR, senza aprire l'intera tabella cantieri a chi non è loggato.
      const { data: risultati } = await supabase.rpc("cerca_cantiere_per_qr", { codice_qr: token });
      const data = risultati?.[0] ?? null;

      if (!data) {
        setCaricamento(false);
        return;
      }

      // Se sei già autenticato e hai accesso a questo cantiere
      // (autorità di controllo, o già membro/gestore), vai dritto alla scheda
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: profilo } = await supabase
          .from("profili")
          .select("autorita_controllo")
          .eq("id", userData.user.id)
          .maybeSingle();

        const { data: membro } = await supabase
          .from("cantiere_membri")
          .select("id")
          .eq("cantiere_id", data.id)
          .eq("profilo_id", userData.user.id)
          .maybeSingle();

        if (profilo?.autorita_controllo || membro) {
          router.push(`/cantieri/${data.id}`);
          return;
        }
      }

      setCantiere(data);
      setCaricamento(false);
    }
    if (token) carica();
  }, [token]);

  async function registrati(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!cantiere) return;

    // 1. Crea l'account
    const { error: signUpErr } = await supabase.auth.signUp({ email, password });

    if (signUpErr && !signUpErr.message.toLowerCase().includes("already registered")) {
      setErrore(signUpErr.message);
      return;
    }

    // 2. Forza sempre il login esplicito, per garantire che la sessione sia attiva
    //    prima di procedere (indipendentemente da cosa ha fatto signUp)
    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginErr || !loginData?.user || !loginData?.session) {
      setErrore(
        `Accesso non riuscito: ${loginErr?.message ?? "errore sconosciuto"}. Se hai già provato con questa email, verifica di usare la STESSA password del primo tentativo, oppure usa un'email nuova.`
      );
      return;
    }

    // Forza esplicitamente la sessione sul client, per garantire che le
    // richieste successive (insert su cantiere_membri) siano autenticate
    await supabase.auth.setSession({
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
    });

    // 3. Verifica esplicitamente che la sessione sia davvero presente lato client
    const { data: sessioneCheck } = await supabase.auth.getSession();
    if (!sessioneCheck?.session) {
      setErrore("Sessione non attiva, riprova tra qualche secondo.");
      return;
    }

    const userId = loginData.user.id;

    // 2. Crea/aggiorna il profilo
    await supabase.from("profili").upsert({ id: userId, email, ruolo: "impresa" });

    // 3. Richiesta di iscrizione al cantiere (stato: in attesa di approvazione)
    const { error: membroErr } = await supabase.from("cantiere_membri").insert({
      cantiere_id: cantiere.id,
      profilo_id: userId,
      ruolo,
      nome_impresa: nomeImpresa || null,
      attivita: attivita || null,
      stato: "in_attesa",
    });

    if (membroErr) {
      console.error("Errore completo cantiere_membri:", membroErr, {
        userId,
        cantiereId: cantiere.id,
        authUser: (await supabase.auth.getUser()).data.user?.id,
      });
      setErrore(`${membroErr.message} (codice: ${membroErr.code ?? "?"})`);
      return;
    }

    setFase("inviato");
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!cantiere) return <p style={{ padding: 24 }}>Cantiere non trovato.</p>;

  if (fase === "inviato") {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
        <h1>Richiesta inviata</h1>
        <p>
          Controlla la tua email per confermare l'account. La tua richiesta di accesso al
          cantiere <strong>{cantiere.nome}</strong> è in attesa di approvazione da parte del
          responsabile del cantiere.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1>{cantiere.nome}</h1>
      {cantiere.indirizzo && <p style={{ color: "#666" }}>{cantiere.indirizzo}</p>}
      <p>Registrati per accedere ai documenti di sicurezza di questo cantiere.</p>

      <form onSubmit={registrati}>
        <div style={{ marginBottom: 8 }}>
          <input
            type="email"
            placeholder="La tua email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            type="password"
            placeholder="Crea una password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Nome impresa"
            value={nomeImpresa}
            onChange={(e) => setNomeImpresa(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Attività svolta (es. idraulico, elettricista)"
            value={attivita}
            onChange={(e) => setAttivita(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <select value={ruolo} onChange={(e) => setRuolo(e.target.value)} style={{ width: "100%", padding: 8 }}>
            {RUOLI.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        <button type="submit" style={{ padding: "8px 16px" }}>
          Registrati e richiedi accesso
        </button>
      </form>
    </div>
  );
}
