import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { migrateDefectFilterSnapshot, useDefectFilterPreferences } from "../useDefectFilterPreferences";

const storageKey = (employeeId: string) => `dexcowin_mes_defect_filters:${employeeId}`;

describe("useDefectFilterPreferences", () => {
  it("drops removed unclassified selections while preserving other saved filters", () => {
    expect(migrateDefectFilterSnapshot({version: 2, scope: "all", actorScope: "mine", sort: "newest", selectedDepartments: ["조립"], selectedModels: ["미분류", "DX3000"], selectedProcessSteps: ["UNCLASSIFIED", "DISUSED", "R"]})).toEqual({version: 2, scope: "all", actorScope: "mine", sort: "newest", selectedDepartments: ["조립"], selectedModels: ["DX3000"], selectedProcessSteps: ["DISUSED", "R"]});
  });
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses the supplied screen defaults when no filter lock exists", async () => {
    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
      }),
    );

    expect(result.current.scope).toBe("all");
    expect(result.current.actorScope).toBe("all");
    expect(result.current.sort).toBe("newest");
    expect(result.current.filterLocked).toBe(false);
  });

  it("shows the current department as selected when the unlocked default scope is my", () => {
    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "my",
        defaultSort: "newest",
        currentDept: "조립",
      }),
    );

    expect(result.current.scope).toBe("my");
    expect(result.current.selectedDepartments).toEqual(["조립"]);
    expect(result.current.filterLocked).toBe(false);
  });

  it("migrates a v1 my scope to the current department and persists v2 selections", async () => {
    window.localStorage.setItem(
      storageKey("employee-1"),
      JSON.stringify({ version: 1, scope: "my", actorScope: "mine", sort: "oldest" }),
    );

    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
        currentDept: "조립",
      }),
    );

    await waitFor(() => expect(result.current.scope).toBe("my"));

    expect(result.current.scope).toBe("my");
    expect(result.current.selectedDepartments).toEqual(["조립"]);
    expect(result.current.selectedModels).toEqual([]);
    expect(result.current.selectedProcessSteps).toEqual([]);
    expect(result.current.actorScope).toBe("mine");
    expect(result.current.sort).toBe("oldest");
    expect(result.current.filterLocked).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toEqual({
      version: 2,
      scope: "my",
      actorScope: "mine",
      sort: "oldest",
      selectedDepartments: ["조립"],
      selectedModels: [],
      selectedProcessSteps: [],
    });
  });

  it("migrates a v1 production scope without losing its department range", async () => {
    window.localStorage.setItem(
      storageKey("employee-1"),
      JSON.stringify({ version: 1, scope: "production", actorScope: "all", sort: "newest" }),
    );

    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "oldest",
        currentDept: "관리",
      }),
    );

    await waitFor(() => expect(result.current.scope).toBe("production"));
    expect(result.current.selectedDepartments).toEqual(["튜브", "고압", "진공", "튜닝", "조립", "출하"]);
    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toMatchObject({
      version: 2,
      scope: "production",
      selectedDepartments: ["튜브", "고압", "진공", "튜닝", "조립", "출하"],
    });
  });

  it("stores category selections with the lock without changing actor or sort preferences", () => {
    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
        currentDept: "조립",
      }),
    );

    act(() => result.current.setFilterLocked(true));
    act(() => result.current.setSelectedDepartments(["튜브", "조립"]));
    act(() => result.current.setSelectedModels(["DX-1", "미분류"]));
    act(() => result.current.setSelectedProcessSteps(["R", "F"]));

    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toEqual({
      version: 2,
      scope: "all",
      actorScope: "all",
      sort: "newest",
      selectedDepartments: ["튜브", "조립"],
      selectedModels: ["DX-1", "미분류"],
      selectedProcessSteps: ["R", "F"],
    });
  });

  it("stores the current combination when locked and updates it with later filter changes", async () => {
    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
      }),
    );
    act(() => result.current.setFilterLocked(true));
    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toEqual({
      version: 2,
      scope: "all",
      actorScope: "all",
      sort: "newest",
      selectedDepartments: [],
      selectedModels: [],
      selectedProcessSteps: [],
    });

    act(() => {
      result.current.setScope("my");
      result.current.setActorScope("mine");
      result.current.setSort("oldest");
    });

    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toEqual({
      version: 2,
      scope: "my",
      actorScope: "mine",
      sort: "oldest",
      selectedDepartments: [],
      selectedModels: [],
      selectedProcessSteps: [],
    });
  });

  it("keeps the new scope when category filters are reset in the same interaction", () => {
    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "my",
        defaultSort: "newest",
        currentDept: "조립",
      }),
    );

    act(() => result.current.setFilterLocked(true));
    act(() => {
      result.current.setScope("all");
      result.current.resetCategoryFilters();
    });

    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toMatchObject({
      scope: "all",
      selectedDepartments: [],
      selectedModels: [],
      selectedProcessSteps: [],
    });
  });

  it("keeps locked snapshots isolated by employee id", async () => {
    window.localStorage.setItem(
      storageKey("employee-1"),
      JSON.stringify({ version: 1, scope: "my", actorScope: "mine", sort: "oldest" }),
    );
    window.localStorage.setItem(
      storageKey("employee-2"),
      JSON.stringify({ version: 1, scope: "all", actorScope: "all", sort: "newest" }),
    );

    const { result, rerender } = renderHook(
      ({ employeeId }) =>
        useDefectFilterPreferences({
          employeeId,
          defaultScope: "all",
          defaultSort: "oldest",
        }),
      { initialProps: { employeeId: "employee-1" } },
    );
    await waitFor(() => expect(result.current.scope).toBe("my"));

    rerender({ employeeId: "employee-2" });
    await waitFor(() => {
      expect(result.current.scope).toBe("all");
      expect(result.current.actorScope).toBe("all");
      expect(result.current.sort).toBe("newest");
    });
  });

  it("removes the snapshot without changing the current filters when unlocked", async () => {
    window.localStorage.setItem(
      storageKey("employee-1"),
      JSON.stringify({ version: 1, scope: "my", actorScope: "mine", sort: "oldest" }),
    );
    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
      }),
    );
    await waitFor(() => expect(result.current.filterLocked).toBe(true));

    act(() => result.current.setFilterLocked(false));

    expect(window.localStorage.getItem(storageKey("employee-1"))).toBeNull();
    expect(result.current.scope).toBe("my");
    expect(result.current.actorScope).toBe("mine");
    expect(result.current.sort).toBe("oldest");
    expect(result.current.filterLocked).toBe(false);
  });

  it("lets a targeted department entry override only the restored scope without overwriting storage", async () => {
    const saved = { version: 2, scope: "all", actorScope: "mine", sort: "oldest", selectedDepartments: [], selectedModels: [], selectedProcessSteps: [] };
    window.localStorage.setItem(storageKey("employee-1"), JSON.stringify(saved));

    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
        defectDeptFilter: "튜브",
      }),
    );
    await waitFor(() => expect(result.current.scope).toBe("my"));

    expect(result.current.scope).toBe("my");
    expect(result.current.actorScope).toBe("mine");
    expect(result.current.sort).toBe("oldest");
    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toEqual(saved);
  });

  it.each([
    ["malformed JSON", "{"],
    ["unsupported values", JSON.stringify({ version: 2, scope: "unknown", actorScope: "mine", sort: "oldest" })],
  ])("discards %s and falls back to defaults", async (_case, storedValue) => {
    window.localStorage.setItem(storageKey("employee-1"), storedValue);

    const { result } = renderHook(() =>
      useDefectFilterPreferences({
        employeeId: "employee-1",
        defaultScope: "all",
        defaultSort: "newest",
      }),
    );
    await waitFor(() => expect(window.localStorage.getItem(storageKey("employee-1"))).toBeNull());

    expect(result.current.scope).toBe("all");
    expect(result.current.actorScope).toBe("all");
    expect(result.current.sort).toBe("newest");
    expect(result.current.filterLocked).toBe(false);
    expect(window.localStorage.getItem(storageKey("employee-1"))).toBeNull();
  });
});
