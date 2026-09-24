"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

// Ruoli selezionabili qui: Committente e Impresa edile NON ci sono più,
// perché ora si ottengono solo tramite richiesta + approvazione
// (pagina della persona in "Imprese e subappaltatori" -> "Richieste di ruolo").
const RUOLI = [
  { value: "cse_csp", label: "CSE / CSP" },
  { value: "rspp", label: "RSPP" },
  { value: "capocantiere", label: "Capocantiere" },
  { value: "preposto", label: "Preposto" },
  { value: "impresa", label: "Impresa" },
  { value: "lavoratore", label: "Lavoratore" },
  { value: "asl_ispettorato", label: "ASL / Ispettorato" },
];

// Solo per MOSTRARE correttamente l'etichetta di una persona che ha già
// (da prima, o perché sei admin) il ruolo Committente/Impresa edile.
const ETICHETTE_TUTTI_I_RUOLI: Record<string, string> = {
  committente: "Committente",
  impresa_edile: "Impresa edile",
  ...Object.fromEntries(RUOLI.map((r) => [r.value, r.label])),
};

type Membro = {
  id: string;
  ruolo: string;
  nome_impresa: string | null;
  attivita: string | null;
  profili: { email: string; impresa: string | null } | null;
};

function impresaVisualizzata(m: Membro): string {
  return m.nome_impresa || m.profili?.impresa || "—";
}

