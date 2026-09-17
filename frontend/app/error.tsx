"use client";

// Next.js App Router 의 라우트 단위 ErrorBoundary.
// 라우트 안에서 throw 된 모든 에러를 여기로 잡는다(빌드 시 자동 활성).

import { useEffect } from "react";
import { RecoveryScreen } from "./RecoveryScreen";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 콘솔에 남기는 것 외엔 외부로 보내지 않음. 로컬 운영 환경 가정.
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <RecoveryScreen title="화면을 표시하지 못했습니다" description="잠시 후 다시 시도해 주세요. 문제가 계속되면 대시보드에서 필요한 화면을 다시 열어주세요." onRetry={reset} />
  );
}
