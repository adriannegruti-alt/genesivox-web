"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function CantiereLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const cantiereId = params.id as string;

  const [cantiere, setCantiere] = useState<any>(null);
  const [puoVedereDirezioneLavori, setPuoVedereDirezioneLavori] = useState(false);
  const [soloDirezioneLavori, setSoloDirezioneLavori] = useState(false);

  useEffect(() => {
    async function carica() {
      const { data } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
      setCantiere(data);
    }
    if (cantiereId) carica();
  }, [cantiereId]);

  useEffect(() => {
    async function calcolaMenu() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid || !cantiereId) return;

      const { data: profiloMio } = await supabase.from("profili").select("ruolo").eq("id", uid).maybeSingle();
      if (profiloMio?.ruolo === "admin") {
        setPuoVedereDirezioneLavori(true);
        setSoloDirezioneLavori(false);
        return;
      }

      const { data: cantiereRiga } = await supabase.from("cantieri").select("creato_da").eq("id", cantiereId).maybeSingle();
      if (cantiereRiga?.creato_da === uid) {
        setPuoVedereDirezioneLavori(true);
        setSoloDirezioneLavori(false);
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

      const haAccessoDL = ruoliMiei.some((r) =>
        ["committente", "impresa_edile", "responsabile_lavori", "direttore_lavori"].includes(r)
      );
      setPuoVedereDirezioneLavori(haAccessoDL);

      // Il Direttore Lavori (ruolo principale) NON ha pieni poteri: se non ha anche
      // committente/impresa_edile/responsabile_lavori, gli mostriamo solo Panoramica + Direzione Lavori,
      // per non confonderlo con tutte le altre voci del cantiere.
      const haPieniPoteri = ruoliMiei.some((r) => ["committente", "impresa_edile", "responsabile_lavori"].includes(r));
      const eSoloDirettoreLavori = ruoliMiei.includes("direttore_lavori") && !haPieniPoteri;
      setSoloDirezioneLavori(eSoloDirettoreLavori);
    }
    calcolaMenu();
  }, [cantiereId]);

  const vociComplete = [
    { href: `/cantieri/${cantiereId}`, label: "🏗️ Panoramica", esatto: true },
    { href: `/cantieri/${cantiereId}/persone`, label: "👥 Persone assegnate" },
    { href: `/cantieri/${cantiereId}/documenti`, label: "📄 I miei documenti" },
    { href: `/cantieri/${cantiereId}/preventivi`, label: "💰 Preventivi" },
    { href: `/cantieri/${cantiereId}/presenze`, label: "🕒 Presenze" },
    { href: `/cantieri/${cantiereId}/imprese`, label: "🏢 Imprese e subappaltatori" },
    { href: `/cantieri/${cantiereId}/visite`, label: "🪪 Visite ispettive" },
    { href: `/cantieri/${cantiereId}/verbali`, label: "📝 Verbali CSE/CSP" },
    ...(puoVedereDirezioneLavori
      ? [{ href: `/cantieri/${cantiereId}/direzione-lavori`, label: "🏛️ Direzione Lavori" }]
      : []),
  ];

  const vociSoloDL = [
    { href: `/cantieri/${cantiereId}`, label: "🏗️ Panoramica", esatto: true },
    { href: `/cantieri/${cantiereId}/direzione-lavori`, label: "🏛️ Direzione Lavori" },
  ];

  const voci = soloDirezioneLavori ? vociSoloDL : vociComplete;

  return (
    <div className="cantiere-body" style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div
        className="cantiere-sidebar"
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid #eee",
          padding: 20,
          backgroundColor: "#fafafa",
        }}
      >
        <Link href="/cantieri" style={{ fontSize: 13, color: "#666", textDecoration: "none" }}>
          ← Tutti i cantieri
        </Link>
        <h2 style={{ fontSize: 18, marginTop: 8, marginBottom: 20 }}>{cantiere?.nome ?? "..."}</h2>

        {voci.map((voce) => {
          const attivo = voce.esatto ? pathname === voce.href : pathname?.startsWith(voce.href);
          return (
            <Link
              key={voce.href}
              href={voce.href}
              style={{
                display: "block",
                padding: "10px 12px",
                marginBottom: 4,
                borderRadius: 6,
                textDecoration: "none",
                color: attivo ? "#fff" : "#333",
                backgroundColor: attivo ? "#1a73e8" : "transparent",
                fontWeight: attivo ? 600 : 400,
              }}
            >
              {voce.label}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
