---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/common/index.ts
status: active
updated: 2026-04-27
source_sha: de7afacd2049
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

- Source: `frontend/app/legacy/_components/common/index.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `391` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/common/common|frontend/app/legacy/_components/common]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
export { ConfirmModal, type ConfirmTone } from "./ConfirmModal";
export { ResultModal, type ResultKind } from "./ResultModal";
export { EmptyState, type EmptyStateVariant } from "./EmptyState";
export { LoadFailureCard } from "./LoadFailureCard";
export { LoadingSkeleton } from "./LoadingSkeleton";
export { StatusPill, type StatusPillTone, inferToneFromStatus } from "./StatusPill";
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
