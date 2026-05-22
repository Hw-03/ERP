---
type: file-explanation
source_path: "_attic/frontend/_archive/standalone-app-routes/inventory/page.tsx"
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

- `InventoryPage`
- `KpiBar`
- `InventoryPageInner`
- `KeyboardEvent`
- `Category`
- `Item`
- `TransactionLog`
- `ActionMode`
- `StockFilter`
- `ToastState`

## 연결되는 파일

- [[ERP/_attic/frontend/_archive/standalone-app-routes/inventory/📁_inventory]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```tsx
"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownUp,
  ArchiveX,
  Boxes,
  Minus,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";

import AppHeader from "@/components/AppHeader";
import { api, type Category, type Item, type TransactionLog } from "@/lib/api";

const CATEGORY_OPTIONS: { label: string; value: Category | "ALL" }[] = [
  { label: "전체", value: "ALL" },
  { label: "원자재", value: "RM" },
  { label: "튜브 반제품", value: "TA" },
  { label: "튜브 완제품", value: "TF" },
  { label: "고압 반제품", value: "HA" },
  { label: "고압 완제품", value: "HF" },
  { label: "진공 반제품", value: "VA" },
  { label: "진공 완제품", value: "VF" },
  { label: "조립 반제품", value: "BA" },
  { label: "조립 완제품", value: "BF" },
  { label: "완제품", value: "FG" },
  { label: "미분류", value: "UK" },
];

const CATEGORY_LABELS: Record<Category, string> = {
  RM: "원자재",
  TA: "튜브 반제품",
  TF: "튜브 완제품",
  HA: "고압 반제품",
  HF: "고압 완제품",
  VA: "진공 반제품",
  VF: "진공 완제품",
  BA: "조립 반제품",
  BF: "조립 완제품",
  FG: "완제품",
  UK: "미분류",
};

const TX_TYPE_LABELS: Record<string, string> = {
  RECEIVE: "입고",
  PRODUCE: "생산입고",
  SHIP: "출고",
  ADJUST: "조정",
  BACKFLUSH: "자동차감",
```
