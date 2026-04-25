"use client";

// 최상위 fallback. layout.tsx 자체에서 throw 된 경우만 여기로 떨어진다.
// HTML/body 를 직접 렌더해야 한다(이 경우 layout 이 동작하지 않음).

import { useEffect } from "react";

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
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", padding: "48px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>
          치명적인 오류가 발생했습니다
        </h1>
        <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
          {error.message || "알 수 없는 오류"}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "10px 20px",
            border: "1px solid #888",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
            background: "transparent",
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
