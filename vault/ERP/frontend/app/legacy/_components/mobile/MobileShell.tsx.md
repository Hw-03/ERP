---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/MobileShell.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileShell.tsx — MobileShell.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileShell.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileShell`
- `LucideIcon`
- `ProductionCapacity`
- `MobileTabId`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/📁_mobile]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart2,
  Boxes,
  History as HistoryIcon,
  Settings2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import {
  MobileDashboardScreen,
  MobileWarehouseScreen,
  MobileHistoryScreen,
  MobileWeeklyScreen,
  MobileAdminScreen,
} from "./screens";
import { WeeklyWeekPicker, getWeekStartMonday } from "../_weekly_sections/WeeklyWeekPicker";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "../CapacityDetailModal";
import { useCurrentOperator } from "../login/useCurrentOperator";
import { canEnterIO } from "../_warehouse_steps";

export type MobileTabId = "dashboard" | "warehouse" | "history" | "weekly" | "admin";

const TAB_META: Record<MobileTabId, { label: string; icon: LucideIcon }> = {
  dashboard: { label: "대시보드", icon: Boxes },
  warehouse: { label: "입출고", icon: Warehouse },
  history: { label: "내역", icon: HistoryIcon },
  weekly: { label: "주간보고", icon: BarChart2 },
  admin: { label: "관리", icon: Settings2 },
};

const DEFAULT_STATUS = "DEXCOWIN MES System";

export function MobileShell() {
  const operator = useCurrentOperator();
  const [activeTab, setActiveTab] = useState<MobileTabId>("dashboard");
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL ?tab= 으로 초기 탭 동기화 (딥링크/데스크탑 파리티/평가 스크립트).
  // useSearchParams 의 Suspense 요구를 피하려 클라이언트 마운트 시 1회만 읽는다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    const valid: MobileTabId[] = ["dashboard", "warehouse", "history", "weekly", "admin"];
    if (t && (valid as string[]).includes(t)) setActiveTab(t as MobileTabId);
  }, []);
```
