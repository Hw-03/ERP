# index.ts

## 이 파일은 뭐예요?
`common/` 폴더의 공개 API를 한 곳에서 re-export하는 배럴 파일입니다. 외부에서 이 폴더의 컴포넌트를 임포트할 때 항상 이 파일을 거칩니다.

## 언제 보나요?
- common 컴포넌트를 추가하거나 제거할 때 이 파일에 export 행을 함께 수정해야 함
- 다른 파일이 `from "@/app/mes/_components/common"` 경로로 임포트하는 모든 상황

## 중요한 내용
- `ResultModal`, `ResultKind` — ResultModal.tsx
- `EmptyState`, `EmptyStateVariant` — EmptyState.tsx
- `LoadFailureCard` — LoadFailureCard.tsx
- `LoadingSkeleton` — LoadingSkeleton.tsx
- `StatusPill`, `StatusPillTone`, `inferToneFromStatus` — StatusPill.tsx
- `FilterChip` — FilterChip.tsx
- `SlidePanel` — SlidePanel.tsx
- `KpiCard` — KpiCard.tsx
- `AppSelect`는 이 파일에 포함되지 않음 — 직접 import 필요

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/common/AppSelect.tsx]] — index에서 누락된 유일한 컴포넌트
