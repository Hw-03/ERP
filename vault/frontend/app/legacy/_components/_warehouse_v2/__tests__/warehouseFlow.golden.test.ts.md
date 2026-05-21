---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/__tests__/warehouseFlow.golden.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# warehouseFlow.golden.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_v2/__tests__/warehouseFlow.golden.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
