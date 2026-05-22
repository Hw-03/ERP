---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_v2/__tests__/warehouseFlow.golden.test.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# warehouseFlow.golden.test.ts — warehouseFlow.golden.test.ts 설명

## 이 파일은 무엇을 책임지나

`warehouseFlow.golden.test.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `IoStep`
- `ChildRecalcInput`

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
 * F2-1 패리티 골든 테스트 — warehouse_v2 입출고 흐름 규칙의 현재 출력을 스냅샷으로 고정.
 *
 * 이후 모든 증분(F2-2 ~ F2-4)에서 이 테스트가 100% 그린이어야 동작 보존(패리티) 증명.
 * 소스 변경 없이 현재 HEAD 의 출력값을 expect 에 하드코딩한다.
 *
 * 범위:
 *  1. ioWorkType.ts 전 public 함수 (workType×subType 대표 픽스처)
 *  2. useIoWorkState 의 canAdvance 행렬 + 상태전이(setWorkType/setDeptIoDirection/...) 부수효과
 *  3. IoComposeView 가 인라인으로 들고 있는 순수 분기 로직(F2-2/F2-3 추출 대상)의
 *     현재 동작을 동일 알고리즘으로 재현해 골든 고정 — 추출 후 동일성 비교 기준선.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { IoBundle, IoLine, IoSubType, IoWorkType } from "@/lib/api/types/io";
import {
  IO_WORK_TYPES,
  IO_SUB_TYPES,
  DEFAULT_SUB_TYPE,
  DEPARTMENT_OPTIONS,
  canSeeWorkType,
  subTypeLabel,
  requiresDepartments,
  requiresApproval,
  hasManualLine,
  approvalKind,
  isBomForced,
  deptIoSubType,
  deptIoDirectionOf,
  pickerDirectionLabel,
  deptIoDisplayLabel,
  getItemActionMode,
  lineTagLabel,
  isExitWorkType,
  targetDepartmentOf,
  directionWord,
  deptVisibility,
  exclusionNoteFor,
} from "../ioWorkType";
import { useIoWorkState, IO_STEP_LABELS, type IoStep } from "../useIoWorkState";
import {
  applyToggleLine,
  applyLineQuantityChange,
  applyBundleQuantityChange,
} from "../bomSync";

// ──────────────────────────────────────────────────────────────────
// 픽스처 빌더
// ──────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "l1",
    item_id: "ITEM-001",
    item_name: "테스트 부품",
```
