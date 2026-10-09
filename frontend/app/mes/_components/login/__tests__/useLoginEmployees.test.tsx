import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getEmployees: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getEmployees: state.getEmployees,
  },
}));

import { useLoginEmployees } from "../useLoginEmployees";

describe("useLoginEmployees", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    state.getEmployees.mockReset();
  });

  it("shows failure state and retries active employee loading", async () => {
    const failure = new Error("CORS request blocked");
    state.getEmployees.mockRejectedValue(failure);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useLoginEmployees());

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(consoleWarn).toHaveBeenCalledWith("[MES login] read failed", expect.objectContaining({
      stage: "active_employees",
      attempts: 2,
    }));

    state.getEmployees.mockResolvedValue([]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("열린 로그인에 다시 focus하면 변경·추가·비활성 직원 후보를 최신 조회한다", async () => {
    state.getEmployees.mockResolvedValueOnce([{ employee_id: "old", name: "이전 직원" }])
      .mockResolvedValueOnce([{ employee_id: "new", name: "새 직원" }]);
    const { result } = renderHook(() => useLoginEmployees());
    await waitFor(() => expect(result.current.employees.map((employee) => employee.name)).toEqual(["이전 직원"]));
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.employees.map((employee) => employee.name)).toEqual(["새 직원"]));
    expect(state.getEmployees).toHaveBeenCalledTimes(2);
  });

  it("focus 최신응답 뒤 늦은 이전 후보 응답과 unmount 뒤 응답을 적용하지 않는다", async () => {
    let old!: (value: unknown[]) => void;
    state.getEmployees.mockImplementationOnce(() => new Promise((resolve) => { old = resolve; }))
      .mockResolvedValueOnce([{ employee_id: "new", name: "최신 직원" }]);
    const { result, unmount } = renderHook(() => useLoginEmployees());
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.employees.map((employee) => employee.name)).toEqual(["최신 직원"]));
    await act(async () => old([{ employee_id: "old", name: "옛 직원" }]));
    expect(result.current.employees.map((employee) => employee.name)).toEqual(["최신 직원"]);
    let later!: (value: unknown[]) => void;
    state.getEmployees.mockImplementationOnce(() => new Promise((resolve) => { later = resolve; }));
    act(() => window.dispatchEvent(new Event("focus")));
    unmount();
    await act(async () => later([{ employee_id: "later", name: "해제 뒤 직원" }]));
    expect(result.current.employees.map((employee) => employee.name)).toEqual(["최신 직원"]);
  });
});
