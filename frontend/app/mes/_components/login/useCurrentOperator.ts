/**
 * 서버가 검증한 현재 작업자 프로필의 화면 표시용 sessionStorage cache.
 * 권한 정본은 HttpOnly cookie와 GET /api/operator-session이며 이 cache를 mutation
 * 행위자 인증에 사용하지 않는다.
 */

import { useEffect, useState } from "react";
import type { Department, DepartmentRole, Employee, EmployeeLevel, WarehouseRole } from "@/lib/api";
import { operatorSessionApi } from "@/lib/api/operator-session";
import {
  ApiError,
  advanceAuthGeneration,
  establishAuthRequiredBoundary,
} from "@/lib/api-core";
import { sendClientEvent } from "@/lib/client-events";
import { clearAuditSession, startAuditSession } from "@/lib/activity-audit-context";
import { getClientEventSource } from "@/lib/operator-log-context";
import { normalizeSidebarMode, type SidebarMode } from "@/lib/sidebar-mode";

export interface Operator {
  employee_id: string;
  name: string;
  role: string;
  department: Department;
  level: EmployeeLevel;
  employee_code: string;
  /** 창고 결재 역할 — 기존 데이터 호환을 위해 누락 시 "none" 폴백. */
  warehouse_role: WarehouseRole;
  /** 부서 결재 역할 — 낱개(manual/adjust) IO 결재 권한. 누락 시 "none". */
  department_role: DepartmentRole;
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

type OperatorSource = Partial<Operator> & Partial<Employee>;

function normalizeOperator(source: OperatorSource): Operator {
  const warehouseRole = (source.warehouse_role ?? "none").toLowerCase();
  const departmentRole = (source.department_role ?? "none").toLowerCase();
  const slots = source.assigned_model_slots;
  const hiddenTabs = source.hidden_sidebar_tabs;
  return {
    employee_id: source.employee_id as string,
    name: source.name as string,
    role: typeof source.role === "string" ? source.role : "",
    department: source.department as Department,
    level: source.level as EmployeeLevel,
    employee_code: source.employee_code as string,
    warehouse_role: (
      warehouseRole === "primary" || warehouseRole === "deputy" ? warehouseRole : "none"
    ) as WarehouseRole,
    department_role: (
      departmentRole === "primary" || departmentRole === "deputy" ? departmentRole : "none"
    ) as DepartmentRole,
    theme: source.theme ?? null,
    sidebar_mode: normalizeSidebarMode(source.sidebar_mode) ?? "hover",
    assigned_model_slots: Array.isArray(slots)
      ? slots.filter((slot): slot is number => typeof slot === "number" && Number.isInteger(slot))
      : [],
    io_enabled: source.io_enabled ?? true,
    hidden_sidebar_tabs: Array.isArray(hiddenTabs)
      ? hiddenTabs.filter((tab): tab is string => typeof tab === "string")
      : [],
    loginPopupEnabled:
      source.loginPopupEnabled !== false && source.login_notification_popup_enabled !== false,
  };
}

/** 서버 응답의 검증된 직원 프로필을 화면 전용 cache 모양으로 변환한다. */
export function operatorFromEmployee(employee: Employee): Operator {
  return normalizeOperator(employee);
}

const OPERATOR_KEY = "dexcowin_mes_operator";
const BOOT_KEY = "dexcowin_mes_boot_id";
const LOGIN_NOTIFICATION_POPUP_PENDING_KEY = "dexcowin_mes_login_popup_pending";
export const OPERATOR_LOGOUT_PENDING_KEY = "dexcowin_mes_logout_pending";
export const OPERATOR_LOGOUT_PENDING_EVENT = "dexcowin_operator_logout_pending";
// 같은 탭에서 setCurrentOperator 가 호출되면 useCurrentOperator 구독자들을 깨우기 위한 이벤트.
// storage 이벤트는 변경을 일으킨 탭에 발화하지 않으므로 별도 CustomEvent가 필요하다.
const OPERATOR_CHANGE_EVENT = "dexcowin_operator_change";

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
    const parsed = JSON.parse(raw) as OperatorSource;
    if (!parsed.employee_id || !parsed.name) return null;
    return normalizeOperator(parsed);
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
  restoreCurrentOperator(op, bootId);
  sendClientEvent({ event: "ui_login", source: getClientEventSource() });
}

