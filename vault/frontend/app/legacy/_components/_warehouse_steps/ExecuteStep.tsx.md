---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_steps/ExecuteStep.tsx
status: active
updated: 2026-04-27
source_sha: dcd7629bb036
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ExecuteStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_steps/ExecuteStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2503` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|frontend/app/legacy/_components/_warehouse_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { AlertTriangle } from "lucide-react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "../legacyUi";
import type { WorkType } from "./_constants";

export function ExecuteStep({
  shortLabel,
  workType,
  selectedEntries,
  canExecute,
  isCaution,
  accent,
  blockerText,
  submitting,
  onSubmit,
}: {
  shortLabel: string;
  workType: WorkType;
  selectedEntries: { item: Item; quantity: number }[];
  canExecute: boolean;
  isCaution: boolean;
  accent: string;
  blockerText: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const isPackage = workType === "package-out";
  const buttonMulti = !isPackage && selectedEntries.length > 1 ? ` ${selectedEntries.length}건` : "";
  const buttonLabel = submitting ? "처리 중..." : `${shortLabel}${buttonMulti} 실행`;

  return (
    <div className="space-y-3">
      {/* caution 안내 */}
      {isCaution && (
        <div
          className="flex items-start gap-2 rounded-[12px] border px-3 py-2 text-xs"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.red} 8%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.red} 40%, transparent)`,
            color: LEGACY_COLORS.red,
          }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-bold">되돌릴 수 없습니다. 최종 확인 팝업에서 한 번 더 점검하세요.</span>
        </div>
      )}

      {/* blocker */}
      {blockerText && (
        <div
          className="rounded-[12px] border px-3 py-2 text-center text-xs font-bold"
          style={{
            background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
            color: LEGACY_COLORS.yellow,
          }}
        >
          {blockerText}
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        onClick={onSubmit}
        disabled={submitting || !canExecute}
        className="flex w-full items-center justify-center gap-2 rounded-[18px] px-6 py-5 text-lg font-black text-white transition-[transform,opacity] active:scale-[0.99] disabled:opacity-50"
        style={{ background: accent }}
      >
        {isCaution && !submitting && <AlertTriangle className="h-5 w-5" />}
        {buttonLabel}
      </button>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
