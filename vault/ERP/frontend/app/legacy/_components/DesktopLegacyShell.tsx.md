---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopLegacyShell.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopLegacyShell.tsx — 데스크톱 화면 전체 틀

## 이 파일은 무엇을 책임지나

대시보드, 입출고, 내역, 관리자 화면을 한 화면 구조 안에서 전환하는 데스크톱 셸입니다.

## 업무 흐름에서의 의미

현장 사용자가 가장 오래 머무는 화면의 전체 골격입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopLegacyShell`
- `DesktopTabId`
- `ProductionCapacity`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

탭 상태와 공통 레이아웃을 바꾸면 모든 데스크톱 화면의 사용감이 바뀝니다.

## 핵심 발췌

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BarChart2, Boxes, History, Settings2, Warehouse } from "lucide-react";
import { DesktopSidebar, type DesktopTabId } from "./DesktopSidebar";
import { DesktopTopbar } from "./DesktopTopbar";
import { DesktopInventoryView } from "./DesktopInventoryView";
import { DesktopWarehouseView } from "./DesktopWarehouseView";
import { DesktopAdminView } from "./DesktopAdminView";
import { DesktopHistoryView } from "./DesktopHistoryView";
import { DesktopWeeklyReportView } from "./DesktopWeeklyReportView";
import {
  WeeklyWeekPicker,
  getWeekStartMonday,
} from "./_weekly_sections/WeeklyWeekPicker";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { api, type ProductionCapacity } from "@/lib/api";
import type { Item } from "@/lib/api";
import { CapacityDetailModal } from "./CapacityDetailModal";

const VALID_TABS = new Set<DesktopTabId>(["dashboard", "warehouse", "history", "weekly", "admin"]);
const DEFAULT_STATUS = "DEXCOWIN MES System";

const TAB_META: Record<DesktopTabId, { title: string; icon: ElementType }> = {
  dashboard: { title: "대시보드", icon: Boxes },
  warehouse: { title: "입출고", icon: Warehouse },
  history: { title: "입출고 내역", icon: History },
  weekly: { title: "주간보고", icon: BarChart2 },
  admin: { title: "관리자", icon: Settings2 },
};

export function DesktopLegacyShell() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = (() => {
    const t = searchParams.get("tab") as DesktopTabId | null;
    return t && VALID_TABS.has(t) ? t : "dashboard";
  })();

  const [activeTab, setActiveTab] = useState<DesktopTabId>(initialTab);
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [statusNonce, setStatusNonce] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStatusChange = useCallback((msg: string) => {
    if (autoRevertTimerRef.current) clearTimeout(autoRevertTimerRef.current);
    setStatus(msg);
    setStatusNonce((n) => n + 1);
    if (msg === DEFAULT_STATUS) return;
    const isSticky = /실패|못했습니다|오류|에러|부족|품절/.test(msg);
    if (!isSticky) {
```
