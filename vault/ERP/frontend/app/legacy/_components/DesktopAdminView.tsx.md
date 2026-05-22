---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopAdminView.tsx"
importance: critical
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopAdminView.tsx — DesktopAdminView.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopAdminView`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PanelRight } from "lucide-react";
import { DesktopRightPanel } from "./DesktopRightPanel";
import { DesktopPinLock } from "./DesktopPinLock";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AdminSidebar } from "./_admin_sections/AdminSidebar";
import { AdminSectionContent } from "./_admin_sections/AdminSectionContent";
import { AdminRightPanelContent } from "./_admin_sections/AdminRightPanelContent";
import { useAdminBootstrap } from "./_admin_hooks/useAdminBootstrap";
import { useAdminSettings } from "./_admin_hooks/useAdminSettings";
import { useAdminViewState } from "./_admin_hooks/useAdminViewState";

/**
 * 섹션 헤더와 KPI는 각 섹션이 직접 그린다 (AdminPageHeader / AdminKpiBar 사용).
 * 본 파일은 PIN gate, 좌/우 레이아웃 wrapper, 토스트 영역만 담당.
 */
export function DesktopAdminView({
  globalSearch,
  onStatusChange,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
}) {
  const router = useRouter();
  const {
    unlocked,
    adminPin,
    section,
    showRightPanel,
    selectedDept,
    setSelectedDept,
    unlock,
    lock,
    selectSection,
    togglePanel,
  } = useAdminViewState("models");

  const [message, setMessage] = useState("");

  const {
    items, setItems,
    employees, setEmployees,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows,
    refreshAllBom,
    refreshItems,
    loadData,
  } = useAdminBootstrap({
    unlocked,
    globalSearch,
    onError: setMessage,
```
