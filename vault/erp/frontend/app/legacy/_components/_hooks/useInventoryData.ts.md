---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useInventoryData.ts
tags: [vault, code-note, b-tier]
---

# useInventoryData.ts — 재고 목록 fetch + selectedItem 동기화 훅

> [!summary] 역할
> DesktopInventoryView 의 Item[] 조회 + selectedItem 메타데이터 동기화. globalSearch 변경 시 재조회.

## 1. 이 파일의 역할
- UseInventoryDataOptions: globalSearch/onStatusChange/onSelectedSync? 콜백
- loadItems() — api.getItems({limit:2000, search}) 호출 + 상태 업데이트
- onSelectedSync?(nextItems) — selectedItem의 최신 정보 동기화 (외부 호출자 책임)
- loading/error 상태 + setItems setter 노출

## 2. 실제 원본 위치
`frontend/app/legacy/_components/_hooks/useInventoryData.ts` — 약 70줄

## 3. 주요 import
```typescript
import { useCallback, useEffect, useState } from "react";
import { api, type Item } from "@/lib/api";
```

## 4. 어디서 쓰이는지
- DesktopInventoryView: 재고 검색/조회 + selectedItem 상태 관리
- 검색창 입력 시 globalSearch 변경 → loadItems 재호출

## 5. ⚠️ 위험 포인트
- **selectedItem은 훅이 관리하지 않음** — 부모가 setSelectedItem 호출. selectedItem이 stale될 수 있음 (onSelectedSync로 보정)
- onStatusChange는 로딩/에러 알림 콜백 — 부모가 상태바/토스트 표시 책임
- limit:2000 hardcoded — 그 이상 아이템은 조회 불가

## 6. 수정 전 체크
- globalSearch "" → loadItems → 전체 Item 조회 확인
- globalSearch "3-AR" → loadItems → 필터 적용된 Item만 확인
- error 발생 시 onStatusChange(message) 호출 확인
