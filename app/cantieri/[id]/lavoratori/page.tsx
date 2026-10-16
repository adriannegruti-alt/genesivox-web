"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Riga = {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  tipo_rapporto: string;
  attivo: boolean;
  qr_token: string;
  impresa: string | null;
  documenti: number;
  idoneita_valida: boolean;
  scaduti: number;
  in_scadenza: number;
};

function stato(r: Riga): { testo: string; colore: string; sfondo: string; problema: boolean } {
  if (!r.attivo) return { testo: "Disattivato", colore: "#555", sfondo: "#eee", problema: false };
  if (r.documenti === 0) return { testo: "Nessun documento", colore: "#555", sfondo: "#eee", problema: true };
  if (!r.idoneita_valida)
    return { testo: "Idoneità mancante o scaduta", colore: "#fff", sfondo: "#c0392b", problema: true };
  if (r.scaduti > 0) return { testo: "Documenti scaduti", colore: "#fff", sfondo: "#c0392b", problema: true };
  if (r.in_scadenza > 0) return { testo: "In scadenza", colore: "#5c3d00", sfondo: "#ffd666", problema: true };
  return { testo: "Documenti validi", colore: "#fff", sfondo: "#16a34a", problema: false };
}

export default function LavoratoriCantierePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [vista, setVista] = useState<"tutti" | "miei">("miei");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [soloProblemi, setSoloProblemi] = useState(false);
  const [cerca, setCerca] = useState("");

  useEffect(() => {
    async function carica() {
      const { data, error } = await supabase.rpc("lavoratori_del_cantiere", { p_cantiere: String(cantiereId) });
      if (error || !data) {
        setErrore("Non è stato possibile caricare l'elenco.");
      } else if (data.errore === "non_autorizzato") {
        setErrore("Non hai accesso all'elenco dei lavoratori di questo cantiere.");
      } else if (data.errore) {
        setErrore("Devi accedere per vedere l'elenco.");
      } else {
        setVista(data.vista === "tutti" ? "tutti" : "miei");
        setRighe((data.lavoratori || []) as Riga[]);
      }
      setCaricamento(false);
    }
    if (cantiereId) carica();
  }, [cantiereId]);

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;
  if (errore) return <p style={{ padding: 24, color: "red" }}>{errore}</p>;

  const testo = cerca.trim().toLowerCase();
  const visibili = righe
    .filter((r) => {
      if (soloProblemi && !stato(r).problema) return false;
      if (!testo) return true;
      return `${r.cognome} ${r.nome} ${r.impresa ?? ""} ${r.mansione ?? ""}`.toLowerCase().includes(testo);
    })
    .sort((a, b) => {
      const imp = (a.impresa ?? "").localeCompare(b.impresa ?? "");
      if (imp !== 0) return imp;
      return `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`);
    });

  const attivi = righe.filter((r) => r.attivo);
  const conProblemi = attivi.filter((r) => stato(r).problema).length;

  return (
    <div style={{ fontFamily: "sans-serif", maxWidth: 950 }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>Lavoratori in cantiere</h2>
      <p style={{ color: "#666", marginTop: 0 }}>
        {vista === "tutti"
          ? "Lavoratori assegnati a questo cantiere da tutte le imprese. Aprendo la scheda la consultazione viene registrata."
          : "Qui vedi i lavoratori della tua impresa assegnati a questo cantiere. Per assegnarli: Lavoratori → Cantieri."}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <strong>
          {attivi.length} {attivi.length === 1 ? "lavoratore attivo" : "lavoratori attivi"}
        </strong>
        {conProblemi > 0 && <span style={{ color: "#c0392b" }}>⚠️ {conProblemi} da controllare</span>}
        <input
          placeholder="Cerca per nome, impresa, mansione..."
          value={cerca}
          onChange={(e) => setCerca(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, fontSize: 14, width: 260 }}
        />
        <label style={{ fontSize: 13, color: "#555" }}>
          <input
            type="checkbox"
            checked={soloProblemi}
            onChange={(e) => setSoloProblemi(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Mostra solo da controllare
        </label>
      </div>

      {visibili.length === 0 ? (
        <p style={{ color: "#888" }}>
          {righe.length === 0 ? "Nessun lavoratore assegnato a questo cantiere." : "Nessun risultato."}
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc", fontSize: 13 }}>
                <th style={{ padding: 8 }}>Lavoratore</th>
                <th style={{ padding: 8 }}>Impresa</th>
                <th style={{ padding: 8 }}>Mansione</th>
                <th style={{ padding: 8 }}>Stato documenti</th>
                <th style={{ padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((r) => {
                const s = stato(r);
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee", opacity: r.attivo ? 1 : 0.6 }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>
                      {r.cognome} {r.nome}
                      {r.tipo_rapporto === "autonomo" && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#1a73e8", fontWeight: 400 }}>autonomo</span>
                      )}
                    </td>
                    <td style={{ padding: 8 }}>{r.impresa || "—"}</td>
                    <td style={{ padding: 8 }}>{r.mansione || "—"}</td>
                    <td style={{ padding: 8 }}>
                      <span
                        style={{
                          backgroundColor: s.sfondo,
                          color: s.colore,
                          padding: "3px 8px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.testo}
                      </span>
                    </td>
                    <td style={{ padding: 8, whiteSpace: "nowrap" }}>
                      <Link
                        href={`/t/${r.qr_token}`}
                        target="_blank"
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #ccc",
                          backgroundColor: "#fff",
                          fontSize: 13,
                          color: "#000",
                          textDecoration: "none",
                        }}
                      >
                        Apri scheda
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: "#777", marginTop: 16 }}>
        Lo stato è calcolato sui documenti caricati dall&apos;impresa su Genesivox. Non sostituisce la verifica della
        validità dei documenti da parte di chi controlla.
      </p>
    </div>
  );
}
