import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopWarehouseMapTab } from "../DesktopWarehouseMapTab";

const testState = vi.hoisted(() => ({
  revision: 1 as number | null,
  getItems: vi.fn(),
  reconcile: vi.fn(),
  verifyPin: vi.fn(),
  registerOperatorCredsProvider: vi.fn(),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => testState.revision,
}));

vi.mock("@/lib/api/employees", () => ({
  employeesApi: { verifyEmployeePin: testState.verifyPin },
}));

vi.mock("@/lib/api/items", () => ({
  itemsApi: { getItems: testState.getItems },
}));

vi.mock("@/lib/api/warehouse-map", () => ({
  warehouseMapApi: { reconcile: testState.reconcile },
}));

vi.mock("@/lib/api-core", () => ({
  registerOperatorCredsProvider: testState.registerOperatorCredsProvider,
}));

vi.mock("../login/useCurrentOperator", () => ({
  useCurrentOperator: () => ({
    employee_id: "employee-1",
    employee_code: "E001",
    name: "Manager",
    warehouse_role: "primary",
  }),
}));

vi.mock("../DesktopWarehouseMapView", () => ({
  DesktopWarehouseMapView: ({
    items = [],
    onMapMutated,
  }: {
    items?: Array<{ item_name: string }>;
    onMapMutated?: () => void;
  }) => (
    <>
      <output data-testid="editor-items">{items.map((item) => item.item_name).join(",")}</output>
      {onMapMutated && <button onClick={onMapMutated}>mutate map</button>}
    </>
  ),
}));

vi.mock("../_admin_sections/AdminWarehouseStructureSection", () => ({
  AdminWarehouseStructureSection: () => <div>structure editor</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  testState.revision = null;
  testState.verifyPin.mockResolvedValue({});
  testState.getItems.mockResolvedValue([]);
  testState.reconcile.mockResolvedValue({ rows: [], mismatch_count: 0 });
});

async function enterEditMode() {
  fireEvent.click(screen.getByRole("button", { name: "편집 모드" }));
  fireEvent.change(screen.getByPlaceholderText("본인 PIN"), { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: "편집 시작" }));
  await waitFor(() => expect(testState.getItems).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(testState.reconcile).toHaveBeenCalledTimes(1));
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("DesktopWarehouseMapTab realtime refresh", () => {
  it("uses the current session actor for mutation step-up without a second login request", async () => {
    render(<DesktopWarehouseMapTab />);

    await enterEditMode();

    expect(testState.verifyPin).not.toHaveBeenCalled();
    const provider = testState.registerOperatorCredsProvider.mock.calls[0]?.[0] as
      | (() => { code: string; pin: string } | null)
      | undefined;
    expect(provider?.()).toEqual({ code: "E001", pin: "1234" });
  });

  it("applies reconcile results when the concurrent item refresh fails", async () => {
    const { rerender } = render(<DesktopWarehouseMapTab />);
    await enterEditMode();
    testState.getItems.mockRejectedValueOnce(new Error("items failed"));
    testState.reconcile.mockResolvedValueOnce({
      rows: [{
        item_id: "mismatch-1",
        mes_code: "M-1",
        item_name: "mismatch-item",
        placed_total: 0,
        warehouse_qty: 4,
        diff: -4,
        status: "under",
      }],
      mismatch_count: 1,
    });

    testState.revision = 2;
    rerender(<DesktopWarehouseMapTab />);

    expect(await screen.findByText(/M-1\(0\/4\)/)).toBeInTheDocument();
  });

  it("applies item results when the concurrent reconcile refresh fails", async () => {
    const { rerender } = render(<DesktopWarehouseMapTab />);
    await enterEditMode();
    testState.getItems.mockResolvedValueOnce([{ item_name: "fresh-editor-item" }]);
    testState.reconcile.mockRejectedValueOnce(new Error("reconcile failed"));

    testState.revision = 2;
    rerender(<DesktopWarehouseMapTab />);

    await waitFor(() => {
      expect(screen.getByTestId("editor-items")).toHaveTextContent("fresh-editor-item");
    });
  });

  it("re-fetches items after a revision arrives during the PIN entry request", async () => {
    testState.revision = 1;
    const staleItems = deferred<Array<{ item_name: string }>>();
    testState.getItems
      .mockReset()
      .mockReturnValueOnce(staleItems.promise)
      .mockResolvedValueOnce([{ item_name: "fresh-after-pin" }]);
    const { rerender } = render(<DesktopWarehouseMapTab />);

    fireEvent.click(screen.getByRole("button", { name: "편집 모드" }));
    fireEvent.change(screen.getByPlaceholderText("본인 PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "편집 시작" }));
    await waitFor(() => expect(testState.getItems).toHaveBeenCalledTimes(1));

    testState.revision = 2;
    rerender(<DesktopWarehouseMapTab />);
    await act(async () => {
      staleItems.resolve([{ item_name: "stale-during-pin" }]);
      await staleItems.promise;
    });

    await waitFor(() => expect(testState.getItems).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByTestId("editor-items")).toHaveTextContent("fresh-after-pin");
      expect(screen.getByTestId("editor-items")).not.toHaveTextContent("stale-during-pin");
    });
  });

  it("ignores an older normal reconcile result after a newer revision result", async () => {
    const { rerender } = render(<DesktopWarehouseMapTab />);
    await enterEditMode();
    const olderReconcile = deferred<{
      rows: Array<{
        item_id: string;
        mes_code: string;
        item_name: string;
        placed_total: number;
        warehouse_qty: number;
        diff: number;
        status: string;
      }>;
      mismatch_count: number;
    }>();
    const newerReconcile = deferred<{
      rows: Array<{
        item_id: string;
        mes_code: string;
        item_name: string;
        placed_total: number;
        warehouse_qty: number;
        diff: number;
        status: string;
      }>;
      mismatch_count: number;
    }>();
    testState.reconcile
      .mockReset()
      .mockReturnValueOnce(olderReconcile.promise)
      .mockReturnValueOnce(newerReconcile.promise);

    fireEvent.click(screen.getByRole("button", { name: "mutate map" }));
    await waitFor(() => expect(testState.reconcile).toHaveBeenCalledTimes(1));
    testState.revision = 2;
    rerender(<DesktopWarehouseMapTab />);
    await waitFor(() => expect(testState.reconcile).toHaveBeenCalledTimes(2));

    await act(async () => {
      newerReconcile.resolve({
        rows: [{
          item_id: "fresh-1",
          mes_code: "F-1",
          item_name: "fresh-reconcile",
          placed_total: 0,
          warehouse_qty: 4,
          diff: -4,
          status: "under",
        }],
        mismatch_count: 1,
      });
      await newerReconcile.promise;
    });
    expect(await screen.findByText(/F-1\(0\/4\)/)).toBeInTheDocument();

    await act(async () => {
      olderReconcile.resolve({
        rows: [{
          item_id: "stale-1",
          mes_code: "S-1",
          item_name: "stale-reconcile",
          placed_total: 0,
          warehouse_qty: 7,
          diff: -7,
          status: "under",
        }],
        mismatch_count: 1,
      });
      await olderReconcile.promise;
    });
    await waitFor(() => {
      expect(screen.getByText(/F-1\(0\/4\)/)).toBeInTheDocument();
      expect(screen.queryByText(/S-1\(0\/7\)/)).not.toBeInTheDocument();
    });
  });
});
