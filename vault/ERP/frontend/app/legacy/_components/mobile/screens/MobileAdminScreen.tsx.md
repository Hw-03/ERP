---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/screens/MobileAdminScreen.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileAdminScreen.tsx — MobileAdminScreen.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileAdminScreen.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileAdminScreen`
- `AdminSection`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/screens/📁_screens]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DesktopPinLock } from "../../DesktopPinLock";
import { SubScreenHeader } from "../primitives";
import { SECTIONS, SETTINGS_ENTRY } from "../../_admin_sections/AdminSidebar";
import { AdminSectionContent } from "../../_admin_sections/AdminSectionContent";
import { AdminRightPanelContent } from "../../_admin_sections/AdminRightPanelContent";
import { useAdminBootstrap } from "../../_admin_hooks/useAdminBootstrap";
import { useAdminSettings } from "../../_admin_hooks/useAdminSettings";
import { useAdminViewState, type AdminSection } from "../../_admin_hooks/useAdminViewState";

const ALL_SECTIONS = [...SECTIONS, SETTINGS_ENTRY];

/**
 * 관리자 모바일 화면.
 *
 * 데스크탑 DesktopAdminView 의 240px 사이드바 + 420px 우측 슬라이드 그리드는
 * 393px 에서 구겨진다. 동일한 PIN 게이트/훅(useAdminViewState·Bootstrap·
 * Settings)을 그대로 재사용하되, 모바일은 섹션 허브(리스트) → 드릴다운
 * 풀스크린 패턴으로 재구성한다.
 */
export function MobileAdminScreen({
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
    selectedDept,
    setSelectedDept,
    unlock,
    selectSection,
  } = useAdminViewState("models");

  const [message, setMessage] = useState("");
  const [entered, setEntered] = useState<AdminSection | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const {
    items, setItems,
    employees, setEmployees,
    productModels, setProductModels,
    departments, setDepartments,
    allBomRows,
    refreshAllBom,
    refreshItems,
```
