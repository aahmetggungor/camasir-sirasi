import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ÇamaşırSırası · Alan yönetimi",
  description:
    "Ortak çamaşırhanenin makinelerini, üyelerini ve rezervasyonlarını tek bir yerde yönet.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
