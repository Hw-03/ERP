import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Pretendard 변수 폰트를 self-host 로드 — OS/브라우저와 무관하게 동일 렌더.
// 변수 폰트(45~920)라 font-black(900)·font-extrabold(800)까지 한 파일로 커버한다.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  weight: "45 920",
  display: "swap",
  variable: "--font-pretendard",
});

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
    <html lang="ko" className={pretendard.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
