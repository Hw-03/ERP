---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/AlertsSheet.tsx
status: active
updated: 2026-04-27
source_sha: 239204abf4e2
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AlertsSheet.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/AlertsSheet.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2237` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/mobile|frontend/app/legacy/_components/mobile]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import Link from "next/link";
import { ClipboardCheck, RefreshCw, AlertTriangle, ChevronRight } from "lucide-react";
import { BottomSheet } from "../BottomSheet";
import { AlertsBanner } from "../AlertsBanner";
import { LEGACY_COLORS } from "../legacyUi";
import { TYPO } from "./tokens";
import { SheetHeader } from "./primitives";

const LINKS = [
  { href: "/queue", label: "Queue", description: "배치 진행 현황", icon: RefreshCw, color: LEGACY_COLORS.blue },
  { href: "/alerts", label: "알림", description: "재고 경고 · 편차", icon: AlertTriangle, color: LEGACY_COLORS.yellow },
  { href: "/counts", label: "실사", description: "재고 실사 기록", icon: ClipboardCheck, color: LEGACY_COLORS.cyan },
];

export function AlertsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <SheetHeader title="알림" subtitle="최근 알림 및 바로가기" onClose={onClose} />
      <div className="px-5 pb-4">
        <AlertsBanner />
      </div>
      <div className="flex flex-col gap-2 px-5 pb-2">
        {LINKS.map(({ href, label, description, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className="flex items-center gap-3 rounded-[20px] border px-4 py-3"
            style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: `${color}22`, color }}
            >
              <Icon size={20} strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <div className={`${TYPO.body} font-black`} style={{ color: LEGACY_COLORS.text }}>
                {label}
              </div>
              <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                {description}
              </div>
            </div>
            <ChevronRight size={18} color={LEGACY_COLORS.muted} />
          </Link>
        ))}
      </div>
    </BottomSheet>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
