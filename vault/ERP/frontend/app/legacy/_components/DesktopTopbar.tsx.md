---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopTopbar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopTopbar.tsx — DesktopTopbar.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopTopbar.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopTopbar`
- `ElementType`
- `ReactNode`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { ChevronDown, KeyRound, LogOut, RefreshCw } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { StatusPill, inferToneFromStatus } from "./common";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { api } from "@/lib/api";
import { clearCurrentOperator, useCurrentOperator } from "./login/useCurrentOperator";

const DEFAULT_STATUS = "DEXCOWIN MES System";

const WAREHOUSE_ROLE_LABEL: Record<string, string | null> = {
  primary: "창고 정",
  deputy: "창고 부",
  none: null,
};

const DEPARTMENT_ROLE_LABEL: Record<string, string | null> = {
  primary: "부서 정",
  deputy: "부서 부",
  none: null,
};

export function DesktopTopbar({
  title,
  icon: Icon,
  onRefresh,
  actionSlot,
  status,
  statusNonce,
  titleAddon,
}: {
  title: string;
  icon?: ElementType;
  onRefresh: () => void;
  actionSlot?: ReactNode;
  status?: string;
  statusNonce?: number;
  titleAddon?: ReactNode;
}) {
  const operator = useCurrentOperator();
  const roleLabel = operator ? WAREHOUSE_ROLE_LABEL[operator.warehouse_role] ?? null : null;
  const deptRoleLabel = operator ? DEPARTMENT_ROLE_LABEL[operator.department_role] ?? null : null;
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
```
