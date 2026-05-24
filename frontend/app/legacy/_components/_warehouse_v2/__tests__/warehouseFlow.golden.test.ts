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
    item_code: null,
    unit: "EA",
    direction: "in",
    from_bucket: "none",
    from_department: null,
    to_bucket: "warehouse",
    to_department: null,
    quantity: 10,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
    shortage: 0,
    exclusion_note: null,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<IoBundle> & { lines?: IoLine[] } = {}): IoBundle {
  return {
    bundle_id: "b1",
    source_kind: "direct_item",
    title: "테스트 번들",
    source_item_id: null,
    quantity: 10,
    expanded_level: 0,
    lines: [],
    ...overrides,
  };
}

const ALL_WORK_TYPES: IoWorkType[] = ["receive", "warehouse_io", "process", "defect"];
const ALL_SUB_TYPES: IoSubType[] = [
  "receive_supplier",
  "warehouse_to_dept",
  "dept_to_warehouse",
  "produce",
  "disassemble",
  "dept_transfer",
  "adjust_in",
  "adjust_out",
  "defect_quarantine",
  "supplier_return",
];

// ──────────────────────────────────────────────────────────────────
// IO_WORK_TYPES / IO_SUB_TYPES / 상수
// ──────────────────────────────────────────────────────────────────
describe("ioWorkType 상수", () => {
  it("IO_WORK_TYPES id/label 고정", () => {
    expect(IO_WORK_TYPES.map((r) => [r.id, r.label, r.description])).toEqual([
      ["receive", "원자재 입고", "발주 품목 입고"],
      ["warehouse_io", "창고 입출고", "창고↔부서"],
      ["process", "부서 입출고", "부서 내 작업"],
      ["defect", "불량", "불량 재고 격리"],
    ]);
  });

  it("IO_SUB_TYPES workType별 id 목록 고정", () => {
    const flat = Object.fromEntries(
      Object.entries(IO_SUB_TYPES).map(([wt, rows]) => [wt, rows.map((r) => r.id)]),
    );
    expect(flat).toEqual({
      receive: ["receive_supplier"],
      warehouse_io: ["warehouse_to_dept", "dept_to_warehouse"],
      process: ["produce", "disassemble", "adjust_in", "adjust_out"],
      defect: ["defect_quarantine", "defect_restore", "defect_process", "supplier_return"],
    });
  });

  it("IO_SUB_TYPES label/description 고정", () => {
    const labels = Object.values(IO_SUB_TYPES)
      .flat()
      .map((r) => [r.id, r.label, r.description]);
    expect(labels).toEqual([
      ["receive_supplier", "외부 입고", "선택 품목을 창고 재고로 증가"],
      ["warehouse_to_dept", "창고 → 부서", "BOM 1단계 하위 품목 자동 포함"],
      ["dept_to_warehouse", "부서 → 창고", "반납할 하위 품목만 체크"],
      ["produce", "생산", "하위 자재 출고 + 결과 품목 입고"],
      ["disassemble", "분해", "상위 품목 출고 + 회수 품목 입고"],
      ["adjust_in", "수량보정 입고", "선택 품목 수량 증가"],
      ["adjust_out", "수량보정 출고", "선택 품목 수량 감소"],
      ["defect_quarantine", "새 격리", "정상 재고를 격리 처리 (창고 승인)"],
      ["defect_restore", "격리 해제", "격리 재고를 정상 복귀 (즉시)"],
      ["defect_process", "격리 처리", "격리 재고 폐기·재작업 (창고 승인)"],
      ["supplier_return", "원자재 반품", "격리 재고를 공급처에 반품 (창고 승인)"],
    ]);
  });

  it("DEFAULT_SUB_TYPE 고정", () => {
    expect(DEFAULT_SUB_TYPE).toEqual({
      receive: "receive_supplier",
      warehouse_io: "warehouse_to_dept",
      process: "produce",
      defect: "defect_quarantine",
    });
  });

  it("DEPARTMENT_OPTIONS 고정", () => {
    expect(DEPARTMENT_OPTIONS).toEqual(["조립", "고압", "진공", "튜닝", "튜브", "출하", "AS"]);
  });
});

