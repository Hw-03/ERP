import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendClientEvent } from "@/lib/client-events";
import {
  readCurrentOperator,
  setCurrentOperator,
  type Operator,
} from "../login/useCurrentOperator";
import { useAppearancePreferences } from "../useAppearancePreferences";

const apiMocks = vi.hoisted(() => ({
  setEmployeeTheme: vi.fn(),
  setEmployeeSidebarMode: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/lib/client-events", () => ({
  sendClientEvent: vi.fn(),
}));

const operator: Operator = {
  employee_id: "emp-1",
  name: "Appearance Tester",
  role: "조립/사원",
  department: "조립",
  level: "staff",
  employee_code: "E1",
  warehouse_role: "none",
  department_role: "none",
  theme: "light",
  sidebar_mode: "hover",
  assigned_model_slots: [],
  io_enabled: true,
  hidden_sidebar_tabs: [],
  loginPopupEnabled: true,
};

describe("useAppearancePreferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    apiMocks.setEmployeeTheme.mockReset().mockResolvedValue({});
    apiMocks.setEmployeeSidebarMode.mockReset().mockResolvedValue({});
    vi.mocked(sendClientEvent).mockClear();
  });

  it("updates theme and sidebar cache without recording another login or rotating the audit session", async () => {
    setCurrentOperator(operator, "boot-1");
    window.sessionStorage.setItem("dexcowin_mes_audit_session", "audit-session-original");
    vi.mocked(sendClientEvent).mockClear();
    const { result } = renderHook(() => useAppearancePreferences());

    await act(async () => {
      await result.current.savePreferences({ theme: "dark", sidebarMode: "expanded" });
    });

    expect(apiMocks.setEmployeeTheme).toHaveBeenCalledWith("emp-1", "dark");
    expect(apiMocks.setEmployeeSidebarMode).toHaveBeenCalledWith("emp-1", "expanded");
    expect(readCurrentOperator()).toMatchObject({
      theme: "dark",
      sidebar_mode: "expanded",
    });
    expect(window.sessionStorage.getItem("dexcowin_mes_audit_session")).toBe(
      "audit-session-original",
    );
    expect(sendClientEvent).not.toHaveBeenCalled();
  });
});
