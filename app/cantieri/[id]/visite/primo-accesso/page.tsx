"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Membro = {
  id: string;
  ruolo: string;
  nome_impresa: string | null;
  profili: { email: string } | null;
};

type Verbale = {
  id: string;
  membro_id: string;
  data: string;
  ora: string;
  mansione: string | null;
  psc_consegnato: boolean;
  psc_letto_compreso: boolean;
  dpi_forniti: boolean;
  formazione_verificata: boolean;
  idoneita_sanitaria_verificata: boolean;
  tessera_riconoscimento_verificata: boolean;
  note: string | null;
  confermato: boolean;
  creato_da: string | null;
  creato_il: string;
};

const VERIFICHE: [string, string][] = [
  ["pscConsegnato", "PSC consegnato"],
  ["pscLettoCompreso", "PSC letto e compreso"],
  ["dpiForniti", "DPI forniti"],
  ["formazioneVerificata", "Formazione/attestati verificati"],
  ["idoneitaSanitariaVerificata", "Idoneità sanitaria verificata"],
  ["tesseraRiconoscimentoVerificata", "Tessera di riconoscimento verificata"],
];

export default function PrimoAccessoPage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [membri, setMembri] = useState<Membro[]>([]);
  const [verbali, setVerbali] = useState<Verbale[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [puoCompilare, setPuoCompilare] = useState(false);
  const [mostraForm, setMostraForm] = useState(false);
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [miaUid, setMiaUid] = useState<string | null>(null);

  const oggi = new Date();
  const dataOggi = oggi.toISOString().slice(0, 10);
  const oraOra = oggi.toTimeString().slice(0, 5);

  const formVuoto = {
    membroId: "",
    data: dataOggi,
    ora: oraOra,
    mansione: "",
    pscConsegnato: false,
    pscLettoCompreso: false,
    dpiForniti: false,
    formazioneVerificata: false,
    idoneitaSanitariaVerificata: false,
    tesseraRiconoscimentoVerificata: false,
    note: "",
    confermato: false,
  };

  const [form, setForm] = useState(formVuoto);

  async function calcolaPermessi() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;
    setMiaUid(uid);

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
    setPuoCompilare(ruoliMiei.includes("cse_csp"));
  }

  async function carica() {
    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: m } = await supabase
      .from("cantiere_membri")
      .select("id, ruolo, nome_impresa, profili!cantiere_membri_profilo_id_fkey(email)")
      .eq("cantiere_id", cantiereId)
      .eq("stato", "approvato");
    setMembri((m as unknown as Membro[]) || []);

    const { data: v, error } = await supabase
      .from("verbali_primo_accesso")
      .select("*")
      .eq("cantiere_id", cantiereId)
      .order("creato_il", { ascending: false });

    if (error) {
      setErrore("Non hai i permessi per vedere i verbali di primo accesso di questo cantiere.");
    } else {
      setVerbali(v || []);
    }
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) {
      carica();
      calcolaPermessi();
    }
  }, [cantiereId]);

  function nomeMembro(id: string): string {
    const m = membri.find((x) => x.id === id);
    if (!m) return "—";
    return m.nome_impresa || m.profili?.email || "—";
  }

  function annullaForm() {
    setForm(formVuoto);
    setModificaId(null);
    setMostraForm(false);
    setErrore(null);
  }

  function iniziaModifica(v: Verbale) {
    setForm({
      membroId: v.membro_id,
      data: v.data,
      ora: v.ora,
      mansione: v.mansione || "",
      pscConsegnato: v.psc_consegnato,
      pscLettoCompreso: v.psc_letto_compreso,
      dpiForniti: v.dpi_forniti,
      formazioneVerificata: v.formazione_verificata,
      idoneitaSanitariaVerificata: v.idoneita_sanitaria_verificata,
      tesseraRiconoscimentoVerificata: v.tessera_riconoscimento_verificata,
      note: v.note || "",
      confermato: v.confermato,
    });
    setModificaId(v.id);
    setMostraForm(true);
    setErrore(null);
  }

  async function eliminaVerbale(id: string) {
    if (!confirm("Eliminare questo verbale di primo accesso? L'operazione non è reversibile.")) return;
    setErrore(null);

    const { data, error } = await supabase.from("verbali_primo_accesso").delete().eq("id", id).select("id");

    if (error) {
      setErrore(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setErrore("Non hai i permessi per eliminare questo verbale (puoi eliminare solo quelli creati da te).");
      return;
    }
    carica();
  }

  async function salvaVerbale(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    if (!form.membroId) {
      setErrore("Seleziona l'impresa/persona a cui si riferisce il primo accesso.");
      return;
    }
    if (!form.confermato) {
      setErrore("Devi confermare la veridicità del verbale prima di salvarlo.");
      return;
    }

    const dati = {
      membro_id: form.membroId,
      data: form.data,
      ora: form.ora,
      mansione: form.mansione || null,
      psc_consegnato: form.pscConsegnato,
      psc_letto_compreso: form.pscLettoCompreso,
      dpi_forniti: form.dpiForniti,
      formazione_verificata: form.formazioneVerificata,
      idoneita_sanitaria_verificata: form.idoneitaSanitariaVerificata,
      tessera_riconoscimento_verificata: form.tesseraRiconoscimentoVerificata,
      note: form.note || null,
      confermato: form.confermato,
    };

    if (modificaId) {
      const { data, error } = await supabase
        .from("verbali_primo_accesso")
        .update(dati)
        .eq("id", modificaId)
        .select("id");

      if (error) {
        setErrore(error.message);
        return;
      }
      if (!data || data.length === 0) {
        setErrore("Non hai i permessi per modificare questo verbale (puoi modificare solo quelli creati da te).");
        return;
      }
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("verbali_primo_accesso").insert({
        cantiere_id: cantiereId,
        creato_da: userData?.user?.id ?? null,
        ...dati,
      });

      if (error) {
        setErrore(error.message);
        return;
      }
    }

    annullaForm();
    carica();
  }

  function scaricaPdf(v: Verbale) {
    const finestra = window.open("", "_blank");
    if (!finestra) return;

    const righe: [string, string][] = [
      ["Impresa / persona", nomeMembro(v.membro_id)],
      ["Mansione", v.mansione || "—"],
      ["Data accesso", new Date(v.data).toLocaleDateString("it-IT")],
      ["Ora accesso", v.ora],
      ["PSC consegnato", v.psc_consegnato ? "Sì" : "No"],
      ["PSC letto e compreso", v.psc_letto_compreso ? "Sì" : "No"],
      ["DPI forniti", v.dpi_forniti ? "Sì" : "No"],
      ["Formazione/attestati verificati", v.formazione_verificata ? "Sì" : "No"],
      ["Idoneità sanitaria verificata", v.idoneita_sanitaria_verificata ? "Sì" : "No"],
      ["Tessera di riconoscimento verificata", v.tessera_riconoscimento_verificata ? "Sì" : "No"],
      ["Note", v.note || "—"],
      ["Registrato il", new Date(v.creato_il).toLocaleString("it-IT")],
    ];

    finestra.document.write(`
      <html>
        <head>
          <title>Verbale di Primo Accesso</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #222; }
            h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
            h2 { font-size: 14px; color: #555; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
            td:first-child { font-weight: bold; width: 260px; }
          </style>
        </head>
        <body>
          <h1>Verbale di Primo Accesso in Cantiere</h1>
          <h2>${cantiere?.nome ?? ""}</h2>
          <table>
            ${righe.map(([etichetta, valore]) => `<tr><td>${etichetta}</td><td>${valore}</td></tr>`).join("")}
          </table>
        </body>
      </html>
    `);
    finestra.document.close();
    setTimeout(() => finestra.print(), 300);
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <p>
        <Link href={`/cantieri/${cantiereId}/visite`}>← Torna a Visite ispettive</Link>
      </p>
      <h1>Verbale di Primo Accesso — {cantiere?.nome}</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        Visibile a: Committente, CSE/CSP, RSPP, Capocantiere, RLS/RLST, e all'impresa/lavoratore interessato dal singolo verbale.
      </p>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {puoCompilare && !mostraForm && (
        <div style={{ marginBottom: 24 }}>
          <button onClick={() => setMostraForm(true)} style={{ padding: "8px 16px" }}>
            + Nuovo verbale di primo accesso
          </button>
        </div>
      )}

      {mostraForm && puoCompilare && (
        <form onSubmit={salvaVerbale} style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>{modificaId ? "Modifica verbale" : "Nuovo verbale"}</h3>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "#555" }}>Impresa / persona</label>
            <select
              value={form.membroId}
              onChange={(e) => setForm((f) => ({ ...f, membroId: e.target.value }))}
              required
              style={{ width: "100%", padding: 8 }}
            >
              <option value="">— Seleziona —</option>
              {membri.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome_impresa || m.profili?.email} ({m.ruolo})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "#555" }}>Data accesso</label>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: "#555" }}>Ora accesso</label>
              <input
                type="time"
                value={form.ora}
                onChange={(e) => setForm((f) => ({ ...f, ora: e.target.value }))}
                required
                style={{ width: "100%", padding: 8 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "#555" }}>Mansione</label>
            <input
              value={form.mansione}
              onChange={(e) => setForm((f) => ({ ...f, mansione: e.target.value }))}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div style={{ margin: "16px 0", padding: 12, backgroundColor: "#f9f9f9", borderRadius: 6 }}>
            <p style={{ fontSize: 13, fontWeight: "bold", margin: "0 0 8px" }}>Verifiche effettuate</p>
            {VERIFICHE.map(([campo, etichetta]) => (
              <label key={campo} style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={(form as any)[campo]}
                  onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.checked }))}
                  style={{ marginRight: 8 }}
                />
                {etichetta}
              </label>
            ))}
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, color: "#555" }}>Note</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              rows={3}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <label style={{ display: "block", fontSize: 13, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={form.confermato}
              onChange={(e) => setForm((f) => ({ ...f, confermato: e.target.checked }))}
              style={{ marginRight: 8 }}
            />
            Confermo che quanto sopra riportato corrisponde al vero.
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={{ padding: "8px 16px" }}>
              {modificaId ? "Salva modifiche" : "Salva verbale"}
            </button>
            <button type="button" onClick={annullaForm} style={{ padding: "8px 16px" }}>
              Annulla
            </button>
          </div>
        </form>
      )}

      <h3>Verbali registrati</h3>
      {verbali.map((v) => (
        <div key={v.id} style={{ padding: 12, marginBottom: 8, border: "1px solid #ddd", borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <strong>{nomeMembro(v.membro_id)}</strong>
              <div style={{ fontSize: 13, color: "#666" }}>
                {new Date(v.data).toLocaleDateString("it-IT")} — {v.ora}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => scaricaPdf(v)} style={{ padding: "6px 12px" }}>
                📄 Scarica PDF
              </button>
              {puoCompilare && v.creato_da === miaUid && (
                <>
                  <button onClick={() => iniziaModifica(v)} style={{ padding: "6px 12px" }}>
                    ✏️ Modifica
                  </button>
                  <button onClick={() => eliminaVerbale(v.id)} style={{ padding: "6px 12px", color: "#b00020" }}>
                    🗑️ Elimina
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      {verbali.length === 0 && <p style={{ color: "#666" }}>Nessun verbale registrato ancora.</p>}
    </div>
  );
}
