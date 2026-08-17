import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";
import "./globals.css";

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LCB — Fichas técnicas",
  description: "Generador interno de fichas técnicas a partir de EasyBroker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={workSans.variable}>
      <body>{children}</body>
    </html>
  );
}
