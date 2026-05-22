---
type: file-explanation
source_path: "frontend/app/error.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# error.tsx — error.tsx 설명

## 이 파일은 무엇을 책임지나

`error.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/error.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ErrorBoundary`

## 연결되는 파일

- [[ERP/frontend/app/📁_app]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
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
```
