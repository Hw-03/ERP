---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts
tags: [vault, code-note, c-tier]
---

# useInventoryData — 인벤토리 데이터 fetch + 상태 훅

> [!summary] items[] fetch, setItems, loading/error 상태. globalSearch/onStatusChange 의존성 재조회

## 1. 역할

api.getInventory() 호출. globalSearch/onStatusChange 변화 시 재조회. items/setItems/loading/error/loadItems 반환.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts` ([[erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts|원본]])

## 3. 관련 형제 파일

- [[erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts|useHistoryData]]
- [[erp/frontend/app/legacy/_components/_hooks/useResource.ts|useResource]]
