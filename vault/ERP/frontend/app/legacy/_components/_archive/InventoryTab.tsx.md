---
type: file-explanation
source_path: "frontend/app/legacy/_components/_archive/InventoryTab.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# InventoryTab.tsx — InventoryTab.tsx 설명

## 이 파일은 무엇을 책임지나

`InventoryTab.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `InventoryTab`
- `Item`
- `ProductModel`
- `DisplayRow`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { api, type Item, type ProductModel } from "@/lib/api";
import { FilterPills } from "./FilterPills";
import { ItemDetailSheet } from "./ItemDetailSheet";
import type { ToastState } from "./Toast";
import {
  LEGACY_COLORS,
  itemCodeDeptBadge,
  formatNumber,
  getStockState,
  normalizeModel,
} from "./legacyUi";

const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];

const STATIC_MODEL_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "공용", value: "공용" },
];

const KPI_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "정상", value: "OK" },
  { label: "부족", value: "LOW" },
  { label: "품절", value: "ZERO" },
];

const TYPE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "RM(원자재)", value: "RM" },
  { label: "반제품(?A)", value: "SEMI" },
  { label: "고정형(?F)", value: "FIXED" },
  { label: "완제품(FG)", value: "FG" },
];

const SEMI_CATS = new Set(["TA", "HA", "VA", "BA"]);
const FIXED_CATS = new Set(["TF", "HF", "VF", "AF"]);

const PAGE_SIZE = 100;

type DisplayRow = {
  key: string;
  representative: Item;
  quantity: number;
```
