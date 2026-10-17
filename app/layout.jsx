import "./globals.css";

export const metadata = {
  title: "Painel Psico",
  description: "Avaliação neuropsicológica",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
