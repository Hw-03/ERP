---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopSidebar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopSidebar.tsx — DesktopSidebar.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopSidebar.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopSidebar`
- `TabButton`
- `DesktopTabId`
- `TabDef`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import type { ElementType } from "react";
import { BarChart2, Boxes, History, Settings2, Warehouse } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { ThemeToggle } from "./ThemeToggle";

export type DesktopTabId = "dashboard" | "warehouse" | "history" | "weekly" | "admin";

type TabDef = { id: DesktopTabId; label: string; subtitle: string; icon: ElementType };

const MAIN_TABS: TabDef[] = [
  { id: "dashboard", label: "대시보드", subtitle: "현황과 안전재고 확인", icon: Boxes },
  { id: "warehouse", label: "입출고", subtitle: "입고와 출고 작업 처리", icon: Warehouse },
  { id: "history", label: "입출고 내역", subtitle: "입출고 이력 조회", icon: History },
  { id: "weekly", label: "주간보고", subtitle: "생산·재고 흐름", icon: BarChart2 },
];

const BOTTOM_TABS: TabDef[] = [
  { id: "admin", label: "관리", subtitle: "마스터와 운영 설정", icon: Settings2 },
];

export function DesktopSidebar({
  activeTab,
  onTabChange,
  alertCount,
}: {
  activeTab: DesktopTabId;
  onTabChange: (tab: DesktopTabId) => void;
  alertCount?: Partial<Record<DesktopTabId, number>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<DesktopTabId | null>(null);

  return (
    <div
      className="shrink-0"
      style={{
        width: expanded ? 220 : 72,
        transition: "width 180ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <aside
        className="flex h-full w-full flex-col overflow-hidden rounded-[32px] border px-3 py-5"
        style={{
          background: LEGACY_COLORS.s1,
          borderColor: LEGACY_COLORS.border,
          boxShadow: "var(--c-card-shadow)",
        }}
      >
        {/* 로고 */}
```
