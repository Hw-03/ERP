---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_bom_workbench/BomReviewModal.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# BomReviewModal.tsx — BomReviewModal.tsx 설명

## 이 파일은 무엇을 책임지나

`BomReviewModal.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `BomReviewModal`
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

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { BOMEntry, Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { TruncatedText } from "@/lib/ui/TruncatedText";
import { BomBadge } from "./BomBadge";

/**
 * 검토 · 완료 모달.
 *
 * 저장 대상 BOM row 요약 + 검증 결과(수량≤0 / 중복 자식)를 보여주고
 *   - 미완료 parent → [완료로 표시] (검증 통과 + row≥1 일 때만 활성)
 *   - 완료 parent   → [완료 해제]
 *
 * 순환 참조는 BOM 추가 시점에 backend 가 이미 차단하므로 저장된 row 에는
 * 존재할 수 없음 — 본 모달은 수량/중복만 사전 점검.
 */
interface Props {
  parent: Item;
  rows: BOMEntry[];
  items: Item[];
  isCompleted: boolean;
  onClose: () => void;
  onConfirm: (completed: boolean) => Promise<void>;
}

export function BomReviewModal({ parent, rows, items, isCompleted, onClose, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items]);

  const badQty = rows.filter((r) => !(Number(r.quantity) > 0));
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.child_item_id, (seen.get(r.child_item_id) ?? 0) + 1);
  const dupChildIds = Array.from(seen.entries())
    .filter(([, n]) => n > 1)
    .map(([id]) => id);

  const hasIssue = badQty.length > 0 || dupChildIds.length > 0;
  const canComplete = rows.length > 0 && !hasIssue;

  async function handleConfirm() {
    // 완료로 표시하는 방향은 검증 통과 + row≥1 일 때만. 완료 해제는 항상 허용.
    if (!isCompleted && !canComplete) return;
    setBusy(true);
    try {
      await onConfirm(!isCompleted);
      onClose();
    } finally {
      setBusy(false);
    }
  }
```
