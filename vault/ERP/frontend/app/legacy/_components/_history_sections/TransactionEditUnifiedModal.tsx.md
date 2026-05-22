---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/TransactionEditUnifiedModal.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# TransactionEditUnifiedModal.tsx — TransactionEditUnifiedModal.tsx 설명

## 이 파일은 무엇을 책임지나

`TransactionEditUnifiedModal.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `TransactionEditUnifiedModal`
- `SectionTitle`
- `FieldRow`
- `QUANTITY_CORRECTABLE_TYPES`
- `Employee`
- `TransactionLog`
- `TransactionType`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

/**
 * 거래 정정 통합 모달 — 정보(메타) 수정 + 수량 보정을 한 화면에서.
 * 기존 TransactionEditModal / TransactionQuantityCorrectModal 을 흡수(2차 #2: UI 통합).
 * 백엔드는 그대로 2엔드포인트(metaEdit / quantityCorrect). 변경된 영역만 호출.
 *
 * 작업자 식별용 PIN — 실제 보안 인증이 아님.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  api,
  type Employee,
  type TransactionLog,
  type TransactionType,
} from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { AppSelect } from "../common/AppSelect";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { getHistoryDisplayLabel } from "./historyBatchInterpreter";

/** 직접 수량 보정 가능 거래 — 그 외는 수량조정(ADJUST) 거래로 처리(재고 정합성). */
export const QUANTITY_CORRECTABLE_TYPES: ReadonlySet<TransactionType> =
  new Set<TransactionType>(["RECEIVE", "SHIP"]);

interface Props {
  open: boolean;
  log: TransactionLog | null;
  canMetaEdit: boolean;
  canQtyCorrect: boolean;
  onClose: () => void;
  onMetaSuccess: (updated: TransactionLog) => void;
  onQtySuccess: (result: { original: TransactionLog; correction: TransactionLog }) => void;
}

const TITLE_ID = "transaction-edit-unified-title";

export function TransactionEditUnifiedModal({
  open,
  log,
  canMetaEdit,
  canQtyCorrect,
  onClose,
  onMetaSuccess,
  onQtySuccess,
}: Props) {
  const operator = useCurrentOperator();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const firstInputRef = useRef<HTMLTextAreaElement>(null);
```
