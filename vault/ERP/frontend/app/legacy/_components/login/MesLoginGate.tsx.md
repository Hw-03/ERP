---
type: file-explanation
source_path: "frontend/app/legacy/_components/login/MesLoginGate.tsx"
importance: critical
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MesLoginGate.tsx — 담당자 로그인 관문

## 이 파일은 무엇을 책임지나

사용자가 시스템에 들어오기 전에 담당자를 선택하고 PIN 인증을 거치게 하는 화면 흐름입니다.

## 업무 흐름에서의 의미

로그인한 담당자를 기준으로 입출고 요청, 승인, 권한 흐름이 자연스럽게 이어져야 합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MesLoginGate`
- `GatePhase`
- `LogoState`
- `MesLoginGateProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/page.tsx]] — `page.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/legacy/page.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/services/pin_auth.py]] — `pin_auth.py`는 `pin_auth` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

여기를 바꾸면 직원 권한, 담당자 자동 적용, PIN 실패 처리에 영향이 큽니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { OperatorLoginCard } from "./OperatorLoginCard";
import { clearCurrentOperator, getStoredBootId, readCurrentOperator } from "./useCurrentOperator";

type GatePhase = "loading" | "intro" | "form" | "authed";
type LogoState = "center" | "above-card";

/*
 * 위치 계산 (영구 로고가 카드 위로 이동, 페이지 상단과 카드 상단의 정확한 중간에 위치)
 * - 카드 상단 = calc(50vh - 280px)  (alignSelf: flex-start + marginTop)
 * - 목표: 로고 중심 = 카드 상단의 절반 = calc(25vh - 140px)
 * - 로고 중심 = 50vh - T × (1/3)  (scale 1/3 + translateY(-T))
 * - 50vh - T/3 = 25vh - 140px → T = 75vh + 420px
 * - 인트로 로고 자연 크기 840px, 축소 후 280px (scale 1/3, 종횡비 300:55 → 높이 51px)
 */
const SHRINK_TRANSFORM = "scale(0.333) translateY(calc(-75vh - 420px))";
const CENTER_TRANSFORM = "scale(1) translateY(0)";

interface MesLoginGateProps {
  children: React.ReactNode;
}

export function MesLoginGate({ children }: MesLoginGateProps) {
  const [phase, setPhase] = useState<GatePhase>("loading");
  const [logoState, setLogoState] = useState<LogoState>("center");
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // 초기 인증 상태 확인
  useEffect(() => {
    let cancelled = false;
    const goToLogin = () => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) {
        setLogoState("above-card");
        setPhase("form");
      } else {
        setPhase("intro");
      }
    };

    const stored = readCurrentOperator();
    if (!stored) {
      goToLogin();
      return () => { cancelled = true; };
    }
```
