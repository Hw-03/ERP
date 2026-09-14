import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revision: null as number | null,
  models: [],
  getItems: vi.fn(),
  getEmployees: vi.fn(),
  getDepartments: vi.fn(),
  getAllBOM: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getItems: mocks.getItems,
    getEmployees: mocks.getEmployees,
    getDepartments: mocks.getDepartments,
    getAllBOM: mocks.getAllBOM,
  },
}));

vi.mock("@/lib/queries/useModelsQuery", () => ({
  useModelsQuery: () => ({ data: mocks.models }),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => mocks.revision,
}));

import { useAdminBootstrap } from "../useAdminBootstrap";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useAdminBootstrap realtime refresh", () => {
  beforeEach(() => {
    mocks.revision = null;
    mocks.getItems.mockReset().mockResolvedValue([]);
    mocks.getEmployees.mockReset().mockResolvedValue([]);
    mocks.getDepartments.mockReset().mockResolvedValue([]);
    mocks.getAllBOM.mockReset().mockResolvedValue([]);
  });

  it("refreshes only items and all BOM rows when the database revision changes", async () => {
    const onError = vi.fn();
    const { rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );

    await waitFor(() => {
      expect(mocks.getItems).toHaveBeenCalledTimes(1);
      expect(mocks.getAllBOM).toHaveBeenCalledTimes(1);
      expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
      expect(mocks.getDepartments).toHaveBeenCalledTimes(1);
    });

    mocks.revision = 1;
    rerender();

    await waitFor(() => {
      expect(mocks.getItems).toHaveBeenCalledTimes(2);
      expect(mocks.getAllBOM).toHaveBeenCalledTimes(2);
    });
    expect(mocks.getEmployees).toHaveBeenCalledTimes(1);
    expect(mocks.getDepartments).toHaveBeenCalledTimes(1);
  });

  it("ignores an older item response that finishes after a newer revision response", async () => {
    const older = deferred<unknown[]>();
    const newer = deferred<unknown[]>();
    mocks.getItems
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const onError = vi.fn();
    const { result, rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError }),
    );
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(1));

    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(2));
    mocks.revision = 2;
    rerender();
    await waitFor(() => expect(mocks.getItems).toHaveBeenCalledTimes(3));

    await act(async () => {
      newer.resolve([{ item_id: "item-1", item_name: "Newest" }]);
      await newer.promise;
    });
    expect(result.current.items[0]?.item_name).toBe("Newest");

    await act(async () => {
      older.resolve([{ item_id: "item-1", item_name: "Older" }]);
      await older.promise;
    });
    expect(result.current.items[0]?.item_name).toBe("Newest");
  });

  it("keeps the last successful BOM snapshot when a realtime refresh fails", async () => {
    const initialRows = [{ parent_item_id: "parent-1", child_item_id: "child-1" }];
    mocks.getAllBOM.mockResolvedValueOnce(initialRows).mockRejectedValueOnce(new Error("refresh failed"));
    const { result, rerender } = renderHook(
      () => useAdminBootstrap({ unlocked: true, globalSearch: "", onError: vi.fn() }),
    );
    await waitFor(() => expect(result.current.allBomRows).toEqual(initialRows));

    mocks.revision = 1;
    rerender();
    await waitFor(() => expect(mocks.getAllBOM).toHaveBeenCalledTimes(2));

    expect(result.current.allBomRows).toEqual(initialRows);
  });
});
