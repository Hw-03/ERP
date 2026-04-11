import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "X-Ray ERP | 정밀 제조 재고 관리",
  description: "정밀 X-ray 장비 제조 ERP를 위한 11단계 공정 재고 관리 대시보드",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
