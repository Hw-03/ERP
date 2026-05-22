---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/IoTargetPicker.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# IoTargetPicker.tsx — IoTargetPicker.tsx 설명

## 이 파일은 무엇을 책임지나

`IoTargetPicker.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `IoTargetPicker`
- `ItemTable`
- `DeptLetter`
- `DeptIoDirection`
- `ItemActionMode`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { Tooltip } from "@/lib/ui";
import { EmptyState } from "../common";
import { useCurrentOperator } from "../login/useCurrentOperator";
import {
  DEPT_OPTIONS,
  PAGE_SIZE,
  PROD_DEPTS,
  matchesSearch,
} from "../_warehouse_steps/_constants";
import { DEPT_LETTER_TO_NAME, deptOf, stageOf, type DeptLetter } from "../_admin_sections/_bom_workbench/bomDept";
import { LabeledSelect, SettingLabel } from "./_atoms";
import type { IoBundle, IoSubType, IoWorkType, Item, ProductModel } from "./types";
import {
  deptIoSubType,
  getItemActionMode,
  type DeptIoDirection,
  type ItemActionMode,
} from "./ioWorkType";

interface Props {
  workType: IoWorkType;
  subType: IoSubType;
  deptIoDirection: DeptIoDirection | null;
  bundleSubType: IoSubType | null;
  bomParents: Set<string>;
  targetDepartment?: string | null;
  items: Item[];
  productModels: ProductModel[];
  bundles: IoBundle[];
  search: string;
  onSearchChange: (value: string) => void;
  onAddItem: (item: Item, sourceKind?: "direct_item" | "manual", subTypeOverride?: IoSubType) => void;
  onAdvance: () => void;
  busy?: boolean;
}

const STAGE_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RAW", label: "원자재" },
  { value: "MID", label: "중간공정" },
  { value: "DONE", label: "공정완료" },
];

const INITIAL_DISPLAY_LIMIT = PAGE_SIZE * 2;

const NAME_TO_LETTER: Record<string, DeptLetter> = {
  튜브: "T",
  고압: "H",
  진공: "V",
```
