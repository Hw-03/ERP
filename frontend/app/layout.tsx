import type { Metadata, Viewport } from "next";
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

// 항목 7-2 — 모바일에서 입력 포커스 시 화면 자동확대(iOS 줌) + 핀치줌 차단으로 뷰포트를 고정한다.
// 검색창 글자가 16px 미만이라 포커스 때 확대되던 문제를 viewport 잠금으로 근본 차단.
// 데스크톱 브라우저는 user-scalable/maximum-scale 을 대체로 무시하므로 실질 영향은 모바일 한정.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
