---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/primitives/index.ts
status: active
updated: 2026-04-27
source_sha: 8ab2180bdf74
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# index.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/primitives/index.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `904` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/primitives/primitives|frontend/app/legacy/_components/mobile/primitives]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
export { IconButton } from "./IconButton";
export { StatusBadge } from "./StatusBadge";
export { KpiCard } from "./KpiCard";
export { SectionHeader } from "./SectionHeader";
export { SheetHeader } from "./SheetHeader";
export { FilterChip, FilterChipRow } from "./FilterChip";
export { Stepper } from "./Stepper";
export { StickyFooter } from "./StickyFooter";
export { WizardProgress } from "./WizardProgress";
export { WizardHeader } from "./WizardHeader";
export { PersonAvatar } from "./PersonAvatar";
export { ItemRow } from "./ItemRow";
export { EmptyState } from "./EmptyState";
export { InlineSearch } from "./InlineSearch";
export { AsyncState, AsyncSkeletonRows } from "./AsyncState";
export { SummaryChipBar, type SummaryChip } from "./SummaryChipBar";
export { SectionCard, SectionCardRow } from "./SectionCard";
export { PrimaryActionButton } from "./PrimaryActionButton";
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
