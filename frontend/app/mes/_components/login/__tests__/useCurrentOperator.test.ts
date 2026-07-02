import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeLoginNotificationPopupPending,
  markLoginNotificationPopupPending,
  readCurrentOperator,
  setCurrentOperator,
  type Operator,
} from "../useCurrentOperator";

const baseOperator: Operator = {
  employee_id: "emp-1",
  name: "Tester",
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
  it("marks and consumes a pending login notification popup once", () => {
    markLoginNotificationPopupPending("emp-1");

    expect(consumeLoginNotificationPopupPending("emp-2")).toBe(false);
    expect(consumeLoginNotificationPopupPending("emp-1")).toBe(true);
    expect(consumeLoginNotificationPopupPending("emp-1")).toBe(false);
  });
});
