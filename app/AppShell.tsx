"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Cantiere = { id: string; nome: string };

// Colori di base della barra strumenti — allineati al blu del sito (#1a73e8)
const COLORE_BRAND = "#1a73e8";
const COLORE_BRAND_SFONDO = "#eef4fd";
const COLORE_BRAND_BORDO = "#d6e6fb";
const COLORE_TESTO = "#3c4149";
const COLORE_BORDO_BARRA = "#e4e7ec";

// Colori della tendina laterale — leggera tinta azzurra (coerente col blu del sito)
// invece del grigio/bianco neutro usato prima
const COLORE_SIDEBAR_SFONDO = "#f7fafe";
const COLORE_SIDEBAR_BORDO = "#e1eafb";
const COLORE_SIDEBAR_DIVISORE = "#eaf1fc";

function stileLinkMenu(attivo: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 7,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: attivo ? 600 : 500,
    color: attivo ? COLORE_BRAND : COLORE_TESTO,
    backgroundColor: attivo ? COLORE_BRAND_SFONDO : "transparent",
    border: attivo ? `1px solid ${COLORE_BRAND_BORDO}` : "1px solid transparent",
    transition: "background-color .15s ease, border-color .15s ease",
  };
}

function stileBottoneMenu(attivo: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 7,
    fontSize: 14,
    fontWeight: attivo ? 600 : 500,
    color: attivo ? COLORE_BRAND : COLORE_TESTO,
    backgroundColor: attivo ? COLORE_BRAND_SFONDO : "transparent",
    border: attivo ? `1px solid ${COLORE_BRAND_BORDO}` : "1px solid transparent",
    cursor: "pointer",
    transition: "background-color .15s ease, border-color .15s ease",
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [utente, setUtente] = useState<{ email: string } | null>(null);
  const [autoritaControllo, setAutoritaControllo] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuAperto, setMenuAperto] = useState<"cantieri" | "archivio" | null>(null);

  const [cantieri, setCantieri] = useState<Cantiere[]>([]);
  const [cantieriArchiviati, setCantieriArchiviati] = useState<Cantiere[]>([]);

  // Solo per l'admin: tendina a due livelli, Utenti -> Cantieri di quell'utente
  type UtenteAdmin = { id: string; email: string; impresa: string | null; nome_utente: string | null };
  const [utentiAdmin, setUtentiAdmin] = useState<UtenteAdmin[]>([]);
  const [utenteSelezionato, setUtenteSelezionato] = useState<string | null>(null);
  const [cantieriUtenteSelezionato, setCantieriUtenteSelezionato] = useState<Cantiere[]>([]);
  const [colonnaUtentiEspansa, setColonnaUtentiEspansa] = useState(false);

  // Pagine pubbliche: niente barra/sidebar
  const paginaPubblica =
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/c/") ||
    pathname?.startsWith("/reimposta-password") ||
    pathname?.startsWith("/crea-account");

  useEffect(() => {
    async function carica() {
      const { data } = await supabase.auth.getUser();
      setUtente(data?.user ? { email: data.user.email ?? "" } : null);

      if (data?.user) {
        const { data: profilo } = await supabase
          .from("profili")
          .select("autorita_controllo, ruolo")
          .eq("id", data.user.id)
          .maybeSingle();
        setAutoritaControllo(!!profilo?.autorita_controllo);
        setIsAdmin(profilo?.ruolo === "admin");
      }
    }
    carica();
  }, [pathname]);

  async function apriMenuCantieri() {
    setMenuAperto("cantieri");

    if (isAdmin) {
      setUtenteSelezionato(null);
      setCantieriUtenteSelezionato([]);
      const { data } = await supabase
        .from("profili")
        .select("id, email, impresa, nome_utente")
        .order("email");
      setUtentiAdmin(data || []);
      return;
    }

    const { data } = await supabase
      .from("cantieri")
      .select("id, nome")
      .eq("archiviato", false)
      .order("creato_il", { ascending: false });
    setCantieri(data || []);
  }

  async function selezionaUtenteAdmin(id: string) {
    setUtenteSelezionato(id);
    const { data } = await supabase
      .from("cantieri")
      .select("id, nome")
      .eq("creato_da", id)
      .eq("archiviato", false)
      .order("creato_il", { ascending: false });
    setCantieriUtenteSelezionato(data || []);
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
          height: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          borderBottom: `1px solid ${COLORE_BORDO_BARRA}`,
          backgroundColor: "#fdfdfe",
          boxShadow: "0 1px 2px rgba(16, 24, 40, 0.03)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="shell-topbar-menu" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            href="/dashboard"
            onClick={() => setMenuAperto(null)}
            style={{
              marginRight: 14,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: 0.2,
              color: COLORE_BRAND,
              textDecoration: "none",
            }}
          >
            GENESIVOX
          </Link>
          <button
            onClick={() => (menuAperto === "cantieri" ? setMenuAperto(null) : apriMenuCantieri())}
            style={stileBottoneMenu(menuAperto === "cantieri")}
          >
            I miei cantieri
          </button>
          <button
            onClick={() => (menuAperto === "archivio" ? setMenuAperto(null) : apriMenuArchivio())}
            style={stileBottoneMenu(menuAperto === "archivio")}
          >
            Archivio
          </button>
          {autoritaControllo && (
            <Link
              href="/ispettiva"
              onClick={() => setMenuAperto(null)}
              style={stileLinkMenu(pathname === "/ispettiva")}
            >
              Vista Ispettiva
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMenuAperto(null)}
              style={stileLinkMenu(pathname === "/admin")}
            >
              Admin
            </Link>
          )}
        </div>

        <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          {utente ? (
            <>
              <Link
                href="/account"
                style={{
                  color: COLORE_TESTO,
                  textDecoration: "none",
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: `1px solid ${COLORE_BORDO_BARRA}`,
                }}
              >
                {utente.email}
              </Link>
              <button
                onClick={esci}
                style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: `1px solid ${COLORE_BORDO_BARRA}`,
                  backgroundColor: "transparent",
                  color: COLORE_TESTO,
                  cursor: "pointer",
                }}
              >
                Esci
              </button>
            </>
          ) : (
            <Link href="/login" style={{ color: COLORE_BRAND }}>Accedi</Link>
          )}
        </div>
      </div>

      {/* Corpo: sidebar a tendina (se aperta) + contenuto */}
      <div className="shell-body" style={{ display: "flex" }}>
        {menuAperto && (
          <div
            className="shell-sidebar"
            style={{
              width: menuAperto === "cantieri" && isAdmin ? 420 : 260,
              flexShrink: 0,
              borderRight: `1px solid ${COLORE_SIDEBAR_BORDO}`,
              padding: 16,
              minHeight: "calc(100vh - 54px)",
              backgroundColor: COLORE_SIDEBAR_SFONDO,
            }}
          >
            {menuAperto === "cantieri" && !isAdmin && (
              <div>
                <Link
                  href="/cantieri"
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    marginBottom: 8,
                    backgroundColor: COLORE_BRAND,
                    color: "#fff",
                    borderRadius: 7,
                    textDecoration: "none",
                    textAlign: "center",
                    fontWeight: 500,
                  }}
                >
                  + Nuovo cantiere
                </Link>
                {cantieri.map((c) => (
                  <Link
                    key={c.id}
                    href={`/cantieri/${c.id}`}
                    style={{
                      display: "block",
                      padding: "9px 10px",
                      borderRadius: 6,
                      textDecoration: "none",
                      color: COLORE_TESTO,
                      borderBottom: `1px solid ${COLORE_SIDEBAR_DIVISORE}`,
                    }}
                  >
                    {c.nome}
                  </Link>
                ))}
                {cantieri.length === 0 && <p style={{ color: "#8a8f98", fontSize: 13 }}>Nessun cantiere ancora.</p>}
              </div>
            )}

            {menuAperto === "cantieri" && isAdmin && (
              <div style={{ display: "flex", height: "100%" }}>
                {/* Colonna 1: tutti gli utenti. Si riduce a sole iniziali quando
                    ne hai scelto uno, e si riapre passandoci sopra col mouse. */}
                <div
                  onMouseEnter={() => setColonnaUtentiEspansa(true)}
                  onMouseLeave={() => setColonnaUtentiEspansa(false)}
                  style={{
                    width: utenteSelezionato && !colonnaUtentiEspansa ? 40 : 190,
                    flexShrink: 0,
                    transition: "width .15s ease",
                    overflow: "hidden",
                    borderRight: `1px solid ${COLORE_SIDEBAR_BORDO}`,
                    paddingRight: 8,
                    marginRight: 8,
                  }}
                >
                  <p style={{ fontSize: 11, color: "#8a8f98", margin: "0 0 8px", whiteSpace: "nowrap" }}>
                    {utenteSelezionato && !colonnaUtentiEspansa ? "" : "UTENTI"}
                  </p>
                  {utentiAdmin.map((u) => {
                    const selezionato = utenteSelezionato === u.id;
                    const etichetta = u.impresa || u.nome_utente || u.email;
                    const compatto = !!utenteSelezionato && !colonnaUtentiEspansa;
                    return (
                      <div
                        key={u.id}
                        onMouseEnter={() => selezionaUtenteAdmin(u.id)}
                        title={etichetta}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: compatto ? "5px 2px" : "7px 8px",
                          marginBottom: 3,
                          borderRadius: 6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          backgroundColor: selezionato ? COLORE_BRAND_SFONDO : "transparent",
                          border: selezionato ? `1px solid ${COLORE_BRAND_BORDO}` : "1px solid transparent",
                        }}
                      >
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            flexShrink: 0,
                            backgroundColor: selezionato ? COLORE_BRAND : "#c7d7ef",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {etichetta.charAt(0).toUpperCase()}
                        </span>
                        {!compatto && (
                          <span
                            style={{
                              fontSize: 13,
                              color: COLORE_TESTO,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {etichetta}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {utentiAdmin.length === 0 && !utenteSelezionato && (
                    <p style={{ color: "#8a8f98", fontSize: 12 }}>Nessun utente.</p>
                  )}
                </div>

                {/* Colonna 2: cantieri dell'utente scelto a sinistra */}
                {utenteSelezionato && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, color: "#8a8f98", margin: "0 0 8px" }}>SUOI CANTIERI</p>
                    {cantieriUtenteSelezionato.map((c) => (
                      <Link
                        key={c.id}
                        href={`/cantieri/${c.id}`}
                        onClick={() => setMenuAperto(null)}
                        style={{
                          display: "block",
                          padding: "9px 10px",
                          borderRadius: 6,
                          textDecoration: "none",
                          color: COLORE_TESTO,
                          borderBottom: `1px solid ${COLORE_SIDEBAR_DIVISORE}`,
                        }}
                      >
                        {c.nome}
                      </Link>
                    ))}
                    {cantieriUtenteSelezionato.length === 0 && (
                      <p style={{ color: "#8a8f98", fontSize: 13 }}>Nessun cantiere per questo utente.</p>
                    )}
                  </div>
                )}
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
                      padding: "9px 10px",
                      fontSize: 14,
                      borderBottom: `1px solid ${COLORE_SIDEBAR_DIVISORE}`,
                    }}
                  >
                    <Link href={`/cantieri/${c.id}`} style={{ color: COLORE_TESTO, textDecoration: "none" }}>
                      {c.nome}
                    </Link>
                    <button
                      onClick={() => ripristinaCantiere(c.id)}
                      style={{
                        fontSize: 12,
                        padding: "3px 10px",
                        borderRadius: 6,
                        border: `1px solid ${COLORE_SIDEBAR_BORDO}`,
                        backgroundColor: "#fff",
                        color: COLORE_BRAND,
                        cursor: "pointer",
                      }}
                    >
                      Ripristina
                    </button>
                  </div>
                ))}
                {cantieriArchiviati.length === 0 && (
                  <p style={{ color: "#8a8f98", fontSize: 13 }}>Nessun cantiere archiviato.</p>
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
