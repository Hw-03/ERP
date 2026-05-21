---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/MesLoginGate.tsx
tags: [vault, code-note, auto-generated, stub]
---

# MesLoginGate.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/login/MesLoginGate.tsx]]

## 원본 첫 줄

```
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

```
