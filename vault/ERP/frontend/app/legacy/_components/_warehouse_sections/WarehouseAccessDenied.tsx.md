---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/WarehouseAccessDenied.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WarehouseAccessDenied.tsx — WarehouseAccessDenied.tsx 설명

## 이 파일은 무엇을 책임지나

`WarehouseAccessDenied.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `WarehouseAccessDenied`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { LEGACY_COLORS } from "@/lib/mes/color";

/**
 * Round-13 (#1) 추출 — DesktopWarehouseView 의 권한 차단 카드.
 *
 * AS / 연구 / 영업 / 기타 부서 등 입출고 권한이 없는 직원이 진입했을 때 표시.
 */
export function WarehouseAccessDenied({ department }: { department: string }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6">
      <div
        className="max-w-md rounded-[16px] border p-8 text-center"
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
      >
        <div className="mb-2 text-lg font-black">입출고 권한이 없습니다</div>
        <div className="text-sm" style={{ color: LEGACY_COLORS.muted }}>
          {department} 부서는 입출고 작업을 사용할 수 없습니다.
          <br />
          재고 조회 또는 관리자 탭을 이용해 주세요.
        </div>
      </div>
    </div>
  );
}
```
