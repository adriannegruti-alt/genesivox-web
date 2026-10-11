import "./globals.css";
import AppShell from "./AppShell";
import RegistraPWA from "@/components/RegistraPWA";
import BannerOffline from "@/components/BannerOffline";

export const metadata = {
  title: "GENESIVOX",
  description: "Piattaforma GENESIVOX — area clienti e amministrazione",
  manifest: "/manifest.json",
  // Icona e comportamento quando l'app viene aggiunta alla schermata Home di un iPhone/iPad
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "GENESIVOX",
    statusBarStyle: "default" as const,
  },
};

// Colore della barra del telefono quando l'app è aperta
export const viewport = {
  themeColor: "#1a73e8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <RegistraPWA />
        <BannerOffline />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
