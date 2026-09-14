import { describe, expect, it } from "vitest";
import {
  isDepartmentApprover,
  isWarehouseStaff,
  workTypesForOperator,
} from "../_constants";
import type { Department } from "@/lib/api";

type Operator = NonNullable<Parameters<typeof workTypesForOperator>[0]>;

const operator = (over: Partial<Operator> = {}): Operator => ({
  warehouse_role: "none",
  department: "조립" as Department,
  ...over,
});

describe("warehouse step permission helpers", () => {
  it("detects warehouse staff by warehouse role", () => {
    expect(isWarehouseStaff(operator({ warehouse_role: "primary" }))).toBe(true);
    expect(isWarehouseStaff(operator({ warehouse_role: "deputy" }))).toBe(true);
    expect(isWarehouseStaff(operator())).toBe(false);
  });

  it("detects department approvers by level or department role", () => {
    expect(isDepartmentApprover(operator({ level: "admin" }))).toBe(true);
    expect(isDepartmentApprover(operator({ department_role: "primary" }))).toBe(true);
    expect(isDepartmentApprover(operator())).toBe(false);
  });

  it("returns work types from role and department, not legacy io_enabled", () => {
    expect(workTypesForOperator(operator({ warehouse_role: "primary" }))).toEqual([
      "raw-io",
      "warehouse-io",
      "dept-adjustment",
      "defective-register",
    ]);
    expect(workTypesForOperator(operator({ department: "기타" as Department }))).toEqual([]);
  });
});
