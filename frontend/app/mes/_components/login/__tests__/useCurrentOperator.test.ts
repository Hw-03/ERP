import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCurrentOperator,
  consumeLoginNotificationPopupPending,
  getStoredBootId,
  hasPendingOperatorLogout,
  logoutCurrentOperator,
  markLoginNotificationPopupPending,
  operatorFromEmployee,
  readCurrentOperator,
  restoreCurrentOperator,
  retryPendingOperatorLogout,
  returnToOperatorLogin,
  setCurrentOperator,
  updateCurrentOperatorPreferences,
  type Operator,
} from "../useCurrentOperator";
import { sendClientEvent } from "@/lib/client-events";
import { operatorSessionApi } from "@/lib/api/operator-session";
import { ApiError, captureAuthGeneration } from "@/lib/api-core";
import type { Employee } from "@/lib/api";

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

vi.mock("@/lib/api/operator-session", () => ({
  operatorSessionApi: {
    deleteOperatorSession: vi.fn(),
  },
}));

const baseOperator: Operator = {
  employee_id: "emp-1",
  name: "Tester",
  role: "조립/사원",
  department: "조립",
  level: "staff",
  employee_code: "E1",
  warehouse_role: "none",
  department_role: "none",
  theme: null,
  assigned_model_slots: [],
  io_enabled: true,
  hidden_sidebar_tabs: ["weekly", "admin"],
  loginPopupEnabled: false,
};

