/**
 * 현재 로그인된 작업자 정보를 localStorage에서 관리하는 훅.
 *
 * 작업자 식별용 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useEffect, useState } from "react";
import type { Department, DepartmentRole, EmployeeLevel, WarehouseRole } from "@/lib/api";

export interface Operator {
  employee_id: string;
  name: string;
  department: Department;
  level: EmployeeLevel;
  employee_code: string;
  /** 창고 결재 역할 — 기존 데이터 호환을 위해 누락 시 "none" 폴백. */
  warehouse_role: WarehouseRole;
  /** 부서 결재 역할 — 낱개(manual/adjust) IO 결재 권한. 누락 시 "none". */
  department_role: DepartmentRole;
  /** 개인별 테마 설정 (light | dark | null). 누락 시 null. */
  theme?: string | null;
  /** 조립 부서 직원의 담당 모델 slot 목록 (priority 순서). 누락 시 []. */
  assigned_model_slots: number[];
  /** 입출고 화면 접근 권한. 누락 시 true (기존 세션 호환). */
  io_enabled: boolean;
  /** 직원별 좌측 사이드바/모바일 탭 숨김 목록. 누락 시 [] (기존 세션 호환). */
  hidden_sidebar_tabs: string[];
  loginPopupEnabled: boolean;
}

const OPERATOR_KEY = "dexcowin_mes_operator";
const BOOT_KEY = "dexcowin_mes_boot_id";
const LOGIN_NOTIFICATION_POPUP_PENDING_KEY = "dexcowin_mes_login_popup_pending";
// 같은 탭에서 setCurrentOperator 가 호출되면 useCurrentOperator 구독자들을 깨우기 위한 이벤트.
// localStorage `storage` 이벤트는 다른 탭에만 발화하므로 별도 CustomEvent 필요.
const OPERATOR_CHANGE_EVENT = "dexcowin_operator_change";

function readOperator(): Operator | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OPERATOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Operator> & {
      warehouse_role?: string | null;
      department_role?: string | null;
      assigned_model_slots?: unknown;
      hidden_sidebar_tabs?: unknown;
      loginPopupEnabled?: unknown;
    };
    if (!parsed.employee_id || !parsed.name) return null;
    const wh = (parsed.warehouse_role ?? "none").toLowerCase();
    const dept = (parsed.department_role ?? "none").toLowerCase();
    const slotsRaw = parsed.assigned_model_slots;
    const slots = Array.isArray(slotsRaw)
      ? slotsRaw.filter((s): s is number => typeof s === "number" && Number.isInteger(s))
      : [];
    const hiddenRaw = parsed.hidden_sidebar_tabs;
    const hiddenTabs = Array.isArray(hiddenRaw)
      ? hiddenRaw.filter((tab): tab is string => typeof tab === "string")
      : [];
    return {
      employee_id: parsed.employee_id,
      name: parsed.name,
      department: parsed.department as Department,
      level: parsed.level as EmployeeLevel,
      employee_code: parsed.employee_code as string,
      warehouse_role: (wh === "primary" || wh === "deputy" ? wh : "none") as WarehouseRole,
      department_role: (dept === "primary" || dept === "deputy" ? dept : "none") as DepartmentRole,
      theme: parsed.theme ?? null,
      assigned_model_slots: slots,
      io_enabled: parsed.io_enabled ?? true,
      hidden_sidebar_tabs: hiddenTabs,
      loginPopupEnabled: parsed.loginPopupEnabled !== false,
    };
  } catch {
    return null;
  }
}

/** localStorage에서 현재 작업자를 동기 읽기. SSR-safe (서버에서는 null). */
export function readCurrentOperator(): Operator | null {
  return readOperator();
}

export function getStoredBootId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(BOOT_KEY);
}

export function setCurrentOperator(op: Operator, bootId?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OPERATOR_KEY, JSON.stringify(op));
  if (bootId) window.localStorage.setItem(BOOT_KEY, bootId);
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

export function clearCurrentOperator(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OPERATOR_KEY);
  window.localStorage.removeItem(BOOT_KEY);
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

export function markLoginNotificationPopupPending(employeeId: string): void {
  if (typeof window === "undefined" || !employeeId) return;
  window.sessionStorage.setItem(LOGIN_NOTIFICATION_POPUP_PENDING_KEY, employeeId);
}

export function consumeLoginNotificationPopupPending(employeeId: string): boolean {
  if (typeof window === "undefined" || !employeeId) return false;
  const pendingEmployeeId = window.sessionStorage.getItem(LOGIN_NOTIFICATION_POPUP_PENDING_KEY);
  if (pendingEmployeeId !== employeeId) return false;
  window.sessionStorage.removeItem(LOGIN_NOTIFICATION_POPUP_PENDING_KEY);
  return true;
}
export function useCurrentOperator(): Operator | null {
  const [operator, setOperator] = useState<Operator | null>(null);

  useEffect(() => {
    setOperator(readOperator());
    const onChange = () => setOperator(readOperator());
    window.addEventListener(OPERATOR_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(OPERATOR_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return operator;
}

/** produced_by 필드에 사용되는 포맷: "이름(부서)" */
export function operatorProducedBy(op: Operator): string {
  return `${op.name}(${op.department})`;
}
