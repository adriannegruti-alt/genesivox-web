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

  useEffect(() => {
    async function carica() {
      const { data } = await supabase.from("cantieri").select("id, nome").eq("id", cantiereId).single();
      setCantiere(data);
    }
    if (cantiereId) carica();
  }, [cantiereId]);

  const voci = [
    { href: `/cantieri/${cantiereId}`, label: "🏗️ Panoramica", esatto: true },
    { href: `/cantieri/${cantiereId}/persone`, label: "👥 Persone assegnate" },
    { href: `/cantieri/${cantiereId}/documenti`, label: "📄 I miei documenti" },
    { href: `/cantieri/${cantiereId}/preventivi`, label: "💰 Preventivi" },
    { href: `/cantieri/${cantiereId}/presenze`, label: "🕒 Presenze" },
    { href: `/cantieri/${cantiereId}/imprese`, label: "🏢 Imprese e subappaltatori" },
    { href: `/cantieri/${cantiereId}/visite`, label: "🪪 Visite ispettive" },
  ];

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
