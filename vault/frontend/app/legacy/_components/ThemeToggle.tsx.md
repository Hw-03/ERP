---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/ThemeToggle.tsx
status: active
updated: 2026-04-27
source_sha: fed1e6830fbf
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# ThemeToggle.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/ThemeToggle.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `1295` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_components|frontend/app/legacy/_components]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { LEGACY_COLORS } from "./legacyUi";

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      document.documentElement.setAttribute("data-theme", "light");
      setIsLight(true);
    }
  }, []);

  function toggle() {
    const next = !isLight;
    setIsLight(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center rounded-2xl px-3 py-3 transition-all hover:brightness-110"
      style={{
        background: LEGACY_COLORS.s2,
        color: isLight ? LEGACY_COLORS.yellow : LEGACY_COLORS.muted2,
        border: `1px solid ${LEGACY_COLORS.border}`,
      }}
      title={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
    >
      {isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
