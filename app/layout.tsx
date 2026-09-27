import "./globals.css";
import AppShell from "./AppShell";
import RegistraPWA from "@/components/RegistraPWA";
import BannerOffline from "@/components/BannerOffline";

export const metadata = {
  title: "GENESIVOX",
  description: "Piattaforma GENESIVOX — area clienti e amministrazione",
  manifest: "/manifest.json",
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
