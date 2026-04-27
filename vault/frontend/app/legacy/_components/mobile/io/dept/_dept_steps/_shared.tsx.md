---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_shared.tsx
status: active
updated: 2026-04-27
source_sha: 204bf593cf86
tags:
  - erp
  - frontend
  - frontend-module
  - tsx
---

# _shared.tsx

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_shared.tsx`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `848` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/_dept_steps/_dept_steps|frontend/app/legacy/_components/mobile/io/dept/_dept_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { LEGACY_COLORS } from "../../../../legacyUi";
import { TYPO } from "../../../tokens";

export function StepHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-[2px]">
      <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
        {title}
      </div>
      {hint ? (
        <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export const ITEM_CATEGORIES = [
  { id: "ALL", label: "전체" },
  { id: "RM", label: "원자재" },
  { id: "A", label: "조립품" },
  { id: "F", label: "반제품" },
  { id: "FG", label: "완제품" },
] as const;

export type ItemCategoryId = (typeof ITEM_CATEGORIES)[number]["id"];
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
