---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_hooks/useHistoryData.ts
tags: [vault, code-note, b-tier]
---

# useHistoryData.ts — 입출고 거래 내역 페이지네이션 조회 훅

> [!summary] 역할
> 서버사이드 필터로 TransactionLog 페이지네이션. 필터 변경 시 초기화 + stale 응답 방지.

## 1. 이 파일의 역할
- useHistoryData(operations/dateFilter/debouncedSearch/department/model) — 거래 조회 훅
- operations/department: 쉼표 결합(다중), dateFilter: "last_30_days" 등, selectedDateKey: "YYYY-MM-DD" (달력)
- canLoadMore = (마지막 응답 길이 === HISTORY_PAGE_SIZE)
- loadMore() 호출 중 필터 변경 시 stale 응답 무시 (queryKey ref 가드)

## 2. 실제 원본 위치
`frontend/app/legacy/_components/_hooks/useHistoryData.ts` — 약 100줄

## 3. 주요 import
```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type TransactionLog } from "@/lib/api";
import { HISTORY_PAGE_SIZE } from "../_history_sections/historyConstants";
import { dateFilterToFrom } from "../_history_sections/historyQuery";
```

## 4. 어디서 쓰이는지
- DesktopHistoryView: 거래 목록/필터/달력 페이지네이션
- 모바일 입출고 내역 화면

## 5. ⚠️ 위험 포인트
- **skipRef.current로 오프셋 관리** — 페이지네이션 구현이 offset 기반 (커서 vs offset 성능 차이)
- debouncedSearch 변경 시 로딩(setLoading(true)) — 부모가 350ms 디바운스 후 set 하면 그제야 API 호출
- selectedDateKey가 있으면 dateFilter 무시 — 달력 선택과 범위 선택이 배타적

## 6. 수정 전 체크
- useHistoryData() 호출 후 loading=true 초기 상태 확인
- operations/dateFilter 변경 시 logs 초기화 → 재조회 확인
- loadMore() 호출 중 필터 변경 → stale 응답 무시 확인
