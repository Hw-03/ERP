---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_warehouse_sections/DepartmentQueuePanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# DepartmentQueuePanel — 부서별 결재 큐

> [!summary] 역할
> 부서 결재자의 제출 요청 큐. API를 department-* 엔드포인트로 사용.

## 1. 이 파일의 역할

WarehouseQueuePanel과 유사하지만, api.listDepartmentQueue 등 부서별 전용 API 사용. 결재자 부서와 일치하는 요청만 백엔드 필터. WarehouseQueueRow 재사용. 승인/반려 PIN 검증 flow 동일.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_warehouse_sections/DepartmentQueuePanel.tsx` ([[erp/frontend/app/legacy\_components\_warehouse_sections/DepartmentQueuePanel.tsx|원본]])

## 3. 주요 import

- React: `useCallback`, `useEffect`, `useState`
- `api`, `StockRequest`, `ApiError`
- `WarehouseQueueRow` (재사용)
- 공통: `EmptyState`, `LoadFailureCard`, `LoadingSkeleton`

## 4. 어디서 쓰이는지

- WarehouseDraftPanelTabs에서 "dept_queue" 탭
- 부서 결재자 권한 확인 후 렌더

## 5. ⚠️ 위험 포인트

> [!warning] api.listDepartmentQueue vs api.listQueue 구분 필수
> 부서별 필터 검증은 백엔드 담당 — 프론트 재검증 불필요

## 6. 수정 전 체크

- [ ] department-* API 엔드포인트 이름 변경 시 동기화
- [ ] approverEmployeeId null 체크 (권한 누락)
