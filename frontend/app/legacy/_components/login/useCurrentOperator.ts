/**
 * 현재 로그인된 작업자 정보를 localStorage에서 관리하는 훅.
 *
 * 작업자 식별용 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useEffect, useState } from "react";
import type { Department, EmployeeLevel, WarehouseRole } from "@/lib/api";

export interface Operator {
  employee_id: string;
  name: string;
  department: Department;
  level: EmployeeLevel;
  employee_code: string;
  /** 창고 결재 역할 — 기존 데이터 호환을 위해 누락 시 "none" 폴백. */
  warehouse_role: WarehouseRole;
}

const OPERATOR_KEY = "dexcowin_erp_operator";

function readOperator(): Operator | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OPERATOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Operator> & {
      warehouse_role?: string | null;
    };
    if (!parsed.employee_id || !parsed.name) return null;
    const wh = (parsed.warehouse_role ?? "none").toLowerCase();
    return {
      employee_id: parsed.employee_id,
      name: parsed.name,
      department: parsed.department as Department,
      level: parsed.level as EmployeeLevel,
      employee_code: parsed.employee_code as string,
      warehouse_role: (wh === "primary" || wh === "deputy" ? wh : "none") as WarehouseRole,
    };
  } catch {
    return null;
  }
}

/** localStorage에서 현재 작업자를 동기 읽기. SSR-safe (서버에서는 null). */
export function readCurrentOperator(): Operator | null {
  return readOperator();
}

export function setCurrentOperator(op: Operator): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPERATOR_KEY, JSON.stringify(op));
}

export function clearCurrentOperator(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OPERATOR_KEY);
}

export function useCurrentOperator(): Operator | null {
  const [operator, setOperator] = useState<Operator | null>(null);

  useEffect(() => {
    setOperator(readOperator());
  }, []);

  return operator;
}

/** produced_by 필드에 사용되는 포맷: "이름(부서)" */
export function operatorProducedBy(op: Operator): string {
  return `${op.name}(${op.department})`;
}