describe("useCurrentOperator storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.mocked(sendClientEvent).mockClear();
    vi.mocked(operatorSessionApi.deleteOperatorSession).mockReset();
    vi.mocked(operatorSessionApi.deleteOperatorSession).mockResolvedValue(undefined);
  });

  it("stores the operator and boot ID in tab session storage", () => {
    setCurrentOperator(baseOperator, "boot-1");

    expect(readCurrentOperator()?.hidden_sidebar_tabs).toEqual(["weekly", "admin"]);
    expect(getStoredBootId()).toBe("boot-1");
    expect(window.sessionStorage.getItem("dexcowin_mes_operator")).not.toBeNull();
    expect(window.localStorage.getItem("dexcowin_mes_operator")).toBeNull();
    expect(window.localStorage.getItem("dexcowin_mes_boot_id")).toBeNull();
  });

  it("does not restore an operator after the tab session is cleared", () => {
    setCurrentOperator(baseOperator, "boot-1");
    window.sessionStorage.clear();

    expect(readCurrentOperator()).toBeNull();
    expect(getStoredBootId()).toBeNull();
  });

  it("defaults missing hidden sidebar tabs to an empty list", () => {
    const { hidden_sidebar_tabs: _hidden, ...legacyOperator } = baseOperator;
    window.sessionStorage.setItem("dexcowin_mes_operator", JSON.stringify(legacyOperator));
    expect(readCurrentOperator()?.hidden_sidebar_tabs).toEqual([]);
  });

  it("defaults a missing or invalid sidebar mode to hover", () => {
    window.sessionStorage.setItem("dexcowin_mes_operator", JSON.stringify(baseOperator));
    expect(
      (readCurrentOperator() as unknown as { sidebar_mode: string })?.sidebar_mode,
    ).toBe("hover");

    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ ...baseOperator, sidebar_mode: "floating" }),
    );
    expect(
      (readCurrentOperator() as unknown as { sidebar_mode: string })?.sidebar_mode,
    ).toBe("hover");
  });

  it("updates sidebar and login popup preferences without logging another login", () => {
    setCurrentOperator(baseOperator, "boot-1");
    vi.mocked(sendClientEvent).mockClear();

    updateCurrentOperatorPreferences({ sidebar_mode: "expanded", loginPopupEnabled: true });

    expect(
      (readCurrentOperator() as unknown as { sidebar_mode: string })?.sidebar_mode,
    ).toBe("expanded");
    expect(readCurrentOperator()?.loginPopupEnabled).toBe(true);
    expect(readCurrentOperator()?.name).toBe(baseOperator.name);
    expect(getStoredBootId()).toBe("boot-1");
    expect(sendClientEvent).not.toHaveBeenCalled();
  });

  it("restores the server profile cache without recording another login", () => {
    const previousAuthGeneration = captureAuthGeneration();

    restoreCurrentOperator(baseOperator, "boot-restored");

    expect(readCurrentOperator()).toMatchObject(baseOperator);
    expect(getStoredBootId()).toBe("boot-restored");
    expect(captureAuthGeneration()).toBe(previousAuthGeneration + 1);
    expect(sendClientEvent).not.toHaveBeenCalled();
  });

  it("maps the complete server employee profile into the UI operator cache", () => {
    const employee: Employee = {
      employee_id: "emp-2",
      employee_code: "E2",
      name: "Server Actor",
      role: "조립/사원",
      phone: null,
      department: "조립",
      level: "staff",
      warehouse_role: "primary",
      department_role: "deputy",
      io_enabled: false,
      display_order: 2,
      is_active: true,
      created_at: "2026-08-19T00:00:00Z",
      updated_at: "2026-08-19T00:00:00Z",
      theme: "dark",
      sidebar_mode: "expanded",
      assigned_model_slots: [2, 4],
      hidden_sidebar_tabs: ["weekly"],
      login_notification_popup_enabled: false,
    };

    expect(operatorFromEmployee(employee)).toEqual({
      employee_id: "emp-2",
      employee_code: "E2",
      name: "Server Actor",
      role: "조립/사원",
      department: "조립",
      level: "staff",
      warehouse_role: "primary",
      department_role: "deputy",
      io_enabled: false,
      theme: "dark",
      sidebar_mode: "expanded",
      assigned_model_slots: [2, 4],
      hidden_sidebar_tabs: ["weekly"],
      loginPopupEnabled: false,
    });
  });

  it("defaults missing login notification popup settings to enabled", () => {
    const { loginPopupEnabled: _loginPopupEnabled, ...legacyOperator } = baseOperator;
    window.sessionStorage.setItem("dexcowin_mes_operator", JSON.stringify(legacyOperator));
    expect(readCurrentOperator()?.loginPopupEnabled).toBe(true);
  });

  it("defaults a legacy operator without role to an empty string", () => {
    const { role: _role, ...legacyOperator } = baseOperator;
    window.sessionStorage.setItem("dexcowin_mes_operator", JSON.stringify(legacyOperator));

    expect(readCurrentOperator()?.role).toBe("");
  });

  it("ignores and removes legacy persistent operator storage", () => {
    window.localStorage.setItem("theme", "dark");
    window.localStorage.setItem("dexcowin_mes_operator", JSON.stringify(baseOperator));
    window.localStorage.setItem("dexcowin_mes_boot_id", "legacy-boot");

    expect(readCurrentOperator()).toBeNull();
    expect(getStoredBootId()).toBeNull();
    expect(window.localStorage.getItem("dexcowin_mes_operator")).toBeNull();
    expect(window.localStorage.getItem("dexcowin_mes_boot_id")).toBeNull();
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  it("marks and consumes a pending login notification popup once", () => {
    markLoginNotificationPopupPending("emp-1");

    expect(consumeLoginNotificationPopupPending("emp-2")).toBe(false);
    expect(consumeLoginNotificationPopupPending("emp-1")).toBe(true);
    expect(consumeLoginNotificationPopupPending("emp-1")).toBe(false);
  });

  it("clears tab session, legacy storage, and pending login notification state on logout", () => {
    setCurrentOperator(baseOperator, "boot-1");
    window.localStorage.setItem("dexcowin_mes_operator", JSON.stringify(baseOperator));
    window.localStorage.setItem("dexcowin_mes_boot_id", "legacy-boot");
    markLoginNotificationPopupPending("emp-1");

    clearCurrentOperator();

    expect(window.sessionStorage.getItem("dexcowin_mes_operator")).toBeNull();
    expect(window.sessionStorage.getItem("dexcowin_mes_boot_id")).toBeNull();
    expect(window.localStorage.getItem("dexcowin_mes_operator")).toBeNull();
    expect(window.localStorage.getItem("dexcowin_mes_boot_id")).toBeNull();
    expect(consumeLoginNotificationPopupPending("emp-1")).toBe(false);
  });

  it("stores the operator cache before sending the login event", () => {
    let employeeCodeAtEvent: string | undefined;
    vi.mocked(sendClientEvent).mockImplementationOnce(() => {
      employeeCodeAtEvent = readCurrentOperator()?.employee_code;
    });

    setCurrentOperator(baseOperator);

    expect(employeeCodeAtEvent).toBe("E1");
    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_login",
      source: "desktop",
    });
  });

  it("revokes the server session and clears the cache on logout", async () => {
    setCurrentOperator(baseOperator, "boot-1");
    vi.mocked(sendClientEvent).mockClear();
    const order: string[] = [];
    vi.mocked(sendClientEvent).mockImplementationOnce(() => {
      expect(readCurrentOperator()?.employee_code).toBe("E1");
      order.push("event");
    });
    vi.mocked(operatorSessionApi.deleteOperatorSession).mockImplementationOnce(() => {
      order.push("revoke");
      return Promise.resolve();
    });

    await logoutCurrentOperator();

    expect(order).toEqual(["event", "revoke"]);
    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_logout",
      source: "desktop",
    });
    expect(operatorSessionApi.deleteOperatorSession).toHaveBeenCalledWith("E1");
    expect(readCurrentOperator()).toBeNull();
  });

  it("keeps a persistent revoke marker when server logout fails and clears it after retry", async () => {
    setCurrentOperator(baseOperator, "boot-1");
    vi.mocked(operatorSessionApi.deleteOperatorSession).mockRejectedValue(new Error("offline"));
    const listener = vi.fn();
    window.addEventListener("dexcowin_auth_required", listener);

    await logoutCurrentOperator();

    expect(readCurrentOperator()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasPendingOperatorLogout()).toBe(true);

    vi.mocked(operatorSessionApi.deleteOperatorSession).mockResolvedValueOnce(undefined);
    await retryPendingOperatorLogout();

    expect(operatorSessionApi.deleteOperatorSession).toHaveBeenNthCalledWith(1, "E1");
    expect(operatorSessionApi.deleteOperatorSession).toHaveBeenNthCalledWith(2, "E1");
    expect(hasPendingOperatorLogout()).toBe(false);
    window.removeEventListener("dexcowin_auth_required", listener);
  });

  it("treats an A-claim/B-cookie mismatch as terminal without revoking B", async () => {
    window.localStorage.setItem(
      "dexcowin_mes_logout_pending",
      JSON.stringify({ state: "failed", employee_code: "A001" }),
    );
    vi.mocked(operatorSessionApi.deleteOperatorSession).mockRejectedValueOnce(
      new ApiError("현재 작업자가 다릅니다.", 403, "ACTOR_MISMATCH"),
    );

    await retryPendingOperatorLogout();

    expect(operatorSessionApi.deleteOperatorSession).toHaveBeenCalledWith("A001");
    expect(hasPendingOperatorLogout()).toBe(false);
  });

  it("opens the local logout boundary before the server revoke settles", async () => {
    setCurrentOperator(baseOperator, "boot-1");
    let finishRevoke!: () => void;
    vi.mocked(operatorSessionApi.deleteOperatorSession).mockReturnValue(
      new Promise<void>((resolve) => {
        finishRevoke = resolve;
      }),
    );
    const listener = vi.fn();
    window.addEventListener("dexcowin_auth_required", listener);

    const logout = logoutCurrentOperator();

    expect(readCurrentOperator()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    finishRevoke();
    await logout;
    window.removeEventListener("dexcowin_auth_required", listener);
  });

  it("can return to the login gate after a server-side PIN revoke", () => {
    setCurrentOperator(baseOperator, "boot-1");
    const previousAuthGeneration = captureAuthGeneration();
    const listener = vi.fn();
    window.addEventListener("dexcowin_auth_required", listener);

    returnToOperatorLogin();

    expect(readCurrentOperator()).toBeNull();
    expect(captureAuthGeneration()).toBe(previousAuthGeneration + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(operatorSessionApi.deleteOperatorSession).not.toHaveBeenCalled();
    window.removeEventListener("dexcowin_auth_required", listener);
  });
});
