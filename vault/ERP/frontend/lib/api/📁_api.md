---
type: folder-note
source_path: "frontend/lib/api"
importance: important
layer: frontend
graph: hub
updated: 2026-05-22
project: DEXCOWIN MES
---

# 📁 api

## 이 폴더는 무엇을 위한 곳인가

프론트엔드가 백엔드 API를 부르는 도메인별 통로입니다.

## 현장 업무와의 관계

화면은 직접 fetch를 하기보다 이 폴더의 함수를 통해 품목, 재고, 직원, 요청 데이터를 가져옵니다.

## 언제 보면 좋나

- 화면과 백엔드 API 연결을 추적할 때
- 응답 타입이나 에러 처리를 확인할 때

## 주요 하위 폴더

- [[ERP/frontend/lib/api/types/📁_types]] — `frontend/lib/api/types`는 프론트엔드 화면이나 공용 로직의 세부 폴더입니다.

## 먼저 볼 파일 5개

- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/frontend/lib/api/catalog.ts]] — `catalog.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/frontend/lib/api/core.ts]] — `core.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/frontend/lib/api/defects.ts]] — `defects.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/frontend/lib/api/departments.ts]] — `departments.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

> [!info]- 추가 파일
> - [[ERP/frontend/lib/api/dept-adjustment.ts]] — dept-adjustment.ts
> - [[ERP/frontend/lib/api/employees.ts]] — employees.ts
> - [[ERP/frontend/lib/api/index.ts]] — index.ts
> - [[ERP/frontend/lib/api/inventory.ts]] — inventory.ts
> - [[ERP/frontend/lib/api/io.ts]] — io.ts
> - [[ERP/frontend/lib/api/items.ts]] — items.ts
> - [[ERP/frontend/lib/api/production.ts]] — production.ts
> - [[ERP/frontend/lib/api/stock-requests.ts]] — stock-requests.ts
> - [[ERP/frontend/lib/api/weekly.ts]] — weekly.ts

## 조심할 점

API 경로나 응답 해석을 바꾸면 화면 전체 데이터 흐름이 깨질 수 있습니다.

## 다음에 볼 위치

- 상위 폴더: [[ERP/frontend/lib/📁_lib]]
