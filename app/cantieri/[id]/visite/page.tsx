"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Visita = {
  id: string;
  nome: string;
  cognome: string;
  ente: string;
  numero_tessera: string | null;
  motivo: string;
  creato_il: string;
};

export default function VisiteIspettivePage() {
  const params = useParams();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [visite, setVisite] = useState<Visita[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [nfcSupportato, setNfcSupportato] = useState(false);
  const [lettoreNfcAttivo, setLettoreNfcAttivo] = useState(false);
  const [puoRegistrare, setPuoRegistrare] = useState(false);

  const [form, setForm] = useState({ nome: "", cognome: "", ente: "", numeroTessera: "", motivo: "" });

  useEffect(() => {
    setNfcSupportato(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  async function calcolaPermessi() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;

    const { data: profiloMio } = await supabase.from("profili").select("ruolo").eq("id", uid).maybeSingle();
    if (profiloMio?.ruolo === "admin") {
      setPuoRegistrare(true);
      return;
    }

    const { data: cantiereRiga } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
    if (cantiereRiga?.creato_da === uid) {
      setPuoRegistrare(true);
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

    const autorizzato = ruoliMiei.some((r) => ["committente", "impresa_edile", "rspp"].includes(r));
    setPuoRegistrare(autorizzato);
  }

  async function carica() {
    const { data: c } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
    setCantiere(c);

    const { data: v, error } = await supabase
      .from("visite_ispettive")
      .select("id, nome, cognome, ente, numero_tessera, motivo, creato_il")
      .eq("cantiere_id", cantiereId)
      .order("creato_il", { ascending: false });

    if (error) {
      setErrore("Non hai i permessi per vedere questa pagina (solo committente/RSPP/CSE-CSP/ASL).");
    } else {
      setVisite(v || []);
    }
    setCaricamento(false);
  }

  useEffect(() => {
    if (cantiereId) {
      carica();
      calcolaPermessi();
    }
  }, [cantiereId]);

  async function leggiTesseraNfc() {
    setErrore(null);
    setLettoreNfcAttivo(true);
    try {
      // @ts-ignore - NDEFReader non è ancora nei tipi standard TypeScript
      const reader = new (window as any).NDEFReader();
      await reader.scan();
      reader.onreading = (event: any) => {
        setForm((f) => ({ ...f, numeroTessera: event.serialNumber || "tessera letta" }));
        setLettoreNfcAttivo(false);
      };
    } catch (err: any) {
      setErrore("Lettura NFC non riuscita: " + err.message);
      setLettoreNfcAttivo(false);
    }
  }

  async function registraVisita(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase.from("visite_ispettive").insert({
      cantiere_id: cantiereId,
      nome: form.nome,
      cognome: form.cognome,
      ente: form.ente,
      numero_tessera: form.numeroTessera || null,
      motivo: form.motivo,
      registrato_da: userData?.user?.id ?? null,
    });

    if (error) {
      setErrore(error.message);
      return;
    }

    setForm({ nome: "", cognome: "", ente: "", numeroTessera: "", motivo: "" });
    carica();
  }

  if (caricamento) return <p style={{ padding: 24 }}>Caricamento...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 700 }}>
      <h1>Registro Visite Ispettive — {cantiere?.nome}</h1>

      {errore && <p style={{ color: "red" }}>{errore}</p>}

      {puoRegistrare ? (
        <form onSubmit={registraVisita} style={{ padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Nuova visita</h3>

          {nfcSupportato && (
            <button
              type="button"
              onClick={leggiTesseraNfc}
              style={{ padding: "8px 16px", marginBottom: 12, backgroundColor: "#34a853", color: "#fff", border: "none", borderRadius: 6 }}
            >
              {lettoreNfcAttivo ? "Avvicina la tessera..." : "📡 Leggi tessera NFC"}
            </button>
          )}
          {!nfcSupportato && (
            <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
              Lettura NFC non disponibile su questo dispositivo/browser — inserisci i dati manualmente.
            </p>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              placeholder="Nome"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              required
              style={{ flex: 1, padding: 8 }}
            />
            <input
              placeholder="Cognome"
              value={form.cognome}
              onChange={(e) => setForm((f) => ({ ...f, cognome: e.target.value }))}
              required
              style={{ flex: 1, padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <input
              placeholder="Ente di appartenenza (es. ASL Venezia, Ispettorato del Lavoro)"
              value={form.ente}
              onChange={(e) => setForm((f) => ({ ...f, ente: e.target.value }))}
              required
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <input
              placeholder="Numero tessera/badge"
              value={form.numeroTessera}
              onChange={(e) => setForm((f) => ({ ...f, numeroTessera: e.target.value }))}
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <input
              placeholder="Motivo del controllo"
              value={form.motivo}
              onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
              required
              style={{ width: "100%", padding: 8 }}
            />
          </div>
          <button type="submit" style={{ padding: "8px 16px" }}>
            Registra visita
          </button>
        </form>
      ) : (
        <p style={{ color: "#666", fontSize: 13, backgroundColor: "#f5f5f5", padding: 10, borderRadius: 6, marginBottom: 24 }}>
          Puoi consultare lo storico delle visite qui sotto, ma non puoi registrarne di nuove.
        </p>
      )}

      <h3>Storico visite</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={{ padding: 8 }}>Data/ora</th>
            <th style={{ padding: 8 }}>Nome</th>
            <th style={{ padding: 8 }}>Ente</th>
            <th style={{ padding: 8 }}>Tessera</th>
            <th style={{ padding: 8 }}>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {visite.map((v) => (
            <tr key={v.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: 8 }}>{new Date(v.creato_il).toLocaleString("it-IT")}</td>
              <td style={{ padding: 8 }}>{v.nome} {v.cognome}</td>
              <td style={{ padding: 8 }}>{v.ente}</td>
              <td style={{ padding: 8 }}>{v.numero_tessera ?? "—"}</td>
              <td style={{ padding: 8 }}>{v.motivo}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {visite.length === 0 && <p style={{ color: "#666" }}>Nessuna visita registrata ancora.</p>}
    </div>
  );
}