// ──────────────────────────────────────────────────────────────────
// canSeeWorkType
// ──────────────────────────────────────────────────────────────────
describe("canSeeWorkType", () => {
  it("receive: primary/deputy 만 true", () => {
    expect(canSeeWorkType("receive", { warehouse_role: "primary" })).toBe(true);
    expect(canSeeWorkType("receive", { warehouse_role: "deputy" })).toBe(true);
    expect(canSeeWorkType("receive", { warehouse_role: "none" })).toBe(false);
    expect(canSeeWorkType("receive", null)).toBe(false);
    expect(canSeeWorkType("receive", undefined)).toBe(false);
    expect(canSeeWorkType("receive", {})).toBe(false);
  });

  it("receive 외 workType 은 항상 true", () => {
    for (const wt of ["warehouse_io", "process", "defect"] as IoWorkType[]) {
      expect(canSeeWorkType(wt, null)).toBe(true);
      expect(canSeeWorkType(wt, { warehouse_role: "none" })).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// subTypeLabel
// ──────────────────────────────────────────────────────────────────
describe("subTypeLabel", () => {
  it("모든 subType 라벨 고정", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, subTypeLabel(s)]));
    expect(map).toEqual({
      receive_supplier: "외부 입고",
      warehouse_to_dept: "창고 → 부서",
      dept_to_warehouse: "부서 → 창고",
      produce: "생산",
      disassemble: "분해",
      dept_transfer: "dept_transfer", // IO_SUB_TYPES 에 없음 → 그대로 반환
      adjust_in: "수량보정 입고",
      adjust_out: "수량보정 출고",
      defect_quarantine: "새 격리",
      supplier_return: "원자재 반품",
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// requiresDepartments
// ──────────────────────────────────────────────────────────────────
describe("requiresDepartments", () => {
  it("subType별 고정", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, requiresDepartments(s)]));
    expect(map).toEqual({
      receive_supplier: false,
      warehouse_to_dept: true,
      dept_to_warehouse: true,
      produce: true,
      disassemble: true,
      dept_transfer: true,
      adjust_in: true,
      adjust_out: true,
      defect_quarantine: true,
      supplier_return: true,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// requiresApproval
// ──────────────────────────────────────────────────────────────────
describe("requiresApproval", () => {
  it("subType별 고정", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, requiresApproval(s)]));
    expect(map).toEqual({
      receive_supplier: false,
      warehouse_to_dept: true,
      dept_to_warehouse: true,
      produce: false,
      disassemble: false,
      dept_transfer: false,
      adjust_in: false,
      adjust_out: false,
      defect_quarantine: true,
      supplier_return: true,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// hasManualLine
// ──────────────────────────────────────────────────────────────────
describe("hasManualLine", () => {
  it("빈 번들 → false", () => {
    expect(hasManualLine([])).toBe(false);
  });

  it("manual origin 포함(included) → true", () => {
    const b = makeBundle({ lines: [makeLine({ origin: "manual", included: true })] });
    expect(hasManualLine([b])).toBe(true);
  });

  it("manual 이지만 included=false → false", () => {
    const b = makeBundle({ lines: [makeLine({ origin: "manual", included: false })] });
    expect(hasManualLine([b])).toBe(false);
  });

  it("origin=direct → false", () => {
    const b = makeBundle({ lines: [makeLine({ origin: "direct" })] });
    expect(hasManualLine([b])).toBe(false);
  });

  it("origin=bom_auto → false", () => {
    const b = makeBundle({ lines: [makeLine({ origin: "bom_auto" })] });
    expect(hasManualLine([b])).toBe(false);
  });

  it("lines 누락 번들도 안전", () => {
    const b = { ...makeBundle(), lines: undefined } as unknown as IoBundle;
    expect(hasManualLine([b])).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// approvalKind
// ──────────────────────────────────────────────────────────────────
describe("approvalKind", () => {
  it("requiresApproval subType → warehouse (manual 섞여도)", () => {
    const withManual = [makeBundle({ lines: [makeLine({ origin: "manual" })] })];
    expect(approvalKind("warehouse_to_dept", [])).toBe("warehouse");
    expect(approvalKind("dept_to_warehouse", withManual)).toBe("warehouse");
    expect(approvalKind("defect_quarantine", withManual)).toBe("warehouse");
    expect(approvalKind("supplier_return", [])).toBe("warehouse");
  });

  it("비결재 subType + manual line → department", () => {
    const withManual = [makeBundle({ lines: [makeLine({ origin: "manual" })] })];
    expect(approvalKind("adjust_in", withManual)).toBe("department");
    expect(approvalKind("produce", withManual)).toBe("department");
  });

  it("비결재 subType + manual 없음 → none", () => {
    const direct = [makeBundle({ lines: [makeLine({ origin: "direct" })] })];
    expect(approvalKind("produce", direct)).toBe("none");
    expect(approvalKind("receive_supplier", [])).toBe("none");
  });
});

// ──────────────────────────────────────────────────────────────────
// isBomForced
// ──────────────────────────────────────────────────────────────────
describe("isBomForced", () => {
  it("produce/disassemble 만 true", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, isBomForced(s)]));
    expect(map).toEqual({
      receive_supplier: false,
      warehouse_to_dept: false,
      dept_to_warehouse: false,
      produce: true,
      disassemble: true,
      dept_transfer: false,
      adjust_in: false,
      adjust_out: false,
      defect_quarantine: false,
      supplier_return: false,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// deptIoSubType
// ──────────────────────────────────────────────────────────────────
describe("deptIoSubType", () => {
  it("(in,bom)=produce (in,single)=adjust_in (out,bom)=disassemble (out,single)=adjust_out", () => {
    expect(deptIoSubType("in", "bom")).toBe("produce");
    expect(deptIoSubType("in", "single")).toBe("adjust_in");
    expect(deptIoSubType("out", "bom")).toBe("disassemble");
    expect(deptIoSubType("out", "single")).toBe("adjust_out");
  });
});

// ──────────────────────────────────────────────────────────────────
// deptIoDirectionOf
// ──────────────────────────────────────────────────────────────────
describe("deptIoDirectionOf", () => {
  it("subType별 방향 고정", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, deptIoDirectionOf(s)]));
    expect(map).toEqual({
      receive_supplier: null,
      warehouse_to_dept: null,
      dept_to_warehouse: null,
      produce: "in",
      disassemble: "out",
      dept_transfer: null,
      adjust_in: "in",
      adjust_out: "out",
      defect_quarantine: null,
      supplier_return: null,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// pickerDirectionLabel
// ──────────────────────────────────────────────────────────────────
describe("pickerDirectionLabel", () => {
  it("subType별 입/출 라벨 고정", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, pickerDirectionLabel(s)]));
    expect(map).toEqual({
      receive_supplier: "입고",
      warehouse_to_dept: "입고",
      dept_to_warehouse: "출고",
      produce: "입고",
      disassemble: "출고",
      dept_transfer: "출고",
      adjust_in: "입고",
      adjust_out: "출고",
      defect_quarantine: "출고",
      supplier_return: "출고",
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// deptIoDisplayLabel
// ──────────────────────────────────────────────────────────────────
describe("deptIoDisplayLabel", () => {
  it("process subType만 라벨, 그 외 null", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, deptIoDisplayLabel(s)]));
    expect(map).toEqual({
      receive_supplier: null,
      warehouse_to_dept: null,
      dept_to_warehouse: null,
      produce: "입고 · BOM",
      disassemble: "출고 · BOM",
      dept_transfer: null,
      adjust_in: "입고 · 낱개",
      adjust_out: "출고 · 낱개",
      defect_quarantine: null,
      supplier_return: null,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// getItemActionMode
// ──────────────────────────────────────────────────────────────────
describe("getItemActionMode", () => {
  it("subType별 모드 고정", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, getItemActionMode(s)]));
    expect(map).toEqual({
      receive_supplier: "single_only",
      warehouse_to_dept: "bom_or_single",
      dept_to_warehouse: "bom_or_single",
      produce: "bom_or_single",
      disassemble: "bom_or_single",
      dept_transfer: "single_only",
      adjust_in: "single_only",
      adjust_out: "single_only",
      defect_quarantine: "single_only",
      supplier_return: "single_only",
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// lineTagLabel
// ──────────────────────────────────────────────────────────────────
describe("lineTagLabel", () => {
  it("adjust_in + direct/manual → 단품 입고 muted", () => {
    expect(lineTagLabel(makeLine({ origin: "direct" }), "adjust_in")).toEqual({ text: "단품 입고", tone: "muted" });
    expect(lineTagLabel(makeLine({ origin: "manual" }), "adjust_in")).toEqual({ text: "단품 입고", tone: "muted" });
  });

  it("adjust_out + direct/manual → 단품 출고 muted", () => {
    expect(lineTagLabel(makeLine({ origin: "direct" }), "adjust_out")).toEqual({ text: "단품 출고", tone: "muted" });
    expect(lineTagLabel(makeLine({ origin: "manual" }), "adjust_out")).toEqual({ text: "단품 출고", tone: "muted" });
  });

  it("origin=manual (비 adjust) → 이 품목만 muted", () => {
    expect(lineTagLabel(makeLine({ origin: "manual" }), "produce")).toEqual({ text: "이 품목만", tone: "muted" });
    expect(lineTagLabel(makeLine({ origin: "manual" }), "warehouse_to_dept")).toEqual({ text: "이 품목만", tone: "muted" });
  });

  it("produce: direct=생산 결과품 green, bom_auto=투입 자재 red", () => {
    expect(lineTagLabel(makeLine({ origin: "direct" }), "produce")).toEqual({ text: "생산 결과품", tone: "green" });
    expect(lineTagLabel(makeLine({ origin: "bom_auto" }), "produce")).toEqual({ text: "투입 자재", tone: "red" });
  });

  it("disassemble: direct=분해 대상 red, bom_auto=회수 품목 green", () => {
    expect(lineTagLabel(makeLine({ origin: "direct" }), "disassemble")).toEqual({ text: "분해 대상", tone: "red" });
    expect(lineTagLabel(makeLine({ origin: "bom_auto" }), "disassemble")).toEqual({ text: "회수 품목", tone: "green" });
  });

  it("warehouse_to_dept/dept_to_warehouse: direct=상위 blue, bom_auto=하위 muted", () => {
    expect(lineTagLabel(makeLine({ origin: "direct" }), "warehouse_to_dept")).toEqual({ text: "상위", tone: "blue" });
    expect(lineTagLabel(makeLine({ origin: "bom_auto" }), "warehouse_to_dept")).toEqual({ text: "하위", tone: "muted" });
    expect(lineTagLabel(makeLine({ origin: "direct" }), "dept_to_warehouse")).toEqual({ text: "상위", tone: "blue" });
    expect(lineTagLabel(makeLine({ origin: "bom_auto" }), "dept_to_warehouse")).toEqual({ text: "하위", tone: "muted" });
  });

  it("기타 조합 → 직접 선택 blue (fallback)", () => {
    expect(lineTagLabel(makeLine({ origin: "package_auto" }), "produce")).toEqual({ text: "직접 선택", tone: "blue" });
    expect(lineTagLabel(makeLine({ origin: "direct" }), "receive_supplier")).toEqual({ text: "직접 선택", tone: "blue" });
    expect(lineTagLabel(makeLine({ origin: "bom_auto" }), "adjust_in")).toEqual({ text: "직접 선택", tone: "blue" });
  });
});

// ──────────────────────────────────────────────────────────────────
// isExitWorkType
// ──────────────────────────────────────────────────────────────────
describe("isExitWorkType", () => {
  it("defect 만 true", () => {
    const map = Object.fromEntries(ALL_WORK_TYPES.map((w) => [w, isExitWorkType(w)]));
    expect(map).toEqual({
      receive: false,
      warehouse_io: false,
      process: false,
      defect: true,
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// useIoWorkState — IO_STEP_LABELS
// ──────────────────────────────────────────────────────────────────
describe("IO_STEP_LABELS", () => {
  it("스텝 라벨 고정", () => {
    expect(IO_STEP_LABELS).toEqual({
      1: "작업 유형",
      2: "세부 작업",
      3: "대상 선택",
      4: "실제 반영",
      5: "제출 확인",
    });
  });
});

// ──────────────────────────────────────────────────────────────────
// useIoWorkState — 초기 상태
// ──────────────────────────────────────────────────────────────────
describe("useIoWorkState 초기 상태", () => {
  it("initialDepartment 없음 → 조립 기본", () => {
    const { result } = renderHook(() => useIoWorkState());
    expect(result.current.workType).toBe("receive");
    expect(result.current.subType).toBe("receive_supplier");
    expect(result.current.fromDepartment).toBe("조립");
    expect(result.current.toDepartment).toBe("조립");
    expect(result.current.bundles).toEqual([]);
    expect(result.current.step).toBe(1);
    expect(result.current.deptIoDirection).toBeNull();
    expect(result.current.notes).toBe("");
    expect(result.current.referenceNo).toBe("");
  });

  it("initialDepartment='고압' → from/to 모두 고압", () => {
    const { result } = renderHook(() => useIoWorkState(undefined, "고압"));
    expect(result.current.fromDepartment).toBe("고압");
    expect(result.current.toDepartment).toBe("고압");
  });

  it("초기 canAdvance: 1=true 2=true(receive) 3=false 4=false 5=true", () => {
    const { result } = renderHook(() => useIoWorkState());
    expect(result.current.canAdvance).toEqual({ 1: true, 2: true, 3: false, 4: false, 5: true });
  });
});

// ──────────────────────────────────────────────────────────────────
// useIoWorkState — setWorkType 부수효과
// ──────────────────────────────────────────────────────────────────
describe("useIoWorkState setWorkType", () => {
  it("workType 전환 → subType=DEFAULT, deptIoDirection=null, bundles=[], step=1", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([makeBundle()]);
      result.current.goTo(3);
    });
    act(() => result.current.setWorkType("process"));
    expect(result.current.workType).toBe("process");
    expect(result.current.subType).toBe("produce");
    expect(result.current.deptIoDirection).toBeNull();
    expect(result.current.bundles).toEqual([]);
    expect(result.current.step).toBe(1);
  });

  it("각 workType → DEFAULT_SUB_TYPE 매칭", () => {
    const { result } = renderHook(() => useIoWorkState());
    for (const wt of ALL_WORK_TYPES) {
      act(() => result.current.setWorkType(wt));
      expect(result.current.subType).toBe(DEFAULT_SUB_TYPE[wt]);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// useIoWorkState — canAdvance[2] (process 방향 게이트)
// ──────────────────────────────────────────────────────────────────
describe("useIoWorkState canAdvance[2] process 게이트", () => {
  it("process + 방향 미선택 → canAdvance[2]=false", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.setWorkType("process"));
    expect(result.current.deptIoDirection).toBeNull();
    expect(result.current.canAdvance[2]).toBe(false);
  });

  it("process + setDeptIoDirection('in') → canAdvance[2]=true, subType=produce, bundles 초기화", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.setWorkType("process"));
    act(() => {
      result.current.setBundles([makeBundle()]);
    });
    act(() => result.current.setDeptIoDirection("in"));
    expect(result.current.deptIoDirection).toBe("in");
    expect(result.current.subType).toBe("produce");
    expect(result.current.bundles).toEqual([]);
    expect(result.current.canAdvance[2]).toBe(true);
  });

  it("process + setDeptIoDirection('out') → subType=disassemble", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.setWorkType("process"));
    act(() => result.current.setDeptIoDirection("out"));
    expect(result.current.subType).toBe("disassemble");
  });

  it("비 process workType → 방향 무관 canAdvance[2]=true", () => {
    const { result } = renderHook(() => useIoWorkState());
    for (const wt of ["receive", "warehouse_io", "defect"] as IoWorkType[]) {
      act(() => result.current.setWorkType(wt));
      expect(result.current.canAdvance[2]).toBe(true);
    }
  });

  it("setDeptIoDirectionRaw → bundle 보존 + subType 변경 없음", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.setWorkType("process"));
    act(() => {
      result.current.setBundles([makeBundle()]);
    });
    act(() => result.current.setDeptIoDirectionRaw("out"));
    expect(result.current.deptIoDirection).toBe("out");
    expect(result.current.subType).toBe("produce"); // raw 는 subType 안 바꿈
    expect(result.current.bundles).toHaveLength(1); // bundle 보존
  });
});

// ──────────────────────────────────────────────────────────────────
// useIoWorkState — canAdvance[3]/[4] (bundle/shortage/qty 게이트)
// ──────────────────────────────────────────────────────────────────
describe("useIoWorkState canAdvance[3]/[4]", () => {
  it("bundles 0 → [3]=false [4]=false", () => {
    const { result } = renderHook(() => useIoWorkState());
    expect(result.current.canAdvance[3]).toBe(false);
    expect(result.current.canAdvance[4]).toBe(false);
  });

  it("bundle + included line 정상 → [3]=true [4]=true", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([makeBundle({ lines: [makeLine({ included: true, shortage: 0, quantity: 5 })] })]);
    });
    expect(result.current.canAdvance[3]).toBe(true);
    expect(result.current.canAdvance[4]).toBe(true);
    expect(result.current.hasShortage).toBe(false);
    expect(result.current.hasInvalidQuantity).toBe(false);
  });

  it("shortage>0 → [4]=false, hasShortage=true", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([makeBundle({ lines: [makeLine({ included: true, shortage: 3 })] })]);
    });
    expect(result.current.canAdvance[3]).toBe(true);
    expect(result.current.canAdvance[4]).toBe(false);
    expect(result.current.hasShortage).toBe(true);
  });

  it("quantity<=0 → [4]=false, hasInvalidQuantity=true", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([makeBundle({ lines: [makeLine({ included: true, quantity: 0 })] })]);
    });
    expect(result.current.canAdvance[4]).toBe(false);
    expect(result.current.hasInvalidQuantity).toBe(true);
  });

  it("included line 0개(전부 제외) → [4]=false", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([makeBundle({ lines: [makeLine({ included: false })] })]);
    });
    expect(result.current.includedLines).toHaveLength(0);
    expect(result.current.excludedLines).toHaveLength(1);
    expect(result.current.canAdvance[4]).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
// useIoWorkState — step 이동/updateLine/removeLine/reset
// ──────────────────────────────────────────────────────────────────
describe("useIoWorkState step/line 조작", () => {
  it("goNext/goPrev/goTo clamp", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => result.current.goPrev()); // 1에서 더 못 내려감
    expect(result.current.step).toBe(1);
    act(() => result.current.goNext());
    expect(result.current.step).toBe(2);
    act(() => result.current.goTo(5));
    expect(result.current.step).toBe(5);
    act(() => result.current.goNext()); // 5에서 더 못 올라감
    expect(result.current.step).toBe(5);
  });

  it("updateLine → 해당 라인만 변경", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([
        makeBundle({
          bundle_id: "B",
          lines: [makeLine({ line_id: "L1", quantity: 1 }), makeLine({ line_id: "L2", quantity: 2 })],
        }),
      ]);
    });
    act(() => {
      result.current.updateLine("B", "L1", (l) => ({ ...l, quantity: 99 }));
    });
    expect(result.current.bundles[0].lines[0].quantity).toBe(99);
    expect(result.current.bundles[0].lines[1].quantity).toBe(2);
  });

  it("removeLine → 라인 제거, 라인 0개 번들은 번들째 제거", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setBundles([
        makeBundle({ bundle_id: "B1", lines: [makeLine({ line_id: "L1" })] }),
        makeBundle({ bundle_id: "B2", lines: [makeLine({ line_id: "L2" }), makeLine({ line_id: "L3" })] }),
      ]);
    });
    act(() => result.current.removeLine("B1", "L1"));
    expect(result.current.bundles.map((b) => b.bundle_id)).toEqual(["B2"]);
    act(() => result.current.removeLine("B2", "L2"));
    expect(result.current.bundles[0].lines.map((l) => l.line_id)).toEqual(["L3"]);
  });

  it("reset → bundles/notes/referenceNo/step 초기화 (workType/subType 보존)", () => {
    const { result } = renderHook(() => useIoWorkState());
    act(() => {
      result.current.setWorkType("warehouse_io");
      result.current.setBundles([makeBundle()]);
      result.current.setNotes("메모");
      result.current.setReferenceNo("REF-1");
      result.current.goTo(4);
    });
    act(() => result.current.reset());
    expect(result.current.bundles).toEqual([]);
    expect(result.current.notes).toBe("");
    expect(result.current.referenceNo).toBe("");
    expect(result.current.step).toBe(1);
    expect(result.current.workType).toBe("warehouse_io"); // 보존
    expect(result.current.subType).toBe("warehouse_to_dept"); // 보존
  });
});

// ══════════════════════════════════════════════════════════════════
// IoComposeView 인라인 분기 로직 골든 (F2-2/F2-3 추출 대상의 기준선)
//
// 아래는 IoComposeView.tsx 내부에 인라인된 순수 분기/계산 로직을
// 동일 알고리즘으로 재현해 현재 출력을 고정한다. 추출 후 추출 함수의
// 결과가 아래 기대값과 동일해야 패리티 보장.
// ══════════════════════════════════════════════════════════════════

// ── (A) Step 3 targetDepartment 결정 (IoComposeView.tsx:690-700 → targetDepartmentOf) ──
describe("[추출 골든] targetDepartmentOf — Step3 대상 부서", () => {
  it("subType별 대상 부서 (from=출발, to=도착)", () => {
    const map = Object.fromEntries(
      ALL_SUB_TYPES.map((s) => [s, targetDepartmentOf(s, "출발", "도착")]),
    );
    expect(map).toEqual({
      receive_supplier: null,
      warehouse_to_dept: "도착",
      dept_to_warehouse: "출발",
      produce: "도착",
      disassemble: "도착",
      dept_transfer: "도착",
      adjust_in: "도착",
      adjust_out: "도착",
      defect_quarantine: "출발",
      supplier_return: "출발",
    });
  });
});

// ── (B) stepTwoSummary process 방향 라벨 (IoComposeView.tsx:409-411 → directionWord) ──
describe("[추출 골든] directionWord — stepTwoSummary 방향 단어", () => {
  it("in/out/null", () => {
    expect(directionWord("in")).toBe("입고");
    expect(directionWord("out")).toBe("출고");
    expect(directionWord(null)).toBe("미선택");
  });
});

// ── (C) deptVisibility (IoWorkTypeStep.tsx:80-93 → ioWorkType.deptVisibility) ──
describe("[추출 골든] deptVisibility", () => {
  it("subType별 from/to 노출", () => {
    const map = Object.fromEntries(ALL_SUB_TYPES.map((s) => [s, deptVisibility(s)]));
    expect(map).toEqual({
      receive_supplier: { from: false, to: false },
      warehouse_to_dept: { from: false, to: true },
      dept_to_warehouse: { from: true, to: false },
      produce: { from: false, to: true },
      disassemble: { from: false, to: true },
      dept_transfer: { from: true, to: true },
      adjust_in: { from: false, to: true },
      adjust_out: { from: false, to: true },
      defect_quarantine: { from: true, to: false },
      supplier_return: { from: true, to: false },
    });
  });
});

// ── (D) toggle 시 exclusion_note (IoComposeView.tsx:768-772 → exclusionNoteFor) ──
describe("[추출 골든] exclusionNoteFor — toggle 제외 문구", () => {
  it("included=true → null", () => {
    expect(exclusionNoteFor("produce", "direct", true)).toBeNull();
  });
  it("disassemble + bom_auto + 제외 → 회수 안 됨", () => {
    expect(exclusionNoteFor("disassemble", "bom_auto", false)).toBe("회수 안 됨");
  });
  it("그 외 제외 → 이번 작업 제외", () => {
    expect(exclusionNoteFor("disassemble", "direct", false)).toBe("이번 작업 제외");
    expect(exclusionNoteFor("produce", "bom_auto", false)).toBe("이번 작업 제외");
    expect(exclusionNoteFor("warehouse_to_dept", "bom_auto", false)).toBe("이번 작업 제외");
  });
});

// ── (E) BOM 비례 재계산 (IoComposeView.tsx:785-866) ──
// 부모(direct) 수량 변경 → 자식(bom_auto) 비례 재계산 알고리즘.
type ChildRecalcInput = {
  subType: IoSubType;
  parentQty: number;
  child: Pick<IoLine, "origin" | "bom_expected" | "included" | "edited">;
  childAvail: number | null;
};
function recalcChild(input: ChildRecalcInput): { quantity: number; shortage: number; edited: false } | "unchanged" {
  const { subType, parentQty, child, childAvail } = input;
  const forced = subType === "produce" || subType === "disassemble"; // isBomForced
  if (
    child.origin === "bom_auto" &&
    child.bom_expected != null &&
    Number(child.bom_expected) > 0 &&
    (forced || !child.edited)
  ) {
    const ratio = Number(child.bom_expected);
    const childQty = parentQty * ratio;
    const childShortage =
      !child.included || childAvail === null ? 0 : Math.max(0, childQty - childAvail);
    return { quantity: childQty, shortage: childShortage, edited: false };
  }
  return "unchanged";
}

describe("[인라인 골든] BOM 자식 비례 재계산 recalcChild", () => {
  it("produce(forced): edited=true 여도 강제 재계산", () => {
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 3,
        child: { origin: "bom_auto", bom_expected: 2, included: true, edited: true },
        childAvail: 100,
      }),
    ).toEqual({ quantity: 6, shortage: 0, edited: false });
  });

  it("warehouse_to_dept(미강제): edited=true 면 보존(unchanged)", () => {
    expect(
      recalcChild({
        subType: "warehouse_to_dept",
        parentQty: 3,
        child: { origin: "bom_auto", bom_expected: 2, included: true, edited: true },
        childAvail: 100,
      }),
    ).toBe("unchanged");
  });

  it("warehouse_to_dept(미강제): edited=false → 재계산", () => {
    expect(
      recalcChild({
        subType: "warehouse_to_dept",
        parentQty: 4,
        child: { origin: "bom_auto", bom_expected: 1.5, included: true, edited: false },
        childAvail: 100,
      }),
    ).toEqual({ quantity: 6, shortage: 0, edited: false });
  });

  it("재고 부족 → shortage 계산", () => {
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 10,
        child: { origin: "bom_auto", bom_expected: 2, included: true, edited: false },
        childAvail: 15,
      }),
    ).toEqual({ quantity: 20, shortage: 5, edited: false });
  });

  it("included=false → shortage=0", () => {
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 10,
        child: { origin: "bom_auto", bom_expected: 2, included: false, edited: false },
        childAvail: 1,
      }),
    ).toEqual({ quantity: 20, shortage: 0, edited: false });
  });

  it("childAvail=null → shortage=0", () => {
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 5,
        child: { origin: "bom_auto", bom_expected: 2, included: true, edited: false },
        childAvail: null,
      }),
    ).toEqual({ quantity: 10, shortage: 0, edited: false });
  });

  it("bom_expected null/0 → unchanged", () => {
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 5,
        child: { origin: "bom_auto", bom_expected: null, included: true, edited: false },
        childAvail: 100,
      }),
    ).toBe("unchanged");
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 5,
        child: { origin: "bom_auto", bom_expected: 0, included: true, edited: false },
        childAvail: 100,
      }),
    ).toBe("unchanged");
  });

  it("origin!=bom_auto → unchanged", () => {
    expect(
      recalcChild({
        subType: "produce",
        parentQty: 5,
        child: { origin: "manual", bom_expected: 2, included: true, edited: false },
        childAvail: 100,
      }),
    ).toBe("unchanged");
  });
});

