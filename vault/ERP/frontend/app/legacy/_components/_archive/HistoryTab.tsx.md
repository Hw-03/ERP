---
type: file-explanation
source_path: "frontend/app/legacy/_components/_archive/HistoryTab.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryTab.tsx — HistoryTab.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryTab.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryTab`
- `LogRow`
- `Item`
- `TransactionLog`
- `TransactionType`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ChevronLeft, ChevronRight, List, CalendarDays } from "lucide-react";
import { api, type Item, type TransactionLog, type TransactionType } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import {
  LEGACY_COLORS,
  employeeColor,
  firstEmployeeLetter,
  formatNumber,
  normalizeModel,
  transactionColor,
  transactionLabel,
} from "./legacyUi";

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "입고", value: "RECEIVE" },
  { label: "출고", value: "SHIP" },
  { label: "조정", value: "ADJUST" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

const PAGE_SIZE = 100;

function parseEmployeeName(value?: string | null) {
  if (!value) return "";
  return value.split("(")[0]?.trim() ?? value;
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

function parseUtc(iso: string) {
  return new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
```
