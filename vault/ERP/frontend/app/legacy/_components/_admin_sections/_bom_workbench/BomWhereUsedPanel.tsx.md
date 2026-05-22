---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomWhereUsedPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomWhereUsedPanel.tsx — BomWhereUsedPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`BomWhereUsedPanel.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomWhereUsedPanel`
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

import type { BOMDetailEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui";
import { EmptyState } from "../../common/EmptyState";
import { BomBadge } from "./BomBadge";

/**
 * 역참조 모드 — 선택된 품목이 어느 부모의 자식으로 등장하는지 1단계 조회.
 *
 * 데이터 소스: 페이지가 부모 변경 시 미리 fetch (where-used).
 */
interface Props {
  selected: Item | null;
  rows: BOMDetailEntry[];
  items: Item[];
  onSelectParent: (parentId: string) => void;
}

export function BomWhereUsedPanel({ selected, rows, items, onSelectParent }: Props) {
  if (!selected) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <EmptyState
          variant="no-data"
          title="좌측에서 품목을 선택하세요"
          description="이 품목이 자식으로 들어가는 BOM을 표시합니다."
        />
      </div>
    );
  }

  const itemMap = new Map(items.map((i) => [i.item_id, i]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 선택된 품목 헤더 */}
      <div
        className="flex items-center gap-3 rounded-2xl border px-4 py-3"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <BomBadge processTypeCode={selected.process_type_code} />
        <div className="min-w-0 flex-1">
          <TruncatedText className="truncate text-base font-bold" style={{ color: LEGACY_COLORS.text }}>
            {selected.item_name}
          </TruncatedText>
          <TruncatedText className="truncate text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            {selected.item_code ?? "(코드 없음)"} · {rows.length}개 부모에서 사용
          </TruncatedText>
        </div>
```
