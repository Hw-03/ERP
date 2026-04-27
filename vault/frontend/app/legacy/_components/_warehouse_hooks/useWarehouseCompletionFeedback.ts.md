---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_hooks/useWarehouseCompletionFeedback.ts
status: active
updated: 2026-04-27
source_sha: e729c9bc0945
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useWarehouseCompletionFeedback.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_hooks/useWarehouseCompletionFeedback.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `2174` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_hooks/_warehouse_hooks|frontend/app/legacy/_components/_warehouse_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Direction,
  TransferDirection,
  WorkType,
} from "../_warehouse_steps";

type Args = {
  lastResult: { count: number; label: string } | null;
  workType: WorkType;
  rawDirection: Direction;
  warehouseDirection: TransferDirection;
  deptDirection: Direction;
};

export function useWarehouseCompletionFeedback({
  lastResult,
  workType,
  rawDirection,
  warehouseDirection,
  deptDirection,
}: Args) {
  // nonce: 매 실행마다 새 값 → overlay div의 key로 사용 → 강제 remount 보장
  const [completionFlyout, setCompletionFlyout] = useState<
    { nonce: number; kind: "in" | "out"; count: number } | null
  >(null);
  const [completionPhase, setCompletionPhase] = useState<"show" | "out">("show");
  const flyoutTimer1Ref = useRef<number | null>(null);
  const flyoutTimer2Ref = useRef<number | null>(null);

  useEffect(() => {
    if (!lastResult) return;

    if (flyoutTimer1Ref.current != null) window.clearTimeout(flyoutTimer1Ref.current);
    if (flyoutTimer2Ref.current != null) window.clearTimeout(flyoutTimer2Ref.current);

    const isIn = (() => {
      if (workType === "raw-io") return rawDirection === "in";
      if (workType === "warehouse-io") return warehouseDirection === "dept-to-wh";
      if (workType === "dept-io") return deptDirection === "in";
      return false;
    })();

    const nonce = Date.now();
    setCompletionPhase("show");
    setCompletionFlyout({ nonce, kind: isIn ? "in" : "out", count: lastResult.count });

    flyoutTimer1Ref.current = window.setTimeout(() => {
      setCompletionPhase("out");
    }, 1100);

    flyoutTimer2Ref.current = window.setTimeout(() => {
      setCompletionFlyout(null);
    }, 1100 + 380);

    return () => {
      if (flyoutTimer1Ref.current != null) window.clearTimeout(flyoutTimer1Ref.current);
      if (flyoutTimer2Ref.current != null) window.clearTimeout(flyoutTimer2Ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult]);

  return { completionFlyout, completionPhase };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
