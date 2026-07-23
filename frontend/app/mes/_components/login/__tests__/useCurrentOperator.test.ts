import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCurrentOperator,
  consumeLoginNotificationPopupPending,
  markLoginNotificationPopupPending,
  readCurrentOperator,
  setCurrentOperator,
  type Operator,
} from "../useCurrentOperator";
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

  it("round-trips hidden sidebar tabs", () => {
    setCurrentOperator(baseOperator);
    expect(readCurrentOperator()?.hidden_sidebar_tabs).toEqual(["weekly", "admin"]);
  });

  it("defaults missing hidden sidebar tabs to an empty list", () => {
    const { hidden_sidebar_tabs: _hidden, ...legacyOperator } = baseOperator;
    window.localStorage.setItem("dexcowin_mes_operator", JSON.stringify(legacyOperator));
    expect(readCurrentOperator()?.hidden_sidebar_tabs).toEqual([]);
  });

  it("defaults missing login notification popup settings to enabled", () => {
    const { loginPopupEnabled: _loginPopupEnabled, ...legacyOperator } = baseOperator;
    window.localStorage.setItem("dexcowin_mes_operator", JSON.stringify(legacyOperator));
    expect(readCurrentOperator()?.loginPopupEnabled).toBe(true);
  });

  it("defaults a legacy operator without role to an empty string", () => {
    const { role: _role, ...legacyOperator } = baseOperator;
    window.localStorage.setItem("dexcowin_mes_operator", JSON.stringify(legacyOperator));

    expect(readCurrentOperator()?.role).toBe("");
  });
  it("marks and consumes a pending login notification popup once", () => {
    markLoginNotificationPopupPending("emp-1");

    expect(consumeLoginNotificationPopupPending("emp-2")).toBe(false);
    expect(consumeLoginNotificationPopupPending("emp-1")).toBe(true);
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
