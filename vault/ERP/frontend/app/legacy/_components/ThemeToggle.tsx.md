---
type: file-explanation
source_path: "frontend/app/legacy/_components/ThemeToggle.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ThemeToggle.tsx — ThemeToggle.tsx 설명

## 이 파일은 무엇을 책임지나

`ThemeToggle.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ThemeToggle`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { useCurrentOperator, setCurrentOperator } from "./login/useCurrentOperator";

export function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const operator = useCurrentOperator();
  const [isLight, setIsLight] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // operator.theme 또는 localStorage에서 테마 읽기 (operator 우선)
    const theme = operator?.theme ?? localStorage.getItem("theme");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      setIsLight(false);
    } else {
      document.documentElement.classList.remove("dark");
      setIsLight(true);
    }
  }, [operator?.theme]);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    const newTheme = next ? "light" : "dark";

    if (next) {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }

    // localStorage에 저장 (항상)
    localStorage.setItem("theme", newTheme);

    // 로그인된 operator가 있으면 백엔드에 저장 (fire-and-forget)
    if (operator) {
      api.setEmployeeTheme(operator.employee_id, newTheme).catch(() => {
        // 실패해도 무시 (UI는 이미 업데이트됨)
      });

      // localStorage에 operator 정보 갱신
      const updated = { ...operator, theme: newTheme };
      setCurrentOperator(updated);
    }
  }

  return (
    <button
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
```
