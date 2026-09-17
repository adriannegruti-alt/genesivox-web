import "./globals.css";
import AppShell from "./AppShell";

export const metadata = {
  title: "GENESIVOX",
  description: "Piattaforma GENESIVOX — area clienti e amministrazione",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
