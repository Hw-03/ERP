---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/useIoDraftRestore.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useIoDraftRestore.ts — useIoDraftRestore.ts 설명

## 이 파일은 무엇을 책임지나

`useIoDraftRestore.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useIoDraftRestore`
- `MutableRefObject`
- `IoWorkStateApi`

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
    onStatusChange,
  } = params;

  useEffect(() => {
    if (!draftToRestore) return;
    if (restoredDraftRef.current === draftToRestore.batch_id) return;
    restoredDraftRef.current = draftToRestore.batch_id;
    autosaveBatchIdRef.current = draftToRestore.batch_id;
    state.setWorkType(draftToRestore.work_type);
    state.setSubType(draftToRestore.sub_type);
    if (draftToRestore.work_type === "process") {
      const dir = deptIoDirectionOf(draftToRestore.sub_type);
      state.setDeptIoDirectionRaw(dir);
    }
    state.setFromDepartment(draftToRestore.from_department || state.fromDepartment);
    state.setToDepartment(draftToRestore.to_department || state.toDepartment);
    state.setReferenceNo(draftToRestore.reference_no || "");
    state.setNotes(draftToRestore.notes || "");
    state.setBundles(normalizeBundles(draftToRestore.bundles));
    state.goTo(4);
    onStatusChange("임시저장 작업을 불러왔습니다.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftToRestore?.batch_id]);
}
```
