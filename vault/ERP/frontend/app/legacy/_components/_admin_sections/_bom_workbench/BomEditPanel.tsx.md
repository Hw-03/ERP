---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomEditPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomEditPanel.tsx — BomEditPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`BomEditPanel.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomEditPanel`
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

import { ClipboardCheck } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TruncatedText } from "@/lib/ui";
import { EmptyState } from "../../common/EmptyState";
import { BomBadge } from "./BomBadge";
import { BomRow } from "./BomRow";
import { BOM_STATUS_META } from "./bomDept";

/**
 * 우측 "현재 BOM 구성" 패널.
 *
 * 상단: 부모 헤더(배지+이름+코드) + 완료 상태 칩 + [검토 · 완료] 버튼
 * 본문: 현재 BOM 그리드 (BomRow — 인라인 수량 편집 / 삭제)
 *
 * 하위품목 추가는 가운데 BomChildAddBox 가 담당(별도 컬럼).
 */
interface Props {
  parent: Item | null;
  bomRows: BOMEntry[];
  items: Item[];
  isCompleted: boolean;
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
  onOpenReview: () => void;
}

export function BomEditPanel({
  parent,
  bomRows,
  items,
  isCompleted,
  onSaveQty,
  onRequestDelete,
  onOpenReview,
}: Props) {
  if (!parent) {
    return (
      <div
        className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <EmptyState
          variant="no-data"
          title="좌측에서 상위 품목을 선택하세요"
          description="부서탭 → 품목 클릭 시 이곳에 현재 BOM 구성이 표시됩니다."
        />
      </div>
    );
  }

  const itemMap = new Map(items.map((i) => [i.item_id, i]));
  const statusMeta = isCompleted ? BOM_STATUS_META.done : bomRows.length > 0 ? BOM_STATUS_META.wip : BOM_STATUS_META.todo;
```
