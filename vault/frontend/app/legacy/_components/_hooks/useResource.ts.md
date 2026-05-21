---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useResource.ts
tags: [vault, code-note, c-tier]
---

# useResource — 범용 fetch 훅 (data/loading/error/reload)

> [!summary] 외부 라이브러리 없이 로딩/에러/재시도 통일. fetcher(signal) → Resource<T> 타입

## 1. 역할

fetcher + deps → data/loading/error/reload. AbortController signal 지원(race 방지). deps 변화 시 자동 재조회.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_hooks/useResource.ts` ([[erp/frontend/app/legacy/_components/_hooks/useResource.ts|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts|useInventoryData]]
- [[erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts|useHistoryData]]
