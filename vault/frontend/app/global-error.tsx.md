---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/global-error.tsx
status: active
updated: 2026-04-27
source_sha: fde7f1a4af8d
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# global-error.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/global-error.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1293` bytes

## 연결

- Parent hub: [[frontend/app/app|frontend/app]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
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
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
