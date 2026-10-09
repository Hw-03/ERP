/**
 * 현재 로그인된 작업자 정보를 sessionStorage에서 관리하는 훅.
 *
 * 작업자 식별용 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useEffect, useState } from "react";
import type { Employee } from "@/lib/api/types/employees";
import type { Department, DepartmentRole, WarehouseRole } from "@/lib/api";
import { sendClientEvent } from "@/lib/client-events";
import { clearAuditSession, startAuditSession } from "@/lib/activity-audit-context";
import { getClientEventSource } from "@/lib/operator-log-context";
import { normalizeSidebarMode, type SidebarMode } from "@/lib/sidebar-mode";
import { OPERATOR_ACTIVITY_KEY, writeOperatorActivity } from "./operatorActivity";

export interface Operator {
  employee_id: string;
  name: string;
  role: string;
  department: Department;
  employee_code: string;
  /** 창고 결재 역할 — 기존 데이터 호환을 위해 누락 시 "none" 폴백. */
  warehouse_role: WarehouseRole;
  /** 부서 결재 역할 — 낱개(manual/adjust) IO 결재 권한. 누락 시 "none". */
  department_role: DepartmentRole;
  /** AS·연구 사용출고 승인함 접근 권한. 누락 시 false. */
  as_research_approver: boolean;
  /** 개인별 테마 설정 (light | dark | null). 누락 시 null. */
  theme?: string | null;
  /** 데스크톱 사이드바 표시 방식. 누락되거나 잘못된 값은 읽을 때 hover로 정규화. */
  sidebar_mode?: SidebarMode;
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
// storage 이벤트는 변경을 일으킨 탭에 발화하지 않으므로 별도 CustomEvent가 필요하다.
export const OPERATOR_CHANGE_EVENT = "dexcowin_operator_change";

function clearLegacyPersistentOperator(): void {
  window.localStorage.removeItem(OPERATOR_KEY);
  window.localStorage.removeItem(BOOT_KEY);
}

function readOperator(): Operator | null {
  if (typeof window === "undefined") return null;
  try {
    clearLegacyPersistentOperator();
    const raw = window.sessionStorage.getItem(OPERATOR_KEY);
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
      role: typeof parsed.role === "string" ? parsed.role : "",
      department: parsed.department as Department,
      employee_code: parsed.employee_code as string,
      warehouse_role: (wh === "primary" || wh === "deputy" ? wh : "none") as WarehouseRole,
      department_role: (dept === "primary" || dept === "deputy" ? dept : "none") as DepartmentRole,
      as_research_approver: parsed.as_research_approver === true,
      theme: parsed.theme ?? null,
      sidebar_mode: normalizeSidebarMode(parsed.sidebar_mode) ?? "hover",
      assigned_model_slots: slots,
      io_enabled: parsed.io_enabled ?? true,
      hidden_sidebar_tabs: hiddenTabs,
      loginPopupEnabled: parsed.loginPopupEnabled !== false,
    };
  } catch {
    return null;
  }
}

/** sessionStorage에서 현재 작업자를 동기 읽기. SSR-safe (서버에서는 null). */
export function readCurrentOperator(): Operator | null {
  return readOperator();
}

export function getStoredBootId(): string | null {
  if (typeof window === "undefined") return null;
  clearLegacyPersistentOperator();
  return window.sessionStorage.getItem(BOOT_KEY);
}

export function setCurrentOperator(op: Operator, bootId?: string): void {
  if (typeof window === "undefined") return;
  // PIN login supplies bootId; same-employee appearance updates do not.
  if (bootId || readOperator()?.employee_id !== op.employee_id) {
    writeOperatorActivity({ employeeId: op.employee_id, lastActivityAt: Date.now(), confirmationRequired: false });
  }
  clearLegacyPersistentOperator();
  window.sessionStorage.setItem(OPERATOR_KEY, JSON.stringify(op));
  if (bootId) window.sessionStorage.setItem(BOOT_KEY, bootId);
  startAuditSession();
  sendClientEvent({ event: "ui_login", source: getClientEventSource() });
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

/** Updates UI preferences without creating another login audit event. */
export function updateCurrentOperatorPreferences(patch: {
  theme?: "light" | "dark";
  sidebar_mode?: SidebarMode;
  loginPopupEnabled?: boolean;
}, expectedEmployeeId?: string): void {
  if (typeof window === "undefined") return;
  const operator = readOperator();
  if (!operator || (expectedEmployeeId && operator.employee_id !== expectedEmployeeId)) return;
  window.sessionStorage.setItem(OPERATOR_KEY, JSON.stringify({ ...operator, ...patch }));
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

/** Refresh identity and access without restarting login audit or overwriting appearance drafts. */
export function updateCurrentOperatorIdentity(employee: Employee, expectedEmployeeId: string): void {
  const operator = readOperator();
  if (!operator || operator.employee_id !== expectedEmployeeId || employee.employee_id !== expectedEmployeeId) return;
  const next: Operator = {
    ...operator,
    name: employee.name ?? operator.name,
    role: employee.role ?? operator.role,
    department: employee.department ?? operator.department,
    employee_code: employee.employee_code ?? operator.employee_code,
    warehouse_role: employee.warehouse_role ?? operator.warehouse_role,
    department_role: employee.department_role ?? operator.department_role,
    as_research_approver: employee.as_research_approver ?? operator.as_research_approver,
    assigned_model_slots: employee.assigned_model_slots ?? operator.assigned_model_slots,
    io_enabled: employee.io_enabled ?? operator.io_enabled,
    hidden_sidebar_tabs: employee.hidden_sidebar_tabs ?? operator.hidden_sidebar_tabs,
  };
  window.sessionStorage.setItem(OPERATOR_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

export function clearCurrentOperator(): void {
  if (typeof window === "undefined") return;
  sendClientEvent({ event: "ui_logout", source: getClientEventSource() });
  clearAuditSession();
  window.sessionStorage.removeItem(OPERATOR_KEY);
  window.sessionStorage.removeItem(BOOT_KEY);
  window.sessionStorage.removeItem(LOGIN_NOTIFICATION_POPUP_PENDING_KEY);
  window.sessionStorage.removeItem(OPERATOR_ACTIVITY_KEY);
  clearLegacyPersistentOperator();
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
    const onStorage = (event: StorageEvent) => {
      if (event.key === OPERATOR_KEY && event.storageArea === window.sessionStorage) onChange();
    };
    window.addEventListener(OPERATOR_CHANGE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(OPERATOR_CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return operator;
}

/** produced_by 필드에 사용되는 포맷: "이름(부서)" */
export function operatorProducedBy(op: Operator): string {
  return `${op.name}(${op.department})`;
}