// ── (F) 비-direct 라인 단순 수량 변경 시 edited 산정 (IoComposeView.tsx:823-827) ──
function nonDirectEditedFlag(
  line: Pick<IoLine, "bom_expected" | "origin" | "edited">,
  quantity: number,
): boolean {
  return line.bom_expected !== null
    ? Math.abs(quantity - line.bom_expected) > 0.0001
    : line.origin === "manual" || line.edited;
}

describe("[인라인 골든] 비-direct 수량변경 edited 산정", () => {
  it("bom_expected 있고 수량이 expected 와 같음 → edited=false", () => {
    expect(nonDirectEditedFlag({ bom_expected: 5, origin: "bom_auto", edited: false }, 5)).toBe(false);
  });
  it("bom_expected 있고 수량이 다름 → edited=true", () => {
    expect(nonDirectEditedFlag({ bom_expected: 5, origin: "bom_auto", edited: false }, 7)).toBe(true);
  });
  it("bom_expected null + origin=manual → edited=true", () => {
    expect(nonDirectEditedFlag({ bom_expected: null, origin: "manual", edited: false }, 3)).toBe(true);
  });
  it("bom_expected null + 기존 edited 유지", () => {
    expect(nonDirectEditedFlag({ bom_expected: null, origin: "direct", edited: true }, 3)).toBe(true);
    expect(nonDirectEditedFlag({ bom_expected: null, origin: "direct", edited: false }, 3)).toBe(false);
  });
  it("미세 오차 0.0001 이내 → edited=false", () => {
    expect(nonDirectEditedFlag({ bom_expected: 5, origin: "bom_auto", edited: false }, 5.00005)).toBe(false);
  });
});

