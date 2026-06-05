/**
 * canEnterIO 단위 테스트.
 * 직원별 io_enabled 만 검사 — 부서 조건 없음.
 */
import { describe, it, expect } from "vitest";
import { canEnterIO } from "../_constants";
import type { Department } from "@/lib/api";

type Operator = NonNullable<Parameters<typeof canEnterIO>[0]>;

const warehousePrimary: Operator = {
  warehouse_role: "primary",
  department: "기타" as Department,
};

const warehouseDeputy: Operator = {
  warehouse_role: "deputy",
  department: "기타" as Department,
};

const tubeWorker: Operator = {
  warehouse_role: "none",
  department: "튜브",
};

const ceoOperator: Operator = {
  warehouse_role: "none",
  department: "대표이사" as Department,
};

describe("canEnterIO", () => {
  it("operator 가 null 이면 false", () => {
    expect(canEnterIO(null)).toBe(false);
    expect(canEnterIO(undefined)).toBe(false);
  });

  it("io_enabled 미정의(undefined) 직원 → true", () => {
    expect(canEnterIO(tubeWorker)).toBe(true);
    expect(canEnterIO(warehousePrimary)).toBe(true);
    expect(canEnterIO(warehouseDeputy)).toBe(true);
    expect(canEnterIO(ceoOperator)).toBe(true);
  });

  it("직원 io_enabled=false → false (부서·직책 무관)", () => {
    expect(canEnterIO({ ...tubeWorker, io_enabled: false })).toBe(false);
    expect(canEnterIO({ ...warehousePrimary, io_enabled: false })).toBe(false);
    expect(canEnterIO({ ...ceoOperator, io_enabled: false })).toBe(false);
  });

  it("직원 io_enabled=true → true", () => {
    expect(canEnterIO({ ...tubeWorker, io_enabled: true })).toBe(true);
    expect(canEnterIO({ ...ceoOperator, io_enabled: true })).toBe(true);
  });
});
