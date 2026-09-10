import { describe, expect, it } from "vitest";
import {
  canApproveDepartmentRequests,
  defectDefaultSource,
  isDepartmentApprover,
  isWarehouseStaff,
  workTypesForOperator,
} from "../_constants";
import roleMatrix from "../../../../../../backend/tests/fixtures/department_approval_role_matrix.json";
import type { Department, DepartmentRole, EmployeeLevel, WarehouseRole } from "@/lib/api";

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

  it.each(roleMatrix)("matches the backend queue role matrix: $name", (row) => {
    const actual = operator({
      level: row.level as EmployeeLevel,
      warehouse_role: row.warehouse_role as WarehouseRole,
      department_role: row.department_role as DepartmentRole,
    });

    expect(canApproveDepartmentRequests(actual)).toBe(row.can_see_department_queue);
    expect(isWarehouseStaff(actual)).toBe(row.can_see_warehouse_queue);
    expect(defectDefaultSource(actual)).toBe(row.defect_default_source);
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