// ── (G) toggle 시 자식 동기화 대상 판정 (IoComposeView.tsx:754-759) ──
function shouldSyncOnToggle(
  isParentToggle: boolean,
  line: Pick<IoLine, "line_id" | "origin" | "bom_expected">,
  toggledLineId: string,
): boolean {
  return (
    line.line_id === toggledLineId ||
    (isParentToggle &&
      line.origin === "bom_auto" &&
      line.bom_expected != null &&
      Number(line.bom_expected) > 0)
  );
}

describe("[인라인 골든] toggle 동기화 대상 판정", () => {
  it("토글된 라인 자신 → 항상 sync", () => {
    expect(shouldSyncOnToggle(false, { line_id: "X", origin: "manual", bom_expected: null }, "X")).toBe(true);
  });
  it("부모 토글 + bom_auto + bom_expected>0 → sync", () => {
    expect(shouldSyncOnToggle(true, { line_id: "Y", origin: "bom_auto", bom_expected: 2 }, "X")).toBe(true);
  });
  it("부모 토글 아님 + 다른 라인 → no sync", () => {
    expect(shouldSyncOnToggle(false, { line_id: "Y", origin: "bom_auto", bom_expected: 2 }, "X")).toBe(false);
  });
  it("부모 토글이지만 bom_expected null/0 → no sync", () => {
    expect(shouldSyncOnToggle(true, { line_id: "Y", origin: "bom_auto", bom_expected: null }, "X")).toBe(false);
    expect(shouldSyncOnToggle(true, { line_id: "Y", origin: "bom_auto", bom_expected: 0 }, "X")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// bomSync.ts 통합 골든 — 추출 함수가 bundle 단위로 원본과 동일 동작
// (위 (E)(F)(G) 인라인 알고리즘과 동일 결과여야 패리티 보장)
// ══════════════════════════════════════════════════════════════════

// 단순 가용재고 stub — 라인별 고정 가용량.
const availMap = (m: Record<string, number | null>) => (line: IoLine) =>
  line.line_id in m ? m[line.line_id] : null;

describe("[bomSync] applyToggleLine", () => {
  it("부모(direct) 토글 → 활성 bom_auto 자식도 함께 토글 + exclusion_note", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        lines: [
          makeLine({ line_id: "P", origin: "direct", included: true }),
          makeLine({ line_id: "C", origin: "bom_auto", bom_expected: 2, included: true, quantity: 4 }),
          makeLine({ line_id: "M", origin: "manual", included: true }),
        ],
      }),
    ];
    const next = applyToggleLine(bundles, "B", "P", "disassemble", availMap({ C: 1 }));
    const [p, c, mm] = next[0].lines;
    expect(p.included).toBe(false);
    expect(p.exclusion_note).toBe("이번 작업 제외");
    expect(c.included).toBe(false); // 부모 토글로 자식 동기화
    expect(c.shortage).toBe(0);
    expect(c.exclusion_note).toBe("회수 안 됨"); // disassemble + bom_auto
    expect(mm.included).toBe(true); // manual 은 동기화 안 됨
  });

  it("자식 단독 토글(다시 포함) → shortage 재계산", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        lines: [makeLine({ line_id: "C", origin: "bom_auto", bom_expected: 2, included: false, quantity: 10 })],
      }),
    ];
    const next = applyToggleLine(bundles, "B", "C", "produce", availMap({ C: 7 }));
    const c = next[0].lines[0];
    expect(c.included).toBe(true);
    expect(c.shortage).toBe(3); // max(0, 10 - 7)
    expect(c.exclusion_note).toBeNull();
  });

  it("대상 번들/라인 없음 → 원본 그대로", () => {
    const bundles = [makeBundle({ bundle_id: "B", lines: [makeLine({ line_id: "L1" })] })];
    expect(applyToggleLine(bundles, "ZZ", "L1", "produce", availMap({}))).toEqual(bundles);
    expect(applyToggleLine(bundles, "B", "ZZ", "produce", availMap({}))).toEqual(bundles);
  });
});

