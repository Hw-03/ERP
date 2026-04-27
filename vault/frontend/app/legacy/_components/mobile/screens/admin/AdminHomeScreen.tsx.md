---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/screens/admin/AdminHomeScreen.tsx
status: active
updated: 2026-04-27
source_sha: 7a971c360fc3
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminHomeScreen.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/screens/admin/AdminHomeScreen.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `3670` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/screens/admin/admin|frontend/app/legacy/_components/mobile/screens/admin]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import {
  Boxes,
  ChevronRight,
  Lock,
  Package as PackageIcon,
  Settings2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { LEGACY_COLORS } from "../../../legacyUi";
import { TYPO } from "../../tokens";
import { IconButton } from "../../primitives";

export type AdminSection = "items" | "employees" | "bom" | "packages" | "settings";

export const ADMIN_SECTION_META: Record<
  AdminSection,
  { label: string; description: string; icon: LucideIcon; tone: string }
> = {
  items: {
    label: "상품",
    description: "품목 등록, 사양·안전재고 편집",
    icon: Boxes,
    tone: LEGACY_COLORS.blue,
  },
  employees: {
    label: "직원",
    description: "담당자 추가, 부서·활성 상태 관리",
    icon: Users,
    tone: LEGACY_COLORS.green,
  },
  bom: {
    label: "BOM",
    description: "상위/하위 품목 구성, 소요·가능 수량",
    icon: Workflow,
    tone: LEGACY_COLORS.cyan,
  },
  packages: {
    label: "출하묶음",
    description: "패키지 생성 및 구성 품목 편집",
    icon: PackageIcon,
    tone: LEGACY_COLORS.purple,
  },
  settings: {
    label: "설정",
    description: "PIN 변경, 엑셀 내보내기, 안전 초기화",
    icon: Settings2,
    tone: LEGACY_COLORS.yellow,
  },
};

const SECTION_ORDER: AdminSection[] = ["items", "employees", "bom", "packages", "settings"];

export function AdminHomeScreen({
  onOpen,
  onLock,
}: {
  onOpen: (section: AdminSection) => void;
  onLock: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <div
            className={`${TYPO.overline} font-bold uppercase tracking-[2.5px]`}
            style={{ color: LEGACY_COLORS.muted2 }}
          >
            관리자 허브
          </div>
          <div className={`${TYPO.headline} font-black`} style={{ color: LEGACY_COLORS.text }}>
            무엇을 관리할까요?
          </div>
        </div>
        <IconButton icon={Lock} label="잠금" size="md" onClick={onLock} color={LEGACY_COLORS.muted2} />
      </div>

      <div className="flex flex-col gap-2">
        {SECTION_ORDER.map((id) => {
          const meta = ADMIN_SECTION_META[id];
          const Icon = meta.icon;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpen(id)}
              className="flex items-center gap-3 rounded-[20px] border px-4 py-4 text-left active:scale-[0.99]"
              style={{
                background: LEGACY_COLORS.s2,
                borderColor: LEGACY_COLORS.border,
              }}
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: `color-mix(in srgb, ${meta.tone as string} 14%, transparent)`, color: meta.tone }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`${TYPO.title} font-black`} style={{ color: LEGACY_COLORS.text }}>
                  {meta.label}
                </div>
                <div className={TYPO.caption} style={{ color: LEGACY_COLORS.muted2 }}>
                  {meta.description}
                </div>
              </div>
              <ChevronRight size={20} color={LEGACY_COLORS.muted} />
            </button>
          );
        })}
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
