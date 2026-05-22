---
type: file-explanation
source_path: "_attic/frontend/_archive/standalone-app-routes/history/page.tsx"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# page.tsx — page.tsx 설명

## 이 파일은 무엇을 책임지나

`page.tsx`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryPage`
- `KeyboardEvent`
- `TransactionLog`
- `TransactionType`
- `PeriodFilter`
- `ToastState`

## 연결되는 파일

- [[ERP/_attic/frontend/_archive/standalone-app-routes/history/📁_history]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CalendarRange, Pencil, ScrollText, Search } from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type TransactionLog, type TransactionType } from "@/lib/api";

const TYPE_OPTIONS: { label: string; value: TransactionType | "ALL" }[] = [
  { label: "전체",     value: "ALL" },
  { label: "입고",     value: "RECEIVE" },
  { label: "출고",     value: "SHIP" },
  { label: "생산입고", value: "PRODUCE" },
  { label: "조정",     value: "ADJUST" },
  { label: "자동차감", value: "BACKFLUSH" },
];

const PERIOD_OPTIONS = [
  { label: "전체",      value: "ALL" },
  { label: "오늘",      value: "TODAY" },
  { label: "이번 주",   value: "WEEK" },
  { label: "최근 30일", value: "MONTH" },
] as const;
type PeriodFilter = (typeof PERIOD_OPTIONS)[number]["value"];

const TX_TYPE_LABEL: Record<string, string> = {
  RECEIVE: "입고", PRODUCE: "생산입고", SHIP: "출고", ADJUST: "조정", BACKFLUSH: "자동차감",
};
const TX_TYPE_BADGE: Record<string, string> = {
  RECEIVE:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  PRODUCE:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  SHIP:      "border-red-500/30 bg-red-500/10 text-red-200",
  ADJUST:    "border-amber-500/30 bg-amber-500/10 text-amber-200",
  BACKFLUSH: "border-orange-500/30 bg-orange-500/10 text-orange-200",
};

type ToastState = { message: string; type: "success" | "error" } | null;

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [selectedType,   setSelectedType]   = useState<TransactionType | "ALL">("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>("ALL");
  const [search,         setSearch]         = useState("");
  const [selected,       setSelected]       = useState<TransactionLog | null>(null);
  const [focusedIndex,   setFocusedIndex]   = useState(0);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesInput,   setNotesInput]   = useState("");
  const [savingNotes,  setSavingNotes]  = useState(false);
  const [toast,        setToast]        = useState<ToastState>(null);

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```
