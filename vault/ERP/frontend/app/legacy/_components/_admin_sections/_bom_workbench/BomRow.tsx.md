---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomRow.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomRow.tsx — BomRow.tsx 설명

## 이 파일은 무엇을 책임지나

`BomRow.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomRow`
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

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { TruncatedText } from "@/lib/ui";
import { BomBadge } from "./BomBadge";

/**
 * BOM 그리드 한 행 — 자식 품목 정보 + 수량(인라인 편집) + 삭제.
 *
 * 인라인 수량 편집:
 *   - 수량 칸 클릭 → input 노출 + 자동 select
 *   - Enter / blur 저장 (parseFloat > 0 검증)
 *   - Esc 취소
 *
 * 삭제는 부모에서 ConfirmModal 띄우도록 onRequestDelete 콜백.
 */
interface Props {
  row: BOMEntry;
  childItem: Item | undefined;
  onSaveQty: (bomId: string, qty: number) => void | Promise<void>;
  onRequestDelete: (row: BOMEntry, childName: string) => void;
}

export function BomRow({ row, childItem, onSaveQty, onRequestDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(row.quantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = parseFloat(draft);
    if (!Number.isFinite(next) || next <= 0) {
      setDraft(String(row.quantity));
      return;
    }
    if (next === row.quantity) return;
    void onSaveQty(row.bom_id, next);
  }

  function cancel() {
    setEditing(false);
    setDraft(String(row.quantity));
  }
```
