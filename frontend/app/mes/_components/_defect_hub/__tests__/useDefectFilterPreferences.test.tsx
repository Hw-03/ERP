import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDefectFilterPreferences } from "../useDefectFilterPreferences";

const storageKey = (employeeId: string) => `dexcowin_mes_defect_filters:${employeeId}`;

describe("useDefectFilterPreferences", () => {
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

  it("restores a valid locked filter snapshot", async () => {
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

    await waitFor(() => expect(result.current.scope).toBe("my"));

    expect(result.current.scope).toBe("my");
    expect(result.current.actorScope).toBe("mine");
    expect(result.current.sort).toBe("oldest");
    expect(result.current.filterLocked).toBe(true);
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
      version: 1,
      scope: "all",
      actorScope: "all",
      sort: "newest",
    });

    act(() => result.current.setScope("my"));
    act(() => result.current.setActorScope("mine"));
    act(() => result.current.setSort("oldest"));

    expect(JSON.parse(window.localStorage.getItem(storageKey("employee-1"))!)).toEqual({
      version: 1,
      scope: "my",
      actorScope: "mine",
      sort: "oldest",
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
    const saved = { version: 1, scope: "all", actorScope: "mine", sort: "oldest" };
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
