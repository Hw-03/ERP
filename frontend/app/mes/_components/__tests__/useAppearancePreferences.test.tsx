import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppearancePreferencesProvider, useAppearancePreferences } from "../useAppearancePreferences";
import { clearCurrentOperator, readCurrentOperator, setCurrentOperator, type Operator } from "../login/useCurrentOperator";
import { employeesApi } from "@/lib/api/employees";
import { sendClientEvent } from "@/lib/client-events";

vi.mock("@/lib/client-events", () => ({ sendClientEvent: vi.fn() }));
vi.mock("@/lib/api/employees", () => ({ employeesApi: { getEmployeeAppearance: vi.fn(), setEmployeeAppearance: vi.fn() } }));
const base: Operator = { employee_id: "E1", employee_code: "E1", name: "Worker", role: "worker", department: "조립", warehouse_role: "none", department_role: "none", as_research_approver: false, assigned_model_slots: [], io_enabled: true, hidden_sidebar_tabs: [], loginPopupEnabled: true, theme: null, sidebar_mode: "hover" };
const savedKey = "dexcowin_mes_appearance_saved";
const pair = (employee_id = "E1", theme: "light" | "dark" = "dark", sidebar_mode: "hover" | "collapsed" | "expanded" = "expanded") => ({ employee_id, theme, sidebar_mode });
function wrapper({ children }: { children: ReactNode }) { return <AppearancePreferencesProvider>{children}</AppearancePreferencesProvider>; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function remote(employeeId = "E1", version = 1) { window.dispatchEvent(new StorageEvent("storage", { key: savedKey, newValue: JSON.stringify({ version, employeeId, eventId: "remote-1" }), storageArea: localStorage })); }

describe("employee appearance synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear(); sessionStorage.clear();
    setCurrentOperator(base, "boot"); vi.mocked(sendClientEvent).mockClear();
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair("E1", "light", "hover"));
    vi.mocked(employeesApi.setEmployeeAppearance).mockResolvedValue(pair());
  });

  it("loads the authoritative pair and patches preferences without a login audit", async () => {
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair());
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(result.current.preferences).toEqual({ theme: "dark", sidebarMode: "expanded" }));
    expect(readCurrentOperator()).toMatchObject({ theme: "dark", sidebar_mode: "expanded", warehouse_role: "none" });
    expect(sendClientEvent).not.toHaveBeenCalled();
  });

  it("ignores global legacy theme for a different employee with unset preferences", async () => {
    localStorage.setItem("theme", "dark");
    vi.mocked(employeesApi.getEmployeeAppearance).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    expect(result.current.preferences.theme).toBe("light");
  });

  it("fetches on same-employee saved events and ignores other employees and keys", async () => {
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalledTimes(1));
    act(() => { remote("E2"); remote("E1", 2); window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark", storageArea: localStorage })); });
    expect(employeesApi.getEmployeeAppearance).toHaveBeenCalledTimes(1);
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair());
    act(() => remote());
    await waitFor(() => expect(result.current.preferences.theme).toBe("dark"));
    expect(sendClientEvent).not.toHaveBeenCalled();
  });

  it("discards stale employee reads after a switch and aborts their request", async () => {
    const old = deferred<ReturnType<typeof pair>>();
    vi.mocked(employeesApi.getEmployeeAppearance).mockReturnValueOnce(old.promise).mockResolvedValue(pair("E2", "light", "collapsed"));
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(employeesApi.getEmployeeAppearance).mock.calls[0][1];
    act(() => setCurrentOperator({ ...base, employee_id: "E2" }));
    await waitFor(() => expect(result.current.preferences.sidebarMode).toBe("collapsed"));
    await act(async () => old.resolve(pair()));
    expect(signal?.aborted).toBe(true);
    expect(readCurrentOperator()?.employee_id).toBe("E2");
    expect(result.current.preferences.theme).toBe("light");
  });

  it("does not apply a completed read after logout", async () => {
    const old = deferred<ReturnType<typeof pair>>();
    vi.mocked(employeesApi.getEmployeeAppearance).mockReturnValueOnce(old.promise);
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    act(() => clearCurrentOperator());
    await act(async () => old.resolve(pair()));
    expect(readCurrentOperator()).toBeNull();
    expect(result.current.preferences).toEqual({ theme: "light", sidebarMode: "hover" });
  });

  it("saves one atomic pair and broadcasts only a version, employee and event ID", async () => {
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValueOnce(pair("E1", "light", "hover")).mockResolvedValue(pair());
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    await act(async () => result.current.savePreferences({ theme: "dark", sidebarMode: "expanded" }));
    expect(employeesApi.setEmployeeAppearance).toHaveBeenCalledWith("E1", { theme: "dark", sidebar_mode: "expanded" });
    expect(Object.keys(JSON.parse(localStorage.getItem(savedKey)!)).sort()).toEqual(["employeeId", "eventId", "version"]);
    expect(JSON.parse(localStorage.getItem(savedKey)!)).toMatchObject({ version: 1, employeeId: "E1" });
    expect(sendClientEvent).not.toHaveBeenCalled();
  });

  it("leaves preferences and other tabs untouched when the save fails", async () => {
    vi.mocked(employeesApi.setEmployeeAppearance).mockRejectedValue(new Error("save failed"));
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    await act(async () => { await expect(result.current.savePreferences({ theme: "dark", sidebarMode: "expanded" })).rejects.toThrow("save failed"); });
    expect(result.current.preferences.theme).toBe("light");
    expect(localStorage.getItem(savedKey)).toBeNull();
  });

  it("uses successful PUT as fallback when refresh fails and retries when online", async () => {
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValueOnce(pair("E1", "light", "hover")).mockRejectedValueOnce(new Error("read failed"));
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    await act(async () => result.current.savePreferences({ theme: "dark", sidebarMode: "expanded" }));
    expect(result.current.preferences.theme).toBe("dark");
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair("E1", "light", "collapsed"));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.preferences.sidebarMode).toBe("collapsed"));
  });

  it("does not apply an older pending save over a newer saved pair", async () => {
    const old = deferred<ReturnType<typeof pair>>();
    vi.mocked(employeesApi.setEmployeeAppearance).mockReturnValueOnce(old.promise).mockResolvedValue(pair("E1", "light", "collapsed"));
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair("E1", "light", "collapsed"));
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    let oldSave!: Promise<void>;
    act(() => { oldSave = result.current.savePreferences({ theme: "dark", sidebarMode: "expanded" }); });
    await act(async () => result.current.savePreferences({ theme: "light", sidebarMode: "collapsed" }));
    await act(async () => { old.resolve(pair()); await oldSave; });
    expect(result.current.preferences).toEqual({ theme: "light", sidebarMode: "collapsed" });
  });

  it("refreshes the source tab when an older PUT commits after the newer PUT", async () => {
    const old = deferred<ReturnType<typeof pair>>();
    vi.mocked(employeesApi.setEmployeeAppearance).mockReturnValueOnce(old.promise).mockResolvedValue(pair("E1", "light", "collapsed"));
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair("E1", "light", "collapsed"));
    const { result } = renderHook(useAppearancePreferences, { wrapper });
    await waitFor(() => expect(employeesApi.getEmployeeAppearance).toHaveBeenCalled());
    let oldSave!: Promise<void>;
    act(() => { oldSave = result.current.savePreferences({ theme: "dark", sidebarMode: "expanded" }); });
    await act(async () => result.current.savePreferences({ theme: "light", sidebarMode: "collapsed" }));
    vi.mocked(employeesApi.getEmployeeAppearance).mockResolvedValue(pair("E1", "dark", "hover"));
    await act(async () => { old.resolve(pair()); await oldSave; });
    expect(result.current.preferences).toEqual({ theme: "dark", sidebarMode: "hover" });
  });
});
