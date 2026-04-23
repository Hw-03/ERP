import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEXCOWIN 재고 관리 시스템",
  description: "DEXCOWIN 재고 및 입출고 관리 시스템",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>X</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
