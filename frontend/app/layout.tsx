import type { Metadata } from "next";
import "./globals.css";

const isDevServer = process.env.NEXT_PUBLIC_MES_ENV === "dev";

export const metadata: Metadata = {
  title: isDevServer ? "MES 개발" : "DEXCOWIN MES",
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
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
