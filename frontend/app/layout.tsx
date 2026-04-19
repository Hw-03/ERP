import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "X-Ray ERP | 재고 운영 워크스페이스",
  description: "정형 X-ray 장비 제조를 위한 ERP 재고, 입출고, 관리자 운영 화면",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏭</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className="h-dvh overflow-hidden bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
