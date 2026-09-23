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

type Fase =
  | "scelta"
  | "login_presenza"
  | "completa_nome"
  | "presenza_ok"
  | "non_membro"
  | "registrazione"
  | "inviato";

export default function PaginaPubblicaCantierePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [fase, setFase] = useState<Fase>("scelta");
  const [errore, setErrore] = useState<string | null>(null);

  const [sessioneAttiva, setSessioneAttiva] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [eMembro, setEMembro] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nomeImpresa, setNomeImpresa] = useState("");
  const [attivita, setAttivita] = useState("");
  const [ruolo, setRuolo] = useState("lavoratore");

  const [messaggioPresenza, setMessaggioPresenza] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const [personaInAttesa, setPersonaInAttesa] = useState<string | null>(null);
  const [nomeCompletamento, setNomeCompletamento] = useState("");
  const [cognomeCompletamento, setCognomeCompletamento] = useState("");

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
      setCantiere(data);

      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        setSessioneAttiva(true);
        setUserId(userData.user.id);

        const { data: profilo } = await supabase
          .from("profili")
          .select("autorita_controllo")
          .eq("id", userData.user.id)
          .maybeSingle();

        // Un'autorità di controllo (es. ispettore) non registra presenze:
        // va sempre dritta alla scheda del cantiere.
        if (profilo?.autorita_controllo) {
          router.push(`/cantieri/${data.id}`);
          return;
        }

        const { data: membro } = await supabase
          .from("cantiere_membri")
          .select("id")
          .eq("cantiere_id", data.id)
          .eq("profilo_id", userData.user.id)
          .maybeSingle();

        setEMembro(!!membro);
      }

      setCaricamento(false);
    }
    if (token) carica();
  }, [token]);

  async function registraPresenza(idPersona: string) {
    if (!cantiere) return;
    setInCorso(true);
    setErrore(null);

    const oggi = new Date().toISOString().slice(0, 10);

    const { data: esistente } = await supabase
      .from("presenze")
      .select("id, ora_ingresso, ora_uscita")
      .eq("cantiere_id", cantiere.id)
      .eq("profilo_id", idPersona)
      .eq("data", oggi)
      .maybeSingle();

    const ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

    if (!esistente) {
      const { error } = await supabase.from("presenze").insert({
        cantiere_id: cantiere.id,
        profilo_id: idPersona,
        data: oggi,
        ora_ingresso: new Date().toISOString(),
        metodo: "qr",
        registrato_da: idPersona,
      });
      if (error) {
        setErrore(error.message);
        setInCorso(false);
        return;
      }
      setMessaggioPresenza(`Ingresso registrato alle ${ora}. Buon lavoro!`);
    } else if (!esistente.ora_uscita) {
      const { error } = await supabase
        .from("presenze")
        .update({ ora_uscita: new Date().toISOString() })
        .eq("id", esistente.id);
      if (error) {
        setErrore(error.message);
        setInCorso(false);
        return;
      }
      setMessaggioPresenza(`Uscita registrata alle ${ora}. A presto!`);
    } else {
      const entrata = new Date(esistente.ora_ingresso).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const uscita = new Date(esistente.ora_uscita).toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setMessaggioPresenza(`Hai già registrato oggi: ingresso ${entrata}, uscita ${uscita}.`);
    }

    setInCorso(false);
    setFase("presenza_ok");
  }

  // Prima di registrare la presenza, verifica che l'account abbia già
  // Nome e Cognome compilati (servono per riconoscere la persona nel
  // registro del cantiere). Se mancano, li chiede una volta sola: le
  // volte successive non serve più, perché restano salvati sull'account.
  async function verificaEProcedi(idPersona: string) {
    const { data: profilo } = await supabase
      .from("profili")
      .select("nome, cognome")
      .eq("id", idPersona)
      .maybeSingle();

    if (profilo?.nome && profilo?.cognome) {
      registraPresenza(idPersona);
    } else {
      setNomeCompletamento(profilo?.nome ?? "");
      setCognomeCompletamento(profilo?.cognome ?? "");
      setPersonaInAttesa(idPersona);
      setFase("completa_nome");
    }
  }

  async function completaEProsegui(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    if (!personaInAttesa) return;

    if (!nomeCompletamento.trim() || !cognomeCompletamento.trim()) {
      setErrore("Inserisci nome e cognome.");
      return;
    }

    const { error } = await supabase
      .from("profili")
      .update({ nome: nomeCompletamento.trim(), cognome: cognomeCompletamento.trim() })
      .eq("id", personaInAttesa);

    if (error) {
      setErrore(error.message);
      return;
    }

    registraPresenza(personaInAttesa);
  }

  function premutoPresenza() {
    setErrore(null);
    if (sessioneAttiva && userId) {
      if (eMembro) {
        verificaEProcedi(userId);
      } else {
        setFase("non_membro");
      }
    } else {
      setFase("login_presenza");
    }
  }

  async function loginPerPresenza(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);

    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });

    if (loginErr || !loginData?.user || !loginData?.session) {
      setErrore("Email o password non corrette.");
      setInCorso(false);
      return;
    }

    await supabase.auth.setSession({
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
    });

    setSessioneAttiva(true);
    setUserId(loginData.user.id);

    const { data: membro } = await supabase
      .from("cantiere_membri")
      .select("id")
      .eq("cantiere_id", cantiere.id)
      .eq("profilo_id", loginData.user.id)
      .maybeSingle();

    setInCorso(false);

    if (membro) {
      setEMembro(true);
      verificaEProcedi(loginData.user.id);
    } else {
      setEMembro(false);
      setFase("non_membro");
    }
  }

  async function registrati(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!cantiere) return;

    const { error: signUpErr } = await supabase.auth.signUp({ email, password });

    if (signUpErr && !signUpErr.message.toLowerCase().includes("already registered")) {
      setErrore(signUpErr.message);
      return;
    }

    const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });

    if (loginErr || !loginData?.user || !loginData?.session) {
      setErrore(
        `Accesso non riuscito: ${loginErr?.message ?? "errore sconosciuto"}. Se hai già provato con questa email, verifica di usare la STESSA password del primo tentativo, oppure usa un'email nuova.`
      );
      return;
    }

    await supabase.auth.setSession({
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
    });

    const { data: sessioneCheck } = await supabase.auth.getSession();
    if (!sessioneCheck?.session) {
      setErrore("Sessione non attiva, riprova tra qualche secondo.");
      return;
    }

    const userId = loginData.user.id;

    await supabase.from("profili").upsert({ id: userId, email, ruolo: "impresa" });

    const { error: membroErr } = await supabase.from("cantiere_membri").insert({
      cantiere_id: cantiere.id,
      profilo_id: userId,
      ruolo,
      nome_impresa: nomeImpresa || null,
      attivita: attivita || null,
      stato: "in_attesa",
    });

    if (membroErr) {
      setErrore(`${membroErr.message} (codice: ${membroErr.code ?? "?"})`);
      return;
    }

    setFase("inviato");
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (!cantiere) return <p style={{ padding: 24 }}>Cantiere non trovato.</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1>{cantiere.nome}</h1>
      {cantiere.indirizzo && <p style={{ color: "#666" }}>{cantiere.indirizzo}</p>}

      {fase === "scelta" && (
        <>
          <p>Cosa vuoi fare?</p>
          <button
            onClick={premutoPresenza}
            disabled={inCorso}
            style={{
              width: "100%",
              padding: "22px 16px",
              marginBottom: 14,
              backgroundColor: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 20,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ✅ Registra Presenza
          </button>
          <button
            onClick={() => {
              setErrore(null);
              if (sessioneAttiva && eMembro) {
                router.push(`/cantieri/${cantiere.id}`);
              } else {
                setFase("registrazione");
              }
            }}
            style={{
              width: "100%",
              padding: "22px 16px",
              backgroundColor: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 20,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {sessioneAttiva && eMembro ? "📂 Vai al cantiere" : "🔑 Accedi al tuo account"}
          </button>
          {errore && <p style={{ color: "red", marginTop: 12 }}>{errore}</p>}
        </>
      )}

      {fase === "login_presenza" && (
        <>
          <p>Accedi per registrare la tua presenza.</p>
          <form onSubmit={loginPerPresenza}>
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
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            {errore && <p style={{ color: "red" }}>{errore}</p>}
            <button
              type="submit"
              disabled={inCorso}
              style={{
                width: "100%",
                padding: "14px 16px",
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {inCorso ? "Accesso..." : "Accedi e registra presenza"}
            </button>
          </form>
          <button
            onClick={() => setFase("scelta")}
            style={{ marginTop: 12, background: "none", border: "none", color: "#666", cursor: "pointer" }}
          >
            ← Indietro
          </button>
        </>
      )}

      {fase === "completa_nome" && (
        <>
          <p>Prima di registrare la presenza, completa il tuo nome (serve una sola volta, poi resta salvato).</p>
          <form onSubmit={completaEProsegui}>
            <div style={{ marginBottom: 8 }}>
              <input
                placeholder="Nome"
                value={nomeCompletamento}
                onChange={(e) => setNomeCompletamento(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <input
                placeholder="Cognome"
                value={cognomeCompletamento}
                onChange={(e) => setCognomeCompletamento(e.target.value)}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            {errore && <p style={{ color: "red" }}>{errore}</p>}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "14px 16px",
                backgroundColor: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Continua e registra presenza
            </button>
          </form>
        </>
      )}

      {fase === "presenza_ok" && (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <p style={{ fontSize: 18, fontWeight: 600 }}>{messaggioPresenza}</p>
        </div>
      )}

      {fase === "non_membro" && (
        <div>
          <p>Non risulti ancora membro approvato di questo cantiere, quindi non posso registrare la tua presenza.</p>
          <button
            onClick={() => setFase("registrazione")}
            style={{
              width: "100%",
              padding: "14px 16px",
              backgroundColor: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Richiedi accesso a questo cantiere
          </button>
        </div>
      )}

      {fase === "registrazione" && (
        <>
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
            <p style={{ fontSize: 12, color: "#888" }}>
              Registrandoti accetti il trattamento dei tuoi dati come descritto nella{" "}
              <a href="/privacy" target="_blank" style={{ color: "#1a73e8" }}>
                informativa privacy
              </a>
              .
            </p>
            <button type="submit" style={{ padding: "8px 16px" }}>
              Registrati e richiedi accesso
            </button>
          </form>
          <button
            onClick={() => setFase("scelta")}
            style={{ marginTop: 12, background: "none", border: "none", color: "#666", cursor: "pointer" }}
          >
            ← Indietro
          </button>
        </>
      )}

      {fase === "inviato" && (
        <div>
          <h2>Richiesta inviata</h2>
          <p>
            Controlla la tua email per confermare l'account. La tua richiesta di accesso al cantiere{" "}
            <strong>{cantiere.nome}</strong> è in attesa di approvazione da parte del responsabile del cantiere.
          </p>
        </div>
      )}
    </div>
  );
}
