---
type: index
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/
tags: [vault, index, folder-marker]
aliases:
  - "api"
  - "api.md"
---

# 📁 api

> [!summary] 역할
> 백엔드 REST API 와 1:1 대응하는 도메인별 fetch 모듈 모음.

> [!info] 코드 미러 영역
> 이 폴더는 `erp/frontend/lib/api/` 의 vault 미러.

## 어떤 파일들이 있나

핵심 진입점:
- [[erp/frontend/lib/api/core.ts|core.ts]] — `../api-core` thin re-export. 새 코드는 `@/lib/api/core` 사용 권장
- [[erp/frontend/lib/api/index.ts|index.ts]] — barrel. `@/lib/api` import 호환 유지

도메인 모듈 (백엔드 라우터 1:1):
- [[erp/frontend/lib/api/items.ts|items.ts]] — 품목 CRUD 4 메소드 + `updateBomCompletion`
- [[erp/frontend/lib/api/inventory.ts|inventory.ts]] — 재고 조작 9 메소드 (입고·조정·이동·불량·반납·위치조회)
- [[erp/frontend/lib/api/production.ts|production.ts]] — 생산영수증·BOM 체크·거래내역·수정이력·엑셀 export 11 메소드
- [[erp/frontend/lib/api/employees.ts|employees.ts]] — 직원 CRUD + PIN 검증/초기화/변경·테마 저장 8 메소드
- [[erp/frontend/lib/api/departments.ts|departments.ts]] — 부서 CRUD + 순서변경 + `getAppSession`
- [[erp/frontend/lib/api/catalog.ts|catalog.ts]] — 제품 모델 3 메소드 + BOM 7 메소드
- [[erp/frontend/lib/api/stock-requests.ts|stock-requests.ts]] — 창고 결재 흐름 11 메소드 + draft 장바구니 4 메소드
- [[erp/frontend/lib/api/io.ts|io.ts]] — 입출고 배치 초안(preview/draft/submit) 8 메소드
- [[erp/frontend/lib/api/weekly.ts|weekly.ts]] — 주간 생산 보고서 1 메소드 (Decimal→number 정규화 내장)
- [[erp/frontend/lib/api/admin.ts|admin.ts]] — 관리자 PIN·DB 리셋·감사 CSV 7 메소드
- [[erp/frontend/lib/api/dept-adjustment.ts|dept-adjustment.ts]] — 부서 조정 BOM 템플릿·submit 3 메소드

## 도메인 컨텍스트

모든 모듈은 `../api-core` 의 `fetcher / postJson / putJson / patchJson / deleteJson / toApiUrl` 를 공유한다. 외부 호환을 위해 `frontend/lib/api.ts` (루트 파일)가 각 도메인 api 객체를 spread merge 하므로, 기존 `api.getItems(...)` 패턴은 그대로 유효하다.

`weekly.ts` 는 백엔드 Pydantic Decimal 이 JSON 에서 문자열로 직렬화되는 문제를 경계에서 `Number()` 로 정규화한다 (`normalizeMatrix`).

## ⚠️ 위험 포인트

- `production.ts` 의 `getTransactions` 는 `transaction_type` (단수)와 `transaction_types` (복수, 쉼표 구분) 파라미터가 공존한다. 혼용 주의.
- `inventory.ts` 의 `markDefective` 는 `source` 가 `"warehouse" | "production"` 중 하나여야 하며, `target_department` 가 필수다.
- `dept-adjustment.ts` 는 `@/lib/api/types/dept-adjustment` 를 전용 타입 파일로 사용한다 (shared.ts 가 아님).

## 관련 가이드

- [[erp/_vault/guides/api-core]]

## 자식 폴더

- [[erp/frontend/lib/api/types/📁_types|types/]]
