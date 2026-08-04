import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCurrentOperator,
  consumeLoginNotificationPopupPending,
  getStoredBootId,
  markLoginNotificationPopupPending,
  readCurrentOperator,
  setCurrentOperator,
  type Operator,
} from "../useCurrentOperator";
import * as currentOperatorStorage from "../useCurrentOperator";
import { sendClientEvent } from "@/lib/client-events";

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
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

  it("updates only current operator preferences without logging another login", () => {
    setCurrentOperator(baseOperator, "boot-1");
    vi.mocked(sendClientEvent).mockClear();
    const updateCurrentOperatorPreferences = (
      currentOperatorStorage as unknown as {
        updateCurrentOperatorPreferences: (patch: { sidebar_mode: string }) => void;
      }
    ).updateCurrentOperatorPreferences;

    expect(updateCurrentOperatorPreferences).toBeTypeOf("function");
    updateCurrentOperatorPreferences({ sidebar_mode: "expanded" });

    expect(
      (readCurrentOperator() as unknown as { sidebar_mode: string })?.sidebar_mode,
    ).toBe("expanded");
    expect(readCurrentOperator()?.name).toBe(baseOperator.name);
    expect(getStoredBootId()).toBe("boot-1");
    expect(sendClientEvent).not.toHaveBeenCalled();
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

  it("logs successful login and logout as best-effort client events", () => {
    setCurrentOperator(baseOperator);
    expect(sendClientEvent).toHaveBeenCalledWith({
      event: "ui_login",
      source: "desktop",
    });

    clearCurrentOperator();
    expect(sendClientEvent).toHaveBeenLastCalledWith({
      event: "ui_logout",
      source: "desktop",
    });
  });
});
