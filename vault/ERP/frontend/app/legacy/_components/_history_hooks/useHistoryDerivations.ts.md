---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_hooks/useHistoryDerivations.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useHistoryDerivations.ts — useHistoryDerivations.ts 설명

## 이 파일은 무엇을 책임지나

`useHistoryDerivations.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `parseEmployeeName`
- `parseUtc`
- `toDateKey`
- `useHistoryDerivations`
- `as`
- `HistoryFilters`
- `HistorySummary`
- `UseHistoryDerivationsResult`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useMemo } from "react";
import type { Item, ProductModel, TransactionLog, TransactionType } from "@/lib/api";

export interface HistoryFilters {
  date: string;
  type: string;
  employee: string;
  model: string;
  search: string;
}

/**
 * mobile HistoryScreen 의 거래 로그 derivation chain.
 *
 * Round-10B (#5) 추출. logs/items/calendarLogs/filters 입력에 대해 다음 useMemo
 * chain 을 단일 hook 으로 묶었다:
 *   - parseEmployeeName / getPeriodStart / parseUtc / toDateKey 헬퍼
 *   - itemModelMap / employeeNames / modelNames
 *   - filteredLogs (filters 적용)
 *   - summary (count/inSum/outSum)
 *   - groupedByDay (date key 그룹)
 *   - calendarDayMap / calendarDays
 *
 * 동작 변화 0 — 기존 useMemo 호출 순서/dependency 그대로 보존.
 */

export function parseEmployeeName(value?: string | null) {
  if (!value) return "";
  return value.split("(")[0]?.trim() ?? value;
}

export function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function toDateKey(iso: string) {
  const d = parseUtc(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getPeriodStart(value: string) {
  const now = new Date();
  if (value === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "WEEK") {
    const copy = new Date(now);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (value === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}
```