export default function CantiereDettaglioPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [emailNuovo, setEmailNuovo] = useState("");
  const [ruoloNuovo, setRuoloNuovo] = useState("lavoratore");
  const [nomeImpresaNuovo, setNomeImpresaNuovo] = useState("");
  const [attivitaNuovo, setAttivitaNuovo] = useState("");
  const [impresaModificataAMano, setImpresaModificataAMano] = useState(false);
  const [attivitaModificataAMano, setAttivitaModificataAMano] = useState(false);
  const [ricercaAutocompletamento, setRicercaAutocompletamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const [modificaId, setModificaId] = useState<string | null>(null);
  const [ruoloModifica, setRuoloModifica] = useState("");
  const [nomeImpresaModifica, setNomeImpresaModifica] = useState("");
  const [attivitaModifica, setAttivitaModifica] = useState("");

  const [erroreCaricamento, setErroreCaricamento] = useState<string | null>(null);

  // Quando si scrive l'email e si esce dal campo, recupera impresa e attività
  // con cui quella persona si era già registrata (dal suo account o da un
  // altro cantiere), per non doverle reinserire a mano se non serve.
  async function autocompletaDaEmail() {
    if (!emailNuovo) return;

    const { data: risultati } = await supabase.rpc("cerca_profilo_per_email", {
      email_ricerca: emailNuovo.trim(),
    });
    const profilo = risultati?.[0];

    if (!profilo) return;

    setRicercaAutocompletamento(true);

    if (profilo.impresa && !impresaModificataAMano) {
      setNomeImpresaNuovo(profilo.impresa);
    }

    if (!attivitaModificataAMano) {
      // Priorità 1: attività di base impostata dall'utente in Impostazioni account.
      // Priorità 2 (solo se non l'ha impostata): l'ultima attività usata in un altro cantiere.
      if (profilo.attivita_base) {
        setAttivitaNuovo(profilo.attivita_base);
      } else {
        const { data: ultimoMembro } = await supabase
          .from("cantiere_membri")
          .select("attivita")
          .eq("profilo_id", profilo.id)
          .not("attivita", "is", null)
          .order("creato_il", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ultimoMembro?.attivita) {
          setAttivitaNuovo(ultimoMembro.attivita);
        }
      }
    }

    setRicercaAutocompletamento(false);
  }

  async function carica() {
    setErroreCaricamento(null);

    const { data: c, error: cErr } = await supabase
      .from("cantieri")
      .select("id, nome, indirizzo, qr_token")
      .eq("id", cantiereId)
      .single();

    if (cErr) {
      console.error("Errore caricamento cantiere:", cErr);
      setErroreCaricamento(
        "Non riesco a caricare questo cantiere (" + cErr.message + "). Probabilmente non hai i permessi per vederlo."
      );
      return;
    }
    setCantiere(c);

    const { data: m, error: mErr } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo, nome_impresa, attivita, stato, profili!cantiere_membri_profilo_id_fkey(email, impresa)")
      .eq("cantiere_id", cantiereId);

    if (mErr) {
      console.error("Errore caricamento membri:", mErr);
      setErroreCaricamento("Non riesco a caricare l'elenco delle persone (" + mErr.message + ").");
      return;
    }
    setMembri((m as unknown as Membro[]) || []);
  }

  useEffect(() => {
    if (cantiereId) carica();
  }, [cantiereId]);

  async function aggiungiPersona(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);

    // Cerca se esiste già un profilo con questa email (ignora maiuscole/minuscole e spazi)
    const { data: risultatiRicerca } = await supabase.rpc("cerca_profilo_per_email", {
      email_ricerca: emailNuovo.trim(),
    });
    const profiloEsistente = risultatiRicerca?.[0];

    if (!profiloEsistente) {
      setErrore(
        "Questa persona non ha ancora un account GENESIVOX. Creala prima da Supabase (Authentication → Add user), poi riprova qui."
      );
      return;
    }

    const { error } = await supabase.from("cantiere_membri").insert({
      cantiere_id: cantiereId,
      profilo_id: profiloEsistente.id,
      ruolo: ruoloNuovo,
      nome_impresa: nomeImpresaNuovo || null,
      attivita: attivitaNuovo || null,
    });

    if (error) {
      setErrore(error.message);
      return;
    }

    setMessaggio("Persona aggiunta al cantiere.");
    setEmailNuovo("");
    setNomeImpresaNuovo("");
    setAttivitaNuovo("");
    setImpresaModificataAMano(false);
    setAttivitaModificataAMano(false);
    carica();
  }

  if (erroreCaricamento) return <p style={{ padding: 24, color: "red" }}>{erroreCaricamento}</p>;
  if (!cantiere) return <p style={{ padding: 24 }}>Caricamento...</p>;

  const membriApprovati = membri.filter((m: any) => m.stato !== "in_attesa");
  const membriInAttesa = membri.filter((m: any) => m.stato === "in_attesa");

  async function approva(membroId: string) {
    await supabase.from("cantiere_membri").update({ stato: "approvato" }).eq("id", membroId);
    carica();
  }

  function iniziaModifica(m: Membro) {
    setModificaId(m.id);
    // Se questa persona ha già (da prima) il ruolo Committente/Impresa edile,
    // non è tra le opzioni modificabili: lasciamo il valore così com'è nel
    // menu a tendina non lo troverà e mostrerà semplicemente la prima opzione,
    // ma senza permettere di riassegnarlo per errore ad un'altra persona.
    setRuoloModifica(m.ruolo);
    setNomeImpresaModifica(m.nome_impresa ?? "");
    setAttivitaModifica(m.attivita ?? "");
  }

  async function salvaModifica(id: string) {
    const { data, error } = await supabase
      .from("cantiere_membri")
      .update({
        ruolo: ruoloModifica,
        nome_impresa: nomeImpresaModifica || null,
        attivita: attivitaModifica || null,
      })
      .eq("id", id)
      .select("id");

    if (error) {
      if (error.message?.includes("richiesta e approvazione")) {
        alert("Committente e Impresa edile non si possono più assegnare da qui: la persona deve farne richiesta dalla propria pagina, e tu la approvi da \"Richieste di ruolo\".");
      } else {
        alert("Errore nel salvare: " + error.message);
      }
      return;
    }
    if (!data || data.length === 0) {
      alert("Non hai i permessi per modificare questa persona in questo cantiere.");
      return;
    }
    setModificaId(null);
    carica();
  }

  async function eliminaMembro(id: string, nomeVisualizzato: string) {
    if (!confirm(`Rimuovere "${nomeVisualizzato}" da questo cantiere? Non avrà più accesso ai suoi dati.`)) return;

    const { data, error } = await supabase.from("cantiere_membri").delete().eq("id", id).select("id");
    if (error) {
      alert("Errore nell'eliminare: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Non hai i permessi per rimuovere questa persona da questo cantiere.");
      return;
    }
    carica();
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Persone assegnate</h1>

      {membriInAttesa.length > 0 && (
        <div style={{ margin: "16px 0", padding: 16, border: "1px solid #f0ad4e", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Richieste in attesa di approvazione</h3>
          {membriInAttesa.map((m: any) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span>
                {m.profili?.email} — {ETICHETTE_TUTTI_I_RUOLI[m.ruolo] ?? m.ruolo} — {m.nome_impresa} ({m.attivita})
              </span>
              <button onClick={() => approva(m.id)} style={{ padding: "4px 12px" }}>
                Approva
              </button>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Email</th>
            <th style={{ padding: 8 }}>Ruolo</th>
            <th style={{ padding: 8 }}>Impresa</th>
            <th style={{ padding: 8 }}>Attività</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {membriApprovati.map((m) =>
            modificaId === m.id ? (
              <tr key={m.id} style={{ borderBottom: "1px solid #eee", backgroundColor: "#f7fafe" }}>
                <td style={{ padding: 8 }}>{m.profili?.email}</td>
                <td style={{ padding: 8 }}>
                  <select
                    value={ruoloModifica}
                    onChange={(e) => setRuoloModifica(e.target.value)}
                    style={{ padding: 6, width: "100%" }}
                  >
                    {RUOLI.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    value={nomeImpresaModifica}
                    onChange={(e) => setNomeImpresaModifica(e.target.value)}
                    style={{ padding: 6, width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8 }}>
                  <input
                    value={attivitaModifica}
                    onChange={(e) => setAttivitaModifica(e.target.value)}
                    style={{ padding: 6, width: "100%" }}
                  />
                </td>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                  <button onClick={() => salvaModifica(m.id)} style={{ padding: "4px 10px", marginRight: 6 }}>
                    Salva
                  </button>
                  <button onClick={() => setModificaId(null)} style={{ padding: "4px 10px" }}>
                    Annulla
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: 8 }}>{m.profili?.email}</td>
                <td style={{ padding: 8 }}>{ETICHETTE_TUTTI_I_RUOLI[m.ruolo] ?? m.ruolo}</td>
                <td style={{ padding: 8 }}>{impresaVisualizzata(m)}</td>
                <td style={{ padding: 8 }}>{m.attivita ?? "—"}</td>
                <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                  <Link href={`/cantieri/${cantiereId}/persone/${m.id}`} style={{ fontSize: 13, marginRight: 10 }}>
                    Ruoli extra →
                  </Link>
                  <button
                    onClick={() => iniziaModifica(m)}
                    style={{ padding: "4px 10px", marginRight: 6, fontSize: 13 }}
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => eliminaMembro(m.id, impresaVisualizzata(m) !== "—" ? impresaVisualizzata(m) : m.profili?.email || "questa persona")}
                    style={{
                      padding: "4px 10px",
                      fontSize: 13,
                      color: "#c0392b",
                      border: "1px solid #c0392b",
                      borderRadius: 4,
                      background: "none",
                    }}
                  >
                    Elimina
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      <form onSubmit={aggiungiPersona} style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Aggiungi persona</h3>
        <div style={{ marginBottom: 8 }}>
          <input
            type="email"
            placeholder="Email della persona (deve avere già un account)"
            value={emailNuovo}
            onChange={(e) => setEmailNuovo(e.target.value)}
            onBlur={autocompletaDaEmail}
            required
            style={{ width: "100%", padding: 8 }}
          />
          {ricercaAutocompletamento && (
            <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Recupero dati della persona...</p>
          )}
        </div>
        <div style={{ marginBottom: 8 }}>
          <select
            value={ruoloNuovo}
            onChange={(e) => {
              const nuovoRuolo = e.target.value;
              setRuoloNuovo(nuovoRuolo);
              // Se il campo Attività è ancora vuoto e non è stato modificato a mano,
              // lo riempie con il ruolo appena scelto (resta comunque modificabile).
              if (!attivitaNuovo && !attivitaModificataAMano) {
                const etichetta = RUOLI.find((r) => r.value === nuovoRuolo)?.label;
                if (etichetta) setAttivitaNuovo(etichetta);
              }
            }}
            style={{ width: "100%", padding: 8 }}
          >
            {RUOLI.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0" }}>
            Committente e Impresa edile non sono qui: la persona li richiede dalla propria pagina, poi tu li approvi.
          </p>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Nome impresa"
            value={nomeImpresaNuovo}
            onChange={(e) => {
              setNomeImpresaNuovo(e.target.value);
              setImpresaModificataAMano(true);
            }}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            placeholder="Attività svolta (es. idraulico, elettricista, piastrellista)"
            value={attivitaNuovo}
            onChange={(e) => {
              setAttivitaNuovo(e.target.value);
              setAttivitaModificataAMano(true);
            }}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        {errore && <p style={{ color: "red" }}>{errore}</p>}
        {messaggio && <p style={{ color: "green" }}>{messaggio}</p>}
        <button type="submit" style={{ padding: "8px 16px" }}>Aggiungi</button>
      </form>
    </div>
  );
}
