---
type: file-explanation
source_path: "frontend/app/global-error.tsx"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# global-error.tsx — global-error.tsx 설명

## 이 파일은 무엇을 책임지나

`global-error.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/global-error.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `GlobalError`

## 연결되는 파일

- [[ERP/frontend/app/📁_app]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```tsx
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
```
