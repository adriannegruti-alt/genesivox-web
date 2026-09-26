"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Nodo = {
  titolo: string;
  descrizione?: string;
  figli?: Nodo[];
};

const MENU: Nodo[] = [
  {
    titolo: "1. Documenti da presentare al Committente",
    figli: [
      {
        titolo: "Competenza e diligenza",
        descrizione:
          "Il DL deve fornire al committente tutta la documentazione necessaria a certificare la regolarità economica e tecnica dell'opera, sia in corso d'opera che alla chiusura del cantiere.",
      },
      {
        titolo: "In corso d'opera (Contabilità e Varianti)",
        figli: [
          {
            titolo: "a) SAL (Stato Avanzamento Lavori)",
            descrizione:
              "Documento contabile con cui il DL attesta la quota di lavori eseguiti, autorizzando il committente a pagare la rata successiva all'impresa.",
          },
          {
            titolo: "b) Certificati di pagamento",
            descrizione: "Documenti formali emessi dal DL sulla base del SAL.",
          },
          {
            titolo: "c) Relazioni su varianti in corso d'opera",
            descrizione:
              "Se si rendono necessarie modifiche al progetto originario, il DL presenta una relazione tecnica ed economica per l'approvazione del committente.",
          },
        ],
      },
      {
        titolo: "A fine lavori (Chiusura della pratica)",
        figli: [
          {
            titolo: "a) Certificato di Ultimazione Lavori",
            descrizione: "Attesta la data ufficiale in cui l'impresa ha concluso le opere.",
          },
          {
            titolo: "b) Certificato di Regolare Esecuzione (o collaudo)",
            descrizione:
              "Dichiarazione in cui il DL conferma che le opere sono state realizzate a regola d'arte e conformemente al contratto.",
          },
          {
            titolo: "c) As-Built (Disegni finali)",
            descrizione:
              "Gli elaborati grafici aggiornati che mostrano come l'opera è stata effettivamente costruita.",
          },
          {
            titolo: "d) Raccolta delle certificazioni",
            descrizione:
              "Consegna al committente dei libretti d'uso, delle dichiarazioni di conformità degli impianti (di cui alla Lettera G del DM 37/08) e dei materiali strutturali.",
          },
        ],
      },
    ],
  },
  {
    titolo: "2. Documenti da gestire e verificare in Cantiere",
    figli: [
      {
        titolo: "Il Giornale dei Lavori",
        descrizione:
          "È lo strumento fondamentale (oggi prevalentemente digitale) in cui il DL annota quotidianamente o a ogni visita l'ordine dei lavori, il personale presente, le condizioni meteo, le disposizioni impartite e gli eventuali intoppi.",
      },
      {
        titolo: "Verbali di cantiere",
        descrizione:
          "Inclusi il Verbale di Consegna dei Lavori (che avvia ufficialmente il cantiere) ed eventuali verbali di sospensione e ripresa dei lavori.",
      },
      {
        titolo: "Ordini di Servizio (OdS)",
        descrizione:
          "Atti formali scritti con cui il DL impone all'impresa specifiche modalità esecutive o contesta lavorazioni non conformi.",
      },
      {
        titolo: "Documentazione tecnica e autorizzativa",
        descrizione:
          "Copia del progetto esecutivo, del titolo abilitativo comunale (CILA/SCIA/Permesso di Costruire) e autorizzazioni strutturali (Genio Civile).",
      },
      {
        titolo: "Controllo documentale di Sicurezza (interazione con il CSE)",
        descrizione:
          "Pur non essendo il Coordinatore della Sicurezza, il DL deve verificare che in cantiere siano presenti il PSC (Piano di Sicurezza e Coordinamento), i POS delle imprese e la notifica preliminare, coordinandosi con il CSE prima di dare l'ordine di inizio delle singole lavorazioni.",
      },
      {
        titolo: "Patente a Crediti e DURC",
        descrizione:
          "Il DL deve accertarsi della regolarità contributiva delle imprese presenti (DURC attivo) e, per le normative correnti, verificare che le aziende siano in possesso della Patente a Crediti.",
      },
    ],
  },
  {
    titolo: "3. Attività e obblighi per Legge, Privacy",
    figli: [
      {
        titolo: "Obblighi di Legge",
        figli: [
          { titolo: "a) Conformità edilizia", descrizione: "Descrizione da definire." },
          {
            titolo: "b) Denuncia delle strutture",
            descrizione: "Deve firmare la Relazione a Strutture Ultimate entro 65 giorni dalla fine delle opere strutturali.",
          },
          { titolo: "c) Segnalazione di illeciti", descrizione: "Descrizione da definire." },
        ],
      },
      {
        titolo: "Privacy (GDPR - Regolamento UE 2016/679)",
        figli: [
          { titolo: "a) Gestione dei dati dei lavoratori", descrizione: "Descrizione da definire." },
          { titolo: "b) Videosorveglianza e Foto", descrizione: "Descrizione da definire." },
          { titolo: "c) Riservatezza del Committente", descrizione: "Descrizione da definire." },
        ],
      },
    ],
  },
];

