/**
 * W11 — canEnterIO 단위 테스트.
 *
 * 부서 io_enabled (DB 기반) 우선 + PROD_DEPTS legacy fallback 동작 검증.
 */
import { describe, it, expect } from "vitest";
import { canEnterIO } from "../_constants";
import type { Department } from "@/lib/api";

type Operator = NonNullable<Parameters<typeof canEnterIO>[0]>;

const warehousePrimary: Operator = {
  warehouse_role: "primary",
  department: "기타" as Department, // 창고 직원은 department 무관
};

const warehouseDeputy: Operator = {
  warehouse_role: "deputy",
  department: "기타" as Department,
};

const tubeWorker: Operator = {
  warehouse_role: "none",
  department: "튜브",
};

// PROD_DEPTS 미포함 부서를 대표하는 mock (실제 Department union 외)
const ceoOperator: Operator = {
  warehouse_role: "none",
  department: "대표이사" as Department,
};

const designOperator: Operator = {
  warehouse_role: "none",
  department: "설계" as Department,
};

describe("canEnterIO", () => {
  it("operator 가 null 이면 false", () => {
    expect(canEnterIO(null)).toBe(false);
    expect(canEnterIO(undefined)).toBe(false);
  });

  it("창고 정직원/부직원은 io_enabled 무관하게 항상 true", () => {
    const map = new Map([
      ["창고", { io_enabled: false }],
    ]);
    expect(canEnterIO(warehousePrimary, map)).toBe(true);
    expect(canEnterIO(warehouseDeputy, map)).toBe(true);
  });

  it("부서 직원 + departmentsMap.io_enabled=true → true", () => {
    const map = new Map([["튜브", { io_enabled: true }]]);
    expect(canEnterIO(tubeWorker, map)).toBe(true);
  });

  it("부서 직원 + departmentsMap.io_enabled=false → false", () => {
    const map = new Map([["튜브", { io_enabled: false }]]);
    expect(canEnterIO(tubeWorker, map)).toBe(false);
  });

  it("departmentsMap 미전달 + PROD_DEPTS 포함 부서 → true (legacy fallback)", () => {
    expect(canEnterIO(tubeWorker)).toBe(true);
  });

  it("departmentsMap 미전달 + PROD_DEPTS 미포함 부서 → false (legacy fallback)", () => {
    expect(canEnterIO(ceoOperator)).toBe(false);
    expect(canEnterIO(designOperator)).toBe(false);
  });

  it("departmentsMap 전달 + 항목 누락 시 PROD_DEPTS fallback 동작", () => {
    const map = new Map([["조립", { io_enabled: true }]]);
    // 튜브가 map 에 없음 → legacy PROD_DEPTS 포함 → true
    expect(canEnterIO(tubeWorker, map)).toBe(true);
    // 설계가 map 에 없음 → legacy PROD_DEPTS 미포함 → false
    expect(canEnterIO(designOperator, map)).toBe(false);
  });

  it("departmentsMap.io_enabled 가 undefined 면 PROD_DEPTS fallback", () => {
    const map = new Map([["설계", {}]]);
    expect(canEnterIO(designOperator, map)).toBe(false);
    const map2 = new Map([["튜브", {}]]);
    expect(canEnterIO(tubeWorker, map2)).toBe(true);
  });

  it("DB io_enabled=false 가 PROD_DEPTS 보다 우선 (튜브 부서를 차단할 수 있음)", () => {
    const map = new Map([["튜브", { io_enabled: false }]]);
    expect(canEnterIO(tubeWorker, map)).toBe(false);
  });

  it("DB io_enabled=true 가 PROD_DEPTS 미포함 부서도 허용 가능 (예: 신규 부서)", () => {
    const map = new Map([["설계", { io_enabled: true }]]);
    expect(canEnterIO(designOperator, map)).toBe(true);
  });

  // ──────────────── W12-#7: 직원 io_enabled 와 AND 결합 ────────────────

  it("직원 io_enabled=false 면 부서가 허용이어도 차단", () => {
    const map = new Map([["튜브", { io_enabled: true }]]);
    const blockedTubeWorker: Operator = {
      ...tubeWorker,
      io_enabled: false,
    };
    expect(canEnterIO(blockedTubeWorker, map)).toBe(false);
  });

  it("직원 io_enabled=false 는 창고 직원도 차단 (관리자 강제 비활성)", () => {
    const map = new Map([["창고", { io_enabled: true }]]);
    const blockedWh: Operator = { ...warehousePrimary, io_enabled: false };
    expect(canEnterIO(blockedWh, map)).toBe(false);
  });

  it("직원 io_enabled=true + 부서 io_enabled=true → true", () => {
    const map = new Map([["튜브", { io_enabled: true }]]);
    expect(canEnterIO({ ...tubeWorker, io_enabled: true }, map)).toBe(true);
  });

  it("직원 io_enabled=true + 부서 io_enabled=false → false (부서 차단 우선)", () => {
    const map = new Map([["튜브", { io_enabled: false }]]);
    expect(canEnterIO({ ...tubeWorker, io_enabled: true }, map)).toBe(false);
  });

  it("직원 io_enabled 미정의(undefined) 는 기존 동작 유지", () => {
    const map = new Map([["튜브", { io_enabled: true }]]);
    expect(canEnterIO(tubeWorker, map)).toBe(true);
  });
});
