---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts
tags: [vault, code-note, c-tier]
---

# useHistoryData — 입출고 거래 내역 fetch + 무더보기

> [!summary] logs[] fetch, operations/dateFilter/debouncedSearch/department/model 필터. loading/loadingMore/canLoadMore/loadMore 상태

## 1. 역할

api.getTransactionLogs() 호출. 필터 여러개(작업종류·날짜·검색·부서·모델). 페이징 지원(loadMore). logs/setLogs 상태.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts` ([[erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts|useInventoryData]]
- [[erp/frontend/app/legacy/_components/_hooks/useResource.ts|useResource]]
