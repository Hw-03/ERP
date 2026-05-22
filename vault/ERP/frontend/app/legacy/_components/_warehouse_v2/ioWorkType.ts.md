---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/ioWorkType.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# ioWorkType.ts — ioWorkType.ts 설명

## 이 파일은 무엇을 책임지나

`ioWorkType.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `canSeeWorkType`
- `subTypeLabel`
- `requiresDepartments`
- `requiresApproval`
- `hasManualLine`
- `approvalKind`
- `isBomForced`
- `deptIoSubType`
- `deptIoDirectionOf`
- `pickerDirectionLabel`
- 그 외 8개 항목

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
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  RefreshCcw,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "./types";

const MANUAL_ORIGINS = new Set(["manual", "adjust_in", "adjust_out"]);

export const IO_WORK_TYPES: Array<{
  id: IoWorkType;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "receive", label: "원자재 입고", description: "발주 품목 입고", icon: Boxes },
  { id: "warehouse_io", label: "창고 입출고", description: "창고↔부서", icon: ArrowLeftRight },
  { id: "process", label: "부서 입출고", description: "부서 내 작업", icon: Wrench },
  { id: "defect", label: "불량", description: "불량 재고 격리", icon: AlertTriangle },
];

export function canSeeWorkType(
  workType: IoWorkType,
  operator: { warehouse_role?: string | null; name?: string | null } | null | undefined,
): boolean {
  if (workType === "receive") {
    // 원자재 입고는 창고 정/부 만
    return operator?.warehouse_role === "primary" || operator?.warehouse_role === "deputy";
  }
  return true;
}

export const IO_SUB_TYPES: Record<
  IoWorkType,
  Array<{ id: IoSubType; label: string; description: string }>
> = {
  receive: [
    { id: "receive_supplier", label: "외부 입고", description: "선택 품목을 창고 재고로 증가" },
  ],
  warehouse_io: [
    { id: "warehouse_to_dept", label: "창고 → 부서", description: "BOM 1단계 하위 품목 자동 포함" },
    { id: "dept_to_warehouse", label: "부서 → 창고", description: "반납할 하위 품목만 체크" },
  ],
  process: [
    { id: "produce", label: "생산", description: "하위 자재 출고 + 결과 품목 입고" },
    { id: "disassemble", label: "분해", description: "상위 품목 출고 + 회수 품목 입고" },
    { id: "adjust_in", label: "수량보정 입고", description: "선택 품목 수량 증가" },
    { id: "adjust_out", label: "수량보정 출고", description: "선택 품목 수량 감소" },
  ],
  defect: [
    { id: "defect_quarantine", label: "새 격리", description: "정상 재고를 격리 처리 (창고 승인)" },
    { id: "defect_restore",    label: "격리 해제", description: "격리 재고를 정상 복귀 (즉시)" },
```
