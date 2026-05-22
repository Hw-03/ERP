---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_hooks/useWarehouseScroll.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useWarehouseScroll.ts — useWarehouseScroll.ts 설명

## 이 파일은 무엇을 책임지나

`useWarehouseScroll.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useWarehouseScroll`
- `Args`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
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

  useEffect(() => {
    if (step2Done && !prevStep2DoneRef.current) scrollToRef(step3Ref);
    prevStep2DoneRef.current = step2Done;
  }, [step2Done]);

  useEffect(() => {
    if (lastResult && lastResult !== prevLastResultRef.current) {
      scrollToRef(step2Ref, 200);
    }
    prevLastResultRef.current = lastResult;
  }, [lastResult]);

  useEffect(() => {
    if (forcedStep === 1 && prevForcedStepRef.current !== 1) scrollToRef(step1Ref);
    if (forcedStep === 2 && prevForcedStepRef.current !== 2) scrollToRef(step2Ref);
    prevForcedStepRef.current = forcedStep;
  }, [forcedStep]);

  return {
    scrollRootRef,
```
