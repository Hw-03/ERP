---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/IoComposeView.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# IoComposeView.tsx — IoComposeView.tsx 설명

## 이 파일은 무엇을 책임지나

`IoComposeView.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `IoComposeView`
- `BOMDetailEntry`
- `IoBundle`
- `IoLine`
- `IoSourceKind`
- `IoSubType`
- `IoWorkType`
- `Item`
- `IoSubmitResultState`
- `IoStep`

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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import { api, type BOMDetailEntry, type IoBundle, type IoLine, type IoSourceKind, type IoSubType, type IoWorkType, type Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { WizardStepCard } from "./_atoms";
import { IoWorkTypeStep, IoSubTypeStep } from "./IoWorkTypeStep";
import { IoTargetPicker } from "./IoTargetPicker";
import { IoBundleCart } from "./IoBundleCart";
import { IoConfirmStep } from "./IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "./IoSubmitModals";
import { IO_WORK_TYPES, approvalKind, directionWord, isDefectInventorySubType, isExitWorkType, pickerDirectionLabel, requiresDepartments, subTypeLabel, targetDepartmentOf } from...
import { applyBundleQuantityChange, applyLineQuantityChange, applyToggleLine } from "./bomSync";
import { useIoDraftRestore } from "./useIoDraftRestore";
import { useIoDraft } from "./useIoDraft";
import { useIoPreview } from "./useIoPreview";
import { useIoSubmit } from "./useIoSubmit";
import { useIoWorkState, type IoStep } from "./useIoWorkState";
import type { IoComposeViewProps } from "./types";
import { DefectInventoryPicker } from "./DefectInventoryPicker";
import { DefectActionStep } from "./DefectActionStep";
import { defectsApi } from "@/lib/api/defects";
import { stockRequestsApi } from "@/lib/api/stock-requests";
import type { Department } from "@/lib/api/types/shared";

function locationQuantity(item: Item, department: string | null | undefined, status: "PRODUCTION" | "DEFECTIVE") {
  if (!department) return 0;
  return item.locations.find((loc) => loc.department === department && loc.status === status)?.quantity ?? 0;
}

// Pydantic Decimal은 JSON에서 문자열("1.0000")로 직렬화된다 — 프론트는 number 로 타이핑되어 있으나 실값은 string.
// stepper 산술/합계가 string concat 으로 깨지므로 bundle 수신 즉시 number 로 정규화한다.
function normalizeBundles(bundles: IoBundle[]): IoBundle[] {
  return bundles.map((bundle) => ({
    ...bundle,
    quantity: Number(bundle.quantity),
    lines: bundle.lines.map((line) => ({
      ...line,
      quantity: Number(line.quantity),
      shortage: Number(line.shortage),
      bom_expected: line.bom_expected == null ? null : Number(line.bom_expected),
    })),
  }));
}

function workTypeLabel(workType: IoWorkType) {
  return IO_WORK_TYPES.find((row) => row.id === workType)?.label ?? workType;
}

const AUTO_SCROLL_OFFSET = -2;
const STEP4_SCROLL_OFFSET = 0;
```
