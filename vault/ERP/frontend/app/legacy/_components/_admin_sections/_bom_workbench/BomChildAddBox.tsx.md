---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomChildAddBox.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomChildAddBox.tsx — BomChildAddBox.tsx 설명

## 이 파일은 무엇을 책임지나

`BomChildAddBox.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomChildAddBox`
- `DeptLetter`
- `StageLetter`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";
import { BomSearchInput } from "./BomSearchInput";
import { DEPT_LETTERS, DEPT_LETTER_TO_NAME, deptColor, deptOf, stageOf, type DeptLetter, type StageLetter } from "./bomDept";
import { EmptyState } from "../../common";

/**
 * 가운데 하위품목 추가 패널.
 *
 * 검색 + 부서칩 + 단계칩 + 후보 리스트.
 * 후보 클릭 → 해당 row 아래에 수량 입력 영역 펼침.
 *   - Enter : 추가 (qty>0 검증)
 *   - Esc   : 취소(접기)
 * 자기참조(parent===child)·이미 자식인 항목은 후보에서 비활성.
 */
interface Props {
  parent: Item;
  bomRows: BOMEntry[];
  items: Item[];
  onAdd: (childId: string, childName: string, qty: number) => Promise<boolean>;
}

const STAGE_FILTERS: { id: "ALL" | StageLetter; label: string }[] = [
  { id: "ALL", label: "전체" },
  { id: "R", label: "원자재" },
  { id: "A", label: "중간공정" },
  { id: "F", label: "공정완료" },
];

export function BomChildAddBox({ parent, bomRows, items, onAdd }: Props) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<DeptLetter | "">("");
  const [stageFilter, setStageFilter] = useState<"ALL" | StageLetter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState("1");
  const [busyId, setBusyId] = useState<string | null>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const childIdSet = useMemo(() => new Set(bomRows.map((r) => r.child_item_id)), [bomRows]);

  // 부모/필터 바뀌면 펼친 입력 닫기
  useEffect(() => {
    setExpandedId(null);
  }, [parent.item_id]);

  useEffect(() => {
    if (expandedId) {
      qtyRef.current?.focus();
      qtyRef.current?.select();
```
