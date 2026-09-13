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
      <body>{children}</body>
    </html>
  );
}
