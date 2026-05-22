---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/warehouse/MobileIoComposeWizard.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileIoComposeWizard.tsx — MobileIoComposeWizard.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileIoComposeWizard.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileIoComposeWizard`
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

- [[ERP/frontend/app/legacy/_components/mobile/warehouse/📁_warehouse]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";
import {
  api,
  type BOMDetailEntry,
  type IoBundle,
  type IoLine,
  type IoSourceKind,
  type IoSubType,
  type IoWorkType,
  type Item,
} from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { IconButton, StickyFooter, WizardProgress } from "../primitives";
import { MobileWorkTypeStep, MobileSubTypeStep } from "./MobileWorkTypeStep";
import { IoTargetPicker } from "../../_warehouse_v2/IoTargetPicker";
import { IoBundleCart } from "../../_warehouse_v2/IoBundleCart";
import { IoConfirmStep } from "../../_warehouse_v2/IoConfirmStep";
import { IoSubmitModals, type IoSubmitResultState } from "../../_warehouse_v2/IoSubmitModals";
import {
  approvalKind,
  isExitWorkType,
  pickerDirectionLabel,
  targetDepartmentOf,
} from "../../_warehouse_v2/ioWorkType";
import {
  applyBundleQuantityChange,
  applyLineQuantityChange,
  applyToggleLine,
} from "../../_warehouse_v2/bomSync";
import { useIoDraftRestore } from "../../_warehouse_v2/useIoDraftRestore";
import { useIoDraft } from "../../_warehouse_v2/useIoDraft";
import { useIoPreview } from "../../_warehouse_v2/useIoPreview";
import { useIoSubmit } from "../../_warehouse_v2/useIoSubmit";
import { useIoWorkState, type IoStep } from "../../_warehouse_v2/useIoWorkState";
import type { IoComposeViewProps } from "../../_warehouse_v2/types";

/** IoComposeView 의 로컬 헬퍼 — 모바일에서도 동일 동작이 필요해 복제. */
function locationQuantity(
  item: Item,
  department: string | null | undefined,
  status: "PRODUCTION" | "DEFECTIVE",
) {
  if (!department) return 0;
  return (
    item.locations.find((loc) => loc.department === department && loc.status === status)
      ?.quantity ?? 0
  );
}

// Pydantic Decimal 은 JSON 에서 문자열("1.0000")로 직렬화된다 — number 로 타이핑돼 있으나 실값은 string.
```
