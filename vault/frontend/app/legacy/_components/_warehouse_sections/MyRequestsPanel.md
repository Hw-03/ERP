---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestsPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# MyRequestsPanel — 내 입출고 요청 목록

> [!summary] 역할
> 현재 로그인한 사용자의 입출고 요청(StockRequest) 목록 표시 및 취소 기능.

## 1. 이 파일의 역할

사용자별 작업 요청 목록 로드 및 표시. 취소 PIN 확인 모달로 사용자 의도 재확인. loading/loadError 상태 관리. refreshNonce 감지 시 자동 reload 트리거.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestsPanel.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_sections/MyRequestsPanel.tsx|원본]])

## 3. 주요 import

- React: `useCallback`, `useEffect`, `useState`
- `api`, `StockRequest` from `@/lib/api`
- `MyRequestRow` (자식)
- `LEGACY_COLORS`, `EmptyState`, `LoadFailureCard`, `LoadingSkeleton` (공통)
- `ConfirmModal` from `@/lib/ui/ConfirmModal`

## 4. 어디서 쓰이는지

- WarehouseDraftPanelTabs에서 "mine" 탭 렌더
- MyRequestRow로 개별 요청 행 표시
- 부모: 입출고 섹션 관리

## 5. ⚠️ 위험 포인트

> [!warning] 취소 PIN 입력 모달 — 입력 실패 시 상태 초기화 확인
> employeeId null 체크 필수 — API 호출 차단

## 6. 수정 전 체크

- [ ] api.listMyStockRequests 응답 포맷 변경 시 state 동기화
- [ ] refreshNonce 변경 감지 후 reload 타이밍 확인
