---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraftRestore.ts
tags: [vault, code-note, auto-generated, stub]
---

# useIoDraftRestore.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/useIoDraftRestore.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * 임시저장(draft) 복원 effect 추출.
 *
 * IoComposeView 에 인라인되어 있던 draftToRestore → state 복원 useEffect 를
 * 그대로 옮긴 것. 부수효과·실행 시점·의존성 배열은 원본과 동일하다.
 *
 * 공유 ref(restoredDraftRef/autosaveBatchIdRef)와 normalizeBundles 는
 * autosave/submit 경로와 공유되므로 IoComposeView 가 소유하고 주입한다.
 */
import { useEffect, type MutableRefObject } from "react";
import type { IoBatch, IoBundle } from "@/lib/api";
import { deptIoDirectionOf } from "./ioWorkType";
import type { useIoWorkState } from "./useIoWorkState";

type IoWorkStateApi = ReturnType<typeof useIoWorkState>;

export function useIoDraftRestore(params: {
  draftToRestore: IoBatch | null | undefined;
  restoredDraftRef: MutableRefObject<string | null>;
  autosaveBatchIdRef: MutableRefObject<string | null>;
  state: IoWorkStateApi;
  normalizeBundles: (bundles: IoBundle[]) => IoBundle[];
  onStatusChange: (status: string) => void;
}) {
  const {
    draftToRestore,
    restoredDraftRef,
    autosaveBatchIdRef,
    state,
    normalizeBundles,
```
