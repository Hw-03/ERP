---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/common/StatusPill.tsx
status: active
updated: 2026-04-27
source_sha: 943e3c2cae79
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# StatusPill.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/common/StatusPill.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1721` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/common/common|frontend/app/legacy/_components/common]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "../legacyUi";

export type StatusPillTone = "info" | "success" | "warning" | "danger" | "neutral";

const TONE_COLOR: Record<StatusPillTone, string> = {
  info: LEGACY_COLORS.blue,
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  neutral: LEGACY_COLORS.muted2,
};

interface Props {
  label: string;
  tone?: StatusPillTone;
  showDot?: boolean;
  maxWidth?: number | string;
  className?: string;
  title?: string;
}

function StatusPillImpl({
  label,
  tone = "info",
  showDot = true,
  maxWidth = 260,
  className = "",
  title,
}: Props) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 truncate rounded-full border px-3 py-1 text-xs font-bold ${className}`}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        maxWidth,
      }}
      title={title ?? label}
    >
      {showDot && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

export const StatusPill = memo(StatusPillImpl);

export function inferToneFromStatus(status: string | null | undefined): StatusPillTone {
  if (!status) return "info";
  if (status.startsWith("방금 완료")) return "success";
  if (/실패|오류|불러오지 못|에러/.test(status)) return "danger";
  if (/주의|경고|부족|품절/.test(status)) return "warning";
  return "info";
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