/** 서버가 검증해 돌려준 프로필을 화면 cache에 복원한다. 로그인 감사 이벤트는 만들지 않는다. */
export function restoreCurrentOperator(op: Operator, bootId?: string): void {
  if (typeof window === "undefined") return;
  clearLegacyPersistentOperator();
  window.sessionStorage.setItem(OPERATOR_KEY, JSON.stringify(op));
  if (bootId) window.sessionStorage.setItem(BOOT_KEY, bootId);
  if (bootId) advanceAuthGeneration();
  startAuditSession();
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

/** Updates UI preferences without creating another login audit event. */
export function updateCurrentOperatorPreferences(patch: {
  theme?: Operator["theme"];
  sidebar_mode?: SidebarMode;
  loginPopupEnabled?: boolean;
}): void {
  if (typeof window === "undefined") return;
  const operator = readOperator();
  if (!operator) return;
  window.sessionStorage.setItem(OPERATOR_KEY, JSON.stringify({ ...operator, ...patch }));
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

export function clearCurrentOperator(): void {
  if (typeof window === "undefined") return;
  clearAuditSession();
  window.sessionStorage.removeItem(OPERATOR_KEY);
  window.sessionStorage.removeItem(BOOT_KEY);
  window.sessionStorage.removeItem(LOGIN_NOTIFICATION_POPUP_PENDING_KEY);
  clearLegacyPersistentOperator();
  window.dispatchEvent(new CustomEvent(OPERATOR_CHANGE_EVENT));
}

/** 서버가 세션을 이미 폐기한 경우 로컬 cache를 지우고 로그인 게이트로 복귀한다. */
export function returnToOperatorLogin(): void {
  if (typeof window === "undefined") return;
  clearCurrentOperator();
  establishAuthRequiredBoundary();
}

interface PendingOperatorLogout {
  state: "pending" | "failed";
  employee_code: string;
}

function readPendingOperatorLogout(): PendingOperatorLogout | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(OPERATOR_LOGOUT_PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOperatorLogout>;
    if (
      (parsed.state === "pending" || parsed.state === "failed")
      && typeof parsed.employee_code === "string"
      && parsed.employee_code.length > 0
    ) {
      return { state: parsed.state, employee_code: parsed.employee_code };
    }
  } catch {
    // malformed marker는 claimless DELETE로 완화하지 않고 로그인 차단 상태로 남긴다.
  }
  return null;
}

function setPendingOperatorLogout(
  state: "pending" | "failed" | null,
  employeeCode?: string,
): void {
  if (typeof window === "undefined") return;
  if (state === null) {
    window.localStorage.removeItem(OPERATOR_LOGOUT_PENDING_KEY);
  } else {
    window.localStorage.setItem(
      OPERATOR_LOGOUT_PENDING_KEY,
      JSON.stringify({ state, employee_code: employeeCode ?? "" }),
    );
  }
  window.dispatchEvent(new CustomEvent(OPERATOR_LOGOUT_PENDING_EVENT));
}

export function hasPendingOperatorLogout(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OPERATOR_LOGOUT_PENDING_KEY) !== null;
}

function isActorMismatch(error: unknown): boolean {
  return error instanceof ApiError
    && error.status === 403
    && error.code === "ACTOR_MISMATCH";
}

async function revokePendingOperatorSession(employeeCode: string): Promise<void> {
  try {
    await operatorSessionApi.deleteOperatorSession(employeeCode);
  } catch (error) {
    if (!isActorMismatch(error)) {
      setPendingOperatorLogout("failed", employeeCode);
      throw error;
    }
  }
  setPendingOperatorLogout(null);
}

/** restore/login 전에 남은 서버 capability 폐기를 먼저 확정한다. */
export async function retryPendingOperatorLogout(): Promise<void> {
  if (!hasPendingOperatorLogout()) return;
  const pending = readPendingOperatorLogout();
  if (!pending) {
    throw new Error("로그아웃 재시도 대상 작업자를 확인할 수 없습니다.");
  }
  setPendingOperatorLogout("pending", pending.employee_code);
  await revokePendingOperatorSession(pending.employee_code);
}

/** 민감 UI는 즉시 잠그되 서버 폐기 성공 전에는 로그아웃 완료로 간주하지 않는다. */
export async function logoutCurrentOperator(): Promise<void> {
  if (typeof window === "undefined") return;
  const employeeCode = readCurrentOperator()?.employee_code;
  sendClientEvent({ event: "ui_logout", source: getClientEventSource() });
  setPendingOperatorLogout("pending", employeeCode);
  if (!employeeCode) {
    setPendingOperatorLogout("failed");
    returnToOperatorLogin();
    return;
  }
  const revokeSession = revokePendingOperatorSession(employeeCode);
  returnToOperatorLogin();
  await revokeSession.catch(() => undefined);
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
