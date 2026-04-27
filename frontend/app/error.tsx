"use client";

// Next.js App Router 의 라우트 단위 ErrorBoundary.
// 라우트 안에서 throw 된 모든 에러를 여기로 잡는다(빌드 시 자동 활성).

import { useEffect } from "react";

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="text-3xl font-black">화면을 표시하는 중 오류가 발생했습니다</div>
      <div className="max-w-2xl text-sm opacity-80">
        {error.message || "알 수 없는 오류"}
        {error.digest && (
          <span className="ml-2 rounded bg-black/10 px-2 py-0.5 text-xs opacity-70">
            digest: {error.digest}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-[12px] border px-5 py-2.5 text-sm font-bold"
        >
          다시 시도
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/legacy";
          }}
          className="rounded-[12px] border px-5 py-2.5 text-sm font-bold"
        >
          대시보드로 이동
        </button>
      </div>
    </div>
  );
}
