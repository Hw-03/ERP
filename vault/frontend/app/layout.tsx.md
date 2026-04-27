---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/layout.tsx
status: active
updated: 2026-04-27
source_sha: fe12a034b83d
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# layout.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/layout.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `628` bytes

## 연결

- Parent hub: [[frontend/app/app|frontend/app]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEXCOWIN 재고 관리 시스템",
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
    <html lang="ko" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
