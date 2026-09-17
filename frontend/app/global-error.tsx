"use client";

// 최상위 fallback. layout.tsx 자체에서 throw 된 경우만 여기로 떨어진다.
// HTML/body 를 직접 렌더해야 한다(이 경우 layout 이 동작하지 않음).

import { useEffect } from "react";
import { RecoveryScreen } from "./RecoveryScreen";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <RecoveryScreen title="DEXCOWIN MES를 열지 못했습니다" description="잠시 후 다시 시도하거나 대시보드로 이동해 주세요." onRetry={reset} />
      </body>
    </html>
  );
}
