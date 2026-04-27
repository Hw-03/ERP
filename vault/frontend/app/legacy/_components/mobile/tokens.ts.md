---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/tokens.ts
status: active
updated: 2026-04-27
source_sha: d4f14ebbb5ef
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# tokens.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/tokens.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `668` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/mobile|frontend/app/legacy/_components/mobile]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

export const TYPO = {
  overline: "text-[10px]",
  caption: "text-xs",
  body: "text-sm",
  title: "text-base",
  display: "text-xl",
  headline: "text-2xl",
} as const;

export const RADIUS = {
  xs: "rounded-[8px]",
  sm: "rounded-[14px]",
  md: "rounded-[20px]",
  lg: "rounded-[28px]",
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const ELEVATION = {
  none: "none",
  sticky: "0 8px 20px rgba(0,0,0,.28)",
  overlay: "0 18px 44px rgba(0,0,0,.48)",
} as const;

export const DURATION = {
  fast: 120,
  base: 180,
  slow: 260,
} as const;
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
