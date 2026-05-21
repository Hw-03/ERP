---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/components/CategoryCard.tsx
status: active
updated: 2026-04-27
source_sha: 5d14d7d67f57
tags:
  - erp
  - frontend
  - source-file
  - tsx
---

# CategoryCard.tsx

> [!summary] 역할
> 원본 프로젝트의 `CategoryCard.tsx` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `frontend/components/CategoryCard.tsx`
- Layer: `frontend`
- Kind: `source-file`
- Size: `5195` bytes

## 연결

- Parent hub: [[frontend/components/components|frontend/components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````tsx
"use client";

import { type Category, type CategorySummary } from "@/lib/api";

interface CategoryMeta {
  badge: string;
  border: string;
  dot: string;
  icon: string;
  shortName: string;
}

const CATEGORY_META: Record<Category, CategoryMeta> = {
  RM: {
    badge: "bg-slate-700 text-slate-200",
    border: "border-l-slate-500",
    dot: "bg-slate-400",
    icon: "🧱",
    shortName: "원자재",
  },
  TA: {
    badge: "bg-blue-900/60 text-blue-300",
    border: "border-l-blue-600",
    dot: "bg-blue-400",
    icon: "🧪",
    shortName: "튜브 반제품",
  },
  TF: {
    badge: "bg-blue-800/60 text-blue-200",
    border: "border-l-blue-400",
    dot: "bg-blue-300",
    icon: "🔵",
    shortName: "튜브 완제품",
  },
  HA: {
# ... (이하 138줄 생략. 원본 참조)

````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
