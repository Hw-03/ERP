---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/useIoSubmit.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useIoSubmit.ts — useIoSubmit.ts 설명

## 이 파일은 무엇을 책임지나

`useIoSubmit.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useIoSubmit`
- `IoBundle`
- `IoSubType`
- `IoWorkType`

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
import { useRef, useState } from "react";
import { api, type IoBundle, type IoSubType, type IoWorkType } from "@/lib/api";
import { ApiError } from "@/lib/api-core";

// crypto.randomUUID 는 보안 컨텍스트(HTTPS / localhost)에서만 정의됨.
// LAN IP (http://192.168.x.x) 같은 비보안 origin 에서는 undefined → 제출 실패. 동일 형식의 UUID v4 폴백 제공.
function makeClientRequestId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useIoSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const clientRequestIdRef = useRef<string | null>(null);

  async function submit(payload: {
    employeeId: string;
    workType: IoWorkType;
    subType: IoSubType;
    fromDepartment?: string | null;
    toDepartment?: string | null;
    referenceNo?: string | null;
    notes?: string | null;
    bundles: IoBundle[];
  }) {
    setSubmitting(true);
    // 폼 세션 멱등 키: 동일 시도 재전송 시 서버가 기존 batch 멱등 반환 → 재고 이중 차감 방지
    if (!clientRequestIdRef.current) {
      clientRequestIdRef.current = makeClientRequestId();
    }
    try {
      const result = await api.submit({
        requester_employee_id: payload.employeeId,
        work_type: payload.workType,
        sub_type: payload.subType,
        from_department: payload.fromDepartment || null,
        to_department: payload.toDepartment || null,
        reference_no: payload.referenceNo || null,
        notes: payload.notes || null,
        client_request_id: clientRequestIdRef.current,
        bundles: payload.bundles,
      });
      // 성공 시 키 폐기 — 다음 폼 세션은 새 UUID
      clientRequestIdRef.current = null;
      return result;
```