describe("[bomSync] applyLineQuantityChange", () => {
  it("상위(direct) 변경 → produce(forced) 자식 강제 비례 재계산", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        lines: [
          makeLine({ line_id: "P", origin: "direct", quantity: 1 }),
          makeLine({ line_id: "C", origin: "bom_auto", bom_expected: 3, included: true, edited: true, quantity: 3 }),
        ],
      }),
    ];
    const next = applyLineQuantityChange(bundles, "B", "P", 5, 0, "produce", availMap({ C: 100 }));
    const [p, c] = next[0].lines;
    expect(p.quantity).toBe(5);
    expect(p.edited).toBe(false);
    expect(c.quantity).toBe(15); // 5 * 3, forced 이므로 edited 무시
    expect(c.shortage).toBe(0);
    expect(c.edited).toBe(false);
  });

  it("상위 변경 → warehouse_to_dept(미강제) edited 자식 보존", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        lines: [
          makeLine({ line_id: "P", origin: "direct", quantity: 1 }),
          makeLine({ line_id: "C", origin: "bom_auto", bom_expected: 3, included: true, edited: true, quantity: 99 }),
        ],
      }),
    ];
    const next = applyLineQuantityChange(bundles, "B", "P", 5, 0, "warehouse_to_dept", availMap({ C: 100 }));
    expect(next[0].lines[1].quantity).toBe(99); // edited 보존
  });

  it("비-direct(단품) 변경 → 단순 갱신 + edited 산정", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        lines: [makeLine({ line_id: "S", origin: "bom_auto", bom_expected: 5, quantity: 5, edited: false })],
      }),
    ];
    const next = applyLineQuantityChange(bundles, "B", "S", 8, 1, "warehouse_to_dept", availMap({}));
    const s = next[0].lines[0];
    expect(s.quantity).toBe(8);
    expect(s.shortage).toBe(1);
    expect(s.edited).toBe(true); // 8 != bom_expected 5
  });
});

