---
type: file-explanation
source_path: "frontend/app/legacy/_components/_defect_hub/AddQuarantineModal.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AddQuarantineModal.tsx — AddQuarantineModal.tsx 설명

## 이 파일은 무엇을 책임지나

`AddQuarantineModal.tsx`는 불량 격리, 폐기, 반품, 분해 같은 불량 처리 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AddQuarantineModal`
- `SourceKind`
- `AddQuarantineModalProps`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_defect_hub/📁__defect_hub]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Search } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useFocusTrap } from "@/lib/mes/useFocusTrap";
import { defectsApi } from "@/lib/api/defects";
import { itemsApi } from "@/lib/api/items";
import type { Item } from "@/lib/api/types";
import { ReasonFormFields } from "./ReasonFormFields";

const PRODUCTION_LINES = ["튜브", "고압", "진공", "튜닝", "조립", "출하"] as const;

type SourceKind = "warehouse" | "production";

export interface AddQuarantineModalProps {
  open: boolean;
  onClose: () => void;
  currentEmployee: { employee_id: string; name: string; department: string };
  onSubmitted: () => void;
}

/**
 * 새 격리 추가 모달.
 *
 * 입력:
 *   - 품목 검색 (item_code / item_name)
 *   - 출처: 창고 재고 OR 부서 재고 (라디오)
 *     · 창고 재고 → target_dept select (어느 부서로 격리할지)
 *     · 부서 재고 → source_dept select (= target_dept 자동, 같은 부서 안에서 격리)
 *   - 수량 + 사유 카테고리/메모
 *
 * 제출: defectsApi.quarantine (즉시, 결재 불필요).
 */
export function AddQuarantineModal({
  open,
  onClose,
  currentEmployee,
  onSubmitted,
}: AddQuarantineModalProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);

  const [source, setSource] = useState<SourceKind>("warehouse");
  // warehouse 모드: target_dept 만 선택. production 모드: source_dept = target_dept.
  const [dept, setDept] = useState<string>(
    PRODUCTION_LINES.includes(currentEmployee.department as (typeof PRODUCTION_LINES)[number])
      ? currentEmployee.department
      : PRODUCTION_LINES[0],
  );

  const [qty, setQty] = useState<string>("");
```