function NodoMenu({ nodo, percorso, aperti, toggle }: { nodo: Nodo; percorso: string; aperti: Set<string>; toggle: (p: string) => void }) {
  const haFigli = !!nodo.figli && nodo.figli.length > 0;
  const eAperto = aperti.has(percorso);

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => toggle(percorso)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          padding: "10px 12px",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          backgroundColor: "#fff",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        <span style={{ fontSize: 11, color: "#999" }}>{eAperto ? "▼" : "▶"}</span>
        <span style={{ fontWeight: percorso.split("-").length === 1 ? 700 : 500 }}>{nodo.titolo}</span>
      </button>

      {eAperto && (
        <div style={{ paddingLeft: 20, marginTop: 6, marginBottom: 6 }}>
          {haFigli &&
            nodo.figli!.map((f, i) => (
              <NodoMenu key={i} nodo={f} percorso={`${percorso}-${i}`} aperti={aperti} toggle={toggle} />
            ))}
          {!haFigli && nodo.descrizione && (
            <p style={{ fontSize: 13, color: "#555", backgroundColor: "#f9f9f9", padding: 10, borderRadius: 6, margin: "4px 0" }}>
              {nodo.descrizione}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DirezioneLavoriHubPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [puoAccedere, setPuoAccedere] = useState(false);
  const [aperti, setAperti] = useState<Set<string>>(new Set());

  function toggle(percorso: string) {
    setAperti((prev) => {
      const nuovo = new Set(prev);
      if (nuovo.has(percorso)) {
        nuovo.delete(percorso);
      } else {
        nuovo.add(percorso);
      }
      return nuovo;
    });
  }

  async function calcolaPermessi() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    const { data: profiloMio } = await supabase.from("profili").select("ruolo").eq("id", uid).maybeSingle();
    if (profiloMio?.ruolo === "admin") {
      setPuoAccedere(true);
      return;
    }

    const { data: cantiereRiga } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
    if (cantiereRiga?.creato_da === uid) {
      setPuoAccedere(true);
      return;
    }

    const { data: membroMio } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo")
      .eq("cantiere_id", cantiereId)
      .eq("profilo_id", uid)
      .maybeSingle();

    let ruoliMiei: string[] = membroMio?.ruolo ? [membroMio.ruolo] : [];
    if (membroMio) {
      const { data: ruoliExtraPropri } = await supabase.from("membro_ruoli").select("ruolo").eq("membro_id", membroMio.id);
      ruoliMiei = ruoliMiei.concat((ruoliExtraPropri || []).map((r) => r.ruolo));
    }

    const autorizzato = ruoliMiei.some((r) =>
      ["committente", "impresa_edile", "responsabile_lavori", "direttore_lavori"].includes(r)
    );
    setPuoAccedere(autorizzato);
  }

  async function carica() {
    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) {
      carica();
      calcolaPermessi();
    }
  }, [cantiereId]);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  if (!puoAccedere) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <p>
          <Link href={`/cantieri/${cantiereId}`}>← Torna alla Panoramica</Link>
        </p>
        <p style={{ color: "#666", fontSize: 13, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 6 }}>
          Non hai accesso all'area Direzione Lavori di questo cantiere.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 800 }}>
      <p>
        <Link href={`/cantieri/${cantiereId}`}>← Torna alla Panoramica</Link>
      </p>
      <h1>Direzione Lavori — {cantiere?.nome}</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
        Area tecnica separata dalla sicurezza. Clicca su una voce per aprirla; le voci finali mostrano una breve
        descrizione. Al momento è solo consultazione: aggiungeremo moduli di inserimento dati voce per voce.
      </p>

      {MENU.map((nodo, i) => (
        <NodoMenu key={i} nodo={nodo} percorso={`${i}`} aperti={aperti} toggle={toggle} />
      ))}
    </div>
  );
}
