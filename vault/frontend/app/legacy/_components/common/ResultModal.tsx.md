---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/common/ResultModal.tsx
status: active
updated: 2026-04-27
source_sha: 69739a495a94
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ResultModal.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/common/ResultModal.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `5626` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/common/common|frontend/app/legacy/_components/common]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useEffect, useId } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { LEGACY_COLORS } from "../legacyUi";
import { useFocusTrap } from "../_hooks/useFocusTrap";

export type ResultKind = "success" | "partial" | "fail";

interface PrimaryAction {
  label: string;
  onClick: () => void;
  tone?: "warning" | "danger" | "success" | "info";
}

interface Props {
  open: boolean;
  kind: ResultKind;
  onClose: () => void;
  title?: string;
  successCount?: number;
  failures?: { name: string; reason: string }[];
  partialNote?: string;
  closeLabel?: string;
  primaryAction?: PrimaryAction;
}

const TONE_BY_ACTION: Record<NonNullable<PrimaryAction["tone"]>, string> = {
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  success: LEGACY_COLORS.green,
  info: LEGACY_COLORS.blue,
};

export function ResultModal({
  open,
  kind,
  onClose,
  title,
  successCount = 0,
  failures = [],
  partialNote,
  closeLabel = "닫기",
  primaryAction,
}: Props) {
  // ESC 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  const headerTone =
    kind === "success" ? LEGACY_COLORS.green : kind === "partial" ? LEGACY_COLORS.yellow : LEGACY_COLORS.red;
  const HeaderIcon = kind === "success" ? CheckCircle2 : AlertTriangle;
  const computedTitle =
    title ??
    (kind === "success"
      ? `처리 완료 — ${successCount}건`
      : kind === "partial"
        ? `처리 결과 — 성공 ${successCount}건 / 실패 ${failures.length}건`
        : "실행 실패");

  const note =
    kind === "partial"
      ? partialNote ??
        `성공한 ${successCount}건은 이미 처리되었습니다. 실패 항목만 다시 시도할 수 있습니다.`
      : null;

  return (
    <div
      className="fixed inset-0 z-[450] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        className="w-full max-w-[560px] rounded-[24px] border p-6"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: `color-mix(in srgb, ${headerTone} 50%, transparent)`,
          boxShadow: "var(--c-card-shadow)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <HeaderIcon className="h-5 w-5" style={{ color: headerTone }} />
          <div id={titleId} className="text-lg font-black" style={{ color: LEGACY_COLORS.text }}>
            {computedTitle}
          </div>
        </div>

        {note && (
          <div
            className="mb-4 rounded-[12px] border px-3 py-2 text-xs font-bold"
            style={{
              background: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${LEGACY_COLORS.yellow} 40%, transparent)`,
              color: LEGACY_COLORS.yellow,
            }}
          >
            {note}
          </div>
        )}

        {failures.length > 0 && (
          <div
            className="mb-5 max-h-[260px] overflow-y-auto rounded-[14px] border"
            style={{
              borderColor: LEGACY_COLORS.border,
              background: LEGACY_COLORS.s2,
              overscrollBehavior: "contain",
            }}
          >
            <ul className="divide-y" style={{ borderColor: LEGACY_COLORS.border }}>
              {failures.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex flex-col gap-1 px-3 py-2.5"
                  style={{ borderColor: LEGACY_COLORS.border }}
                >
                  <span className="truncate text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                    {f.name}
                  </span>
                  <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
                    {f.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[14px] border px-5 py-2.5 text-sm font-bold transition-colors hover:brightness-125"
            style={{
              borderColor: LEGACY_COLORS.border,
              color: LEGACY_COLORS.muted2,
              background: LEGACY_COLORS.s2,
            }}
          >
            {closeLabel}
          </button>
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="rounded-[14px] px-5 py-2.5 text-sm font-black text-white transition-[transform,opacity] active:scale-[0.99]"
              style={{
                background: TONE_BY_ACTION[primaryAction.tone ?? (kind === "partial" ? "warning" : "danger")],
              }}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
