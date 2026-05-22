---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_warehouse_hooks/useWarehouseScroll.ts
status: active
updated: 2026-04-27
source_sha: b2aff4efcf25
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useWarehouseScroll.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_hooks/useWarehouseScroll.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `1924` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_hooks/_warehouse_hooks|frontend/app/legacy/_components/_warehouse_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useEffect, useRef } from "react";

type Args = {
  step1Done: boolean;
  step2Done: boolean;
  forcedStep: 1 | 2 | null;
  lastResult: { count: number; label: string } | null;
};

export function useWarehouseScroll({ step1Done, step2Done, forcedStep, lastResult }: Args) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const step4Ref = useRef<HTMLDivElement>(null);
  const prevStep1DoneRef = useRef(false);
  const prevStep2DoneRef = useRef(false);
  const prevForcedStepRef = useRef<1 | 2 | null>(null);
  const prevLastResultRef = useRef<{ count: number; label: string } | null>(null);

  function scrollToRef(ref: React.RefObject<HTMLDivElement>, delay = 150) {
    window.setTimeout(() => {
      requestAnimationFrame(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, delay);
  }

  useEffect(() => {
    if (step1Done && !prevStep1DoneRef.current) scrollToRef(step2Ref);
    prevStep1DoneRef.current = step1Done;
  }, [step1Done]);

# ... (이하 26줄 생략. 원본 참조)

````
