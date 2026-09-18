"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Cantiere = { id: string; nome: string };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [utente, setUtente] = useState<{ email: string } | null>(null);
  const [autoritaControllo, setAutoritaControllo] = useState(false);
  const [menuAperto, setMenuAperto] = useState<"cantieri" | "archivio" | null>(null);

  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [cantieriArchiviati, setCantieriArchiviati] = useState<Cantiere[]>([]);

  // Pagine pubbliche: niente barra/sidebar
  const paginaPubblica = pathname?.startsWith("/login") || pathname?.startsWith("/c/");

  useEffect(() => {
    async function carica() {
      const { data } = await supabase.auth.getUser();
      setUtente(data?.user ? { email: data.user.email ?? "" } : null);

      if (data?.user) {
        const { data: profilo } = await supabase
          .from("profili")
          .select("autorita_controllo")
          .eq("id", data.user.id)
          .maybeSingle();
        setAutoritaControllo(!!profilo?.autorita_controllo);
      }
    }
    carica();
  }, [pathname]);

  async function apriMenuCantieri() {
    setMenuAperto("cantieri");
    const { data } = await supabase.from("cantieri").select("id, nome").order("creato_il", { ascending: false });
    setCantieri(data || []);
  }

  async function apriMenuArchivio() {
    setMenuAperto("archivio");
    const { data } = await supabase
      .from("cantieri")
      .select("id, nome")
      .eq("archiviato", true)
      .order("nome");
    setCantieriArchiviati(data || []);
    router.push("/archivio");
  }

  async function ripristinaCantiere(id: string) {
    await supabase.from("cantieri").update({ archiviato: false }).eq("id", id);
    await apriMenuArchivio();
    setMenuAperto(null);
    router.push("/cantieri");
    router.refresh();
  }

  async function esci() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (paginaPubblica) return <>{children}</>;

  return (
    <div style={{ fontFamily: "sans-serif" }}>
      {/* Barra strumenti in alto */}
      <div
        className="shell-topbar"
        style={{
          height: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid #eee",
          backgroundColor: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="shell-topbar-menu" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <strong style={{ marginRight: 16 }}>GENESIVOX</strong>
          <Link
            href="/"
            onClick={() => setMenuAperto(null)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              textDecoration: "none",
              color: pathname === "/" ? "#1a73e8" : "#333",
              fontWeight: pathname === "/" ? 600 : 400,
            }}
          >
            Panoramica
          </Link>
          <button
            onClick={() => (menuAperto === "cantieri" ? setMenuAperto(null) : apriMenuCantieri())}
            style={{
              padding: "6px 12px",
              border: "none",
              background: menuAperto === "cantieri" ? "#eef6ff" : "transparent",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            I miei cantieri
          </button>
          <button
            onClick={() => (menuAperto === "archivio" ? setMenuAperto(null) : apriMenuArchivio())}
            style={{
              padding: "6px 12px",
              border: "none",
              background: menuAperto === "archivio" ? "#eef6ff" : "transparent",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Archivio
          </button>
          <Link
            href="/crea-account"
            onClick={() => setMenuAperto(null)}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              textDecoration: "none",
              color: pathname === "/crea-account" ? "#1a73e8" : "#333",
              fontWeight: pathname === "/crea-account" ? 600 : 400,
            }}
          >
            Crea Account
          </Link>
          {autoritaControllo && (
            <Link
              href="/ispettiva"
              onClick={() => setMenuAperto(null)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                textDecoration: "none",
                color: pathname === "/ispettiva" ? "#1a73e8" : "#333",
                fontWeight: pathname === "/ispettiva" ? 600 : 400,
              }}
            >
              🔍 Vista Ispettiva
            </Link>
          )}
        </div>

        <div style={{ fontSize: 13 }}>
          {utente ? (
            <>
              <Link href="/account" style={{ color: "#1a73e8", marginRight: 10, textDecoration: "none" }}>
                {utente.email}
              </Link>
              <button onClick={esci} style={{ padding: "6px 12px" }}>
                Esci
              </button>
            </>
          ) : (
            <Link href="/login">Accedi</Link>
          )}
        </div>
      </div>

      {/* Corpo: sidebar a tendina (se aperta) + contenuto */}
      <div className="shell-body" style={{ display: "flex" }}>
        {menuAperto && (
          <div
            className="shell-sidebar"
            style={{ width: 260, flexShrink: 0, borderRight: "1px solid #eee", padding: 16, minHeight: "calc(100vh - 50px)" }}
          >
            {menuAperto === "cantieri" && (
              <div>
                <Link
                  href="/cantieri"
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    marginBottom: 8,
                    backgroundColor: "#1a73e8",
                    color: "#fff",
                    borderRadius: 6,
                    textDecoration: "none",
                    textAlign: "center",
                  }}
                >
                  + Nuovo cantiere
                </Link>
                {cantieri.map((c) => (
                  <Link
                    key={c.id}
                    href={`/cantieri/${c.id}`}
                    style={{ display: "block", padding: "8px 4px", textDecoration: "none", color: "#333" }}
                  >
                    {c.nome}
                  </Link>
                ))}
                {cantieri.length === 0 && <p style={{ color: "#666", fontSize: 13 }}>Nessun cantiere ancora.</p>}
              </div>
            )}

            {menuAperto === "archivio" && (
              <div>
                {cantieriArchiviati.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 4px",
                      fontSize: 14,
                    }}
                  >
                    <Link href={`/cantieri/${c.id}`} style={{ color: "#333", textDecoration: "none" }}>
                      {c.nome}
                    </Link>
                    <button onClick={() => ripristinaCantiere(c.id)} style={{ fontSize: 12, padding: "2px 8px" }}>
                      Ripristina
                    </button>
                  </div>
                ))}
                {cantieriArchiviati.length === 0 && (
                  <p style={{ color: "#666", fontSize: 13 }}>Nessun cantiere archiviato.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