describe("[bomSync] applyBundleQuantityChange", () => {
  it("기준수량 변경 → 미편집 bom_auto 자식 per-unit 비례", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        quantity: 1,
        lines: [
          makeLine({ line_id: "C1", origin: "bom_auto", bom_expected: 2, included: true, edited: false }),
          makeLine({ line_id: "C2", origin: "bom_auto", bom_expected: 4, included: true, edited: true }),
          makeLine({ line_id: "M", origin: "manual", quantity: 7 }),
        ],
      }),
    ];
    const next = applyBundleQuantityChange(bundles, "B", 3, "warehouse_to_dept", availMap({ C1: 100 }));
    const b = next[0];
    expect(b.quantity).toBe(3);
    expect(b.lines[0].quantity).toBe(6); // 3 * 2 (미편집 → 재계산)
    expect(b.lines[0].shortage).toBe(0);
    expect(b.lines[1].quantity).toBe(10); // edited → 미강제이므로 원본 보존
    expect(b.lines[2].quantity).toBe(7); // manual 보존
  });

  it("forced(produce) → edited 자식도 강제 재계산", () => {
    const bundles = [
      makeBundle({
        bundle_id: "B",
        lines: [makeLine({ line_id: "C", origin: "bom_auto", bom_expected: 2, included: true, edited: true })],
      }),
    ];
    const next = applyBundleQuantityChange(bundles, "B", 5, "produce", availMap({ C: 3 }));
    const c = next[0].lines[0];
    expect(c.quantity).toBe(10); // 5 * 2 강제
    expect(c.shortage).toBe(7); // max(0, 10 - 3)
    expect(c.edited).toBe(false);
  });
});
