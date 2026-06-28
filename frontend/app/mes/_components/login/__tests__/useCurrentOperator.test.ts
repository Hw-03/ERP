import { beforeEach, describe, expect, it } from "vitest";
import { readCurrentOperator, setCurrentOperator, type Operator } from "../useCurrentOperator";

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
};

describe("useCurrentOperator storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
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
});