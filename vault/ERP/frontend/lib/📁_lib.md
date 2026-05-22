---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/
tags: [vault, index, folder-marker]
aliases:
  - "lib"
  - "lib.md"
---

# 📁 lib

> [!summary] 역할
> 전체 프론트엔드의 API hub, MES 도메인 유틸, 공용 UI 컴포넌트를 집약한 shared 레이어.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/lib/` 의 vault 미러.

## 어떤 파일들이 있나

**API 진입점 (루트)**
- [[erp/frontend/lib/api.ts.md|api.ts]] — API hub barrel. `api-core.ts` + 11개 도메인 모듈을 묶어 `@/lib/api` 단일 경로로 re-export. 앱 전체가 여기서 임포트.
- [[erp/frontend/lib/api-core.ts.md|api-core.ts]] — `fetch` 래퍼(`fetcher`, `postJson`, `putJson`, `patchJson`), URL 빌더(`toApiUrl`), 에러 파서. 모든 API 호출의 실제 진입점.

**MES 도메인 유틸 (루트 레거시 — barrel로 `@/lib/mes` 에 통합됨)**
- `mes-department.ts`, `mes-format.ts`, `mes-status.ts` — Round-3 이전 경로. 신규 코드는 `mes/` 하위 사용.

**api/ — 도메인별 API 모듈 (11개)**
- `items.ts`, `inventory.ts`, `employees.ts`, `admin.ts`, `catalog.ts`, `production.ts`
- `io.ts`, `stock-requests.ts`, `departments.ts`, `weekly.ts`, `core.ts`
- `types/` — `shared.ts`, `catalog.ts`, `departments.ts`, `dept-adjustment.ts`, `employees.ts`, `inventory.ts`, `io.ts`, `items.ts`, `production.ts`, `stock-requests.ts`, `weekly.ts`

**mes/ — MES 도메인 순수 유틸 (10개, barrel: `@/lib/mes`)**
- `color.ts` / `colorUtils.ts` — `LEGACY_COLORS`, 색상 헬퍼
- `department.ts` — `normalizeDepartment`
- `employee.ts` — `firstEmployeeLetter`
- `format.ts` — 날짜·수량 포맷터
- `inventory.ts` — 재고 도메인 유틸
- `item.ts` — 품목 도메인 유틸
- `process.ts` — 공정 유형 유틸
- `status.ts` — 상태 레이블·색상
- `transaction.ts` — 거래 도메인 유틸

**ui/ — cross-feature 공용 UI (barrel: `@/lib/ui`)**
- `Toast.tsx`, `ConfirmModal.tsx`, `BottomSheet.tsx`, `Tooltip.tsx`, `TruncatedText.tsx`
- `useFocusTrap.ts`

## 도메인 컨텍스트

`api.ts` → `api-core.ts` → `api/<domain>.ts` 3단계 구조.  
앱 어디서든 `import { api, type Item } from "@/lib/api"` 한 줄로 해결된다.  
`mes/` 유틸은 React 없는 순수 TS — 서버/클라이언트 어디서도 사용 가능.  
`ui/` 는 Round-14 에서 `features/mes/shared` 에서 이동한 cross-feature modal/sheet/toast.

## ⚠️ 위험 포인트

- `api-core.ts` 의 `fetcher` / `postJson` 수정은 전체 API 호출에 영향. 에러 핸들링 / 인증 헤더 변경 시 반드시 검토.
- 루트의 `mes-*.ts` 파일들은 레거시 경로 — 삭제하지 말 것. `@/lib/mes` barrel 이 내부적으로 재-export.
- `api/types/shared.ts` 의 `TransactionType` 은 frontend 전체에서 참조 — 신규 타입 추가 시 백엔드 스키마와 동기화 필요.

## 관련 가이드

- [[erp/_vault/guides/api-layer]]
- [[erp/_vault/guides/mes-utils]]

## 자식 폴더

- [[erp/frontend/lib/__tests__/📁___tests__|__tests__/]]
- [[erp/frontend/lib/api/📁_api|api/]]
- [[erp/frontend/lib/mes/📁_mes|mes/]]
- [[erp/frontend/lib/ui/📁_ui|ui/]]
