import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Operator } from "../login/useCurrentOperator";

const mocks = vi.hoisted(() => ({
  revision: null as number | null,
  listDefects: vi.fn(),
}));

vi.mock("@/lib/queries/realtime", () => ({
  useRealtimeRevision: () => mocks.revision,
}));

vi.mock("@/lib/api/defects", () => ({
  defectsApi: { listDefects: mocks.listDefects },
}));

vi.mock("../_warehouse_hooks/useWarehouseData", () => ({
  useWarehouseData: () => ({ items: [], productModels: [] }),
}));

vi.mock("../_defect_hub/DefectHubEntry", () => ({
  DefectHubEntry: ({ onSelect }: { onSelect: (id: "list") => void }) => (
    <button type="button" onClick={() => onSelect("list")}>Open list</button>
  ),
}));

vi.mock("../_defect_hub/DefectDepartmentList", () => ({
  DefectDepartmentList: ({
    locations,
    onProcess,
  }: {
    locations: Array<{ record_id: string; item_id: string; mes_code: string }>;
    onProcess: (location: unknown) => void;
  }) => (
    <div data-testid="defect-list">
      {locations.map((location) => (
        <button key={location.record_id} type="button" onClick={() => onProcess(location)}>
          Process {location.mes_code}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../_defect_hub/DefectProcessPanel", () => ({
  DefectProcessPanel: ({ location }: { location: { quantity: number } }) => (
    <div data-testid="process-location">{location.quantity}</div>
  ),
}));

import { DesktopDefectView } from "../DesktopDefectView";

const operator = {
  employee_id: "employee-1",
  name: "Operator",
  department: "assembly",
  warehouse_role: "none",
  department_role: "none",
} as Operator;

const location = {
  record_id: "record-1",
  item_id: "item-1",
  item_name: "Defect item",
  mes_code: "D-001",
  department: "assembly",
  quantity: 5,
  original_quantity: 5,
  pending_quantity: 0,
  available_quantity: 5,
  defective_at: null,
  quarantined_by: "Operator",
  quarantined_by_employee_id: operator.employee_id,
  is_legacy: false,
  has_bom: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("DesktopDefectView realtime refresh", () => {
  beforeEach(() => {
    mocks.revision = null;
    mocks.listDefects.mockReset().mockResolvedValue([]);
    window.history.replaceState(null, "");
    window.localStorage.clear();
  });

  it("reloads locations on revision while preserving the current list view", async () => {
    const { rerender } = render(<DesktopDefectView operator={operator} />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));
    expect(await screen.findByTestId("defect-list")).toBeInTheDocument();
    await waitFor(() => expect(mocks.listDefects).toHaveBeenCalledTimes(1));

    mocks.revision = 1;
    rerender(<DesktopDefectView operator={operator} />);

    await waitFor(() => expect(mocks.listDefects).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("defect-list")).toBeInTheDocument();
  });

  it("reconnects a process view to the fresh location and returns to the list when it disappears", async () => {
    mocks.listDefects.mockResolvedValueOnce([location]);
    const { rerender } = render(<DesktopDefectView operator={operator} />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));
    fireEvent.click(await screen.findByRole("button", { name: "Process D-001" }));
    expect(screen.getByTestId("process-location")).toHaveTextContent("5");

    mocks.listDefects.mockResolvedValueOnce([{ ...location, quantity: 2, available_quantity: 2 }]);
    mocks.revision = 1;
    rerender(<DesktopDefectView operator={operator} />);
    await waitFor(() => expect(screen.getByTestId("process-location")).toHaveTextContent("2"));

    mocks.listDefects.mockResolvedValueOnce([]);
    mocks.revision = 2;
    rerender(<DesktopDefectView operator={operator} />);
    await waitFor(() => expect(screen.queryByTestId("process-location")).not.toBeInTheDocument());
    expect(screen.getByTestId("defect-list")).toBeInTheDocument();
  });

  it("keeps the loaded list visible while a realtime refresh is pending", async () => {
    mocks.listDefects.mockResolvedValueOnce([location]);
    const pendingRefresh = deferred<typeof location[]>();
    const { rerender } = render(<DesktopDefectView operator={operator} />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));
    expect(await screen.findByRole("button", { name: "Process D-001" })).toBeInTheDocument();

    mocks.listDefects.mockReturnValueOnce(pendingRefresh.promise);
    mocks.revision = 1;
    rerender(<DesktopDefectView operator={operator} />);

    await waitFor(() => expect(mocks.listDefects).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Process D-001" })).toBeInTheDocument();
    expect(screen.queryByText(/로딩 중/)).not.toBeInTheDocument();

    await act(async () => pendingRefresh.resolve([{ ...location, quantity: 2, available_quantity: 2 }]));
  });

  it("keeps the loaded list visible after refresh failure and retries without a loading screen", async () => {
    mocks.listDefects.mockResolvedValueOnce([location]);
    const { rerender } = render(<DesktopDefectView operator={operator} />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));
    expect(await screen.findByRole("button", { name: "Process D-001" })).toBeInTheDocument();

    mocks.listDefects.mockRejectedValueOnce(new Error("refresh failed"));
    mocks.revision = 1;
    rerender(<DesktopDefectView operator={operator} />);

    expect(await screen.findByRole("button", { name: "다시 동기화" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Process D-001" })).toBeInTheDocument();

    mocks.listDefects.mockResolvedValueOnce([{ ...location, quantity: 2, available_quantity: 2 }]);
    fireEvent.click(screen.getByRole("button", { name: "다시 동기화" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "다시 동기화" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Process D-001" })).toBeInTheDocument();
  });

  it("does not apply an inner transition to the initial hub but keeps it for internal views", async () => {
    render(<DesktopDefectView operator={operator} />);

    expect(screen.getByRole("button", { name: "Open list" }).parentElement).not.toHaveClass("animate-view-fade");

    fireEvent.click(screen.getByRole("button", { name: "Open list" }));

    expect((await screen.findByTestId("defect-list")).parentElement).toHaveClass("animate-view-fade");
  });

  it("combines department and quarantine actor before deriving KPI and list population", async () => {
    const day = 24 * 60 * 60 * 1000;
    mocks.listDefects.mockResolvedValueOnce([
      {
        ...location,
        record_id: "record-mine-assembly",
        item_id: "mine-assembly",
        mes_code: "MINE-ASSEMBLY",
        quarantined_by_employee_id: operator.employee_id,
        defective_at: new Date(Date.now() - 100 * day).toISOString(),
      },
      {
        ...location,
        record_id: "record-mine-vacuum",
        item_id: "mine-vacuum",
        mes_code: "MINE-VACUUM",
        department: "vacuum",
        quarantined_by_employee_id: operator.employee_id,
        defective_at: new Date(Date.now() - 400 * day).toISOString(),
      },
      {
        ...location,
        record_id: "record-other-assembly",
        item_id: "other-assembly",
        mes_code: "OTHER-ASSEMBLY",
        quarantined_by_employee_id: "employee-2",
      },
      {
        ...location,
        record_id: "record-unknown-assembly",
        item_id: "unknown-assembly",
        mes_code: "UNKNOWN-ASSEMBLY",
        quarantined_by_employee_id: null,
      },
    ]);
    render(<DesktopDefectView operator={operator} />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));
    expect(await screen.findByRole("button", { name: "Process UNKNOWN-ASSEMBLY" })).toBeInTheDocument();

    const actorFilters = screen.getByText("격리자").parentElement!;
    fireEvent.click(within(actorFilters).getByRole("button", { name: "내가 격리" }));

    expect(screen.getByRole("button", { name: "Process MINE-ASSEMBLY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Process MINE-VACUUM" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Process OTHER-ASSEMBLY" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Process UNKNOWN-ASSEMBLY" })).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("2건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("1건");

    const departmentFilters = screen.getByText("부서").parentElement!;
    fireEvent.click(within(departmentFilters).getByRole("button", { name: "내 부서" }));

    expect(screen.getByRole("button", { name: "Process MINE-ASSEMBLY" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Process MINE-VACUUM" })).not.toBeInTheDocument();
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("1건");
    expect(screen.getByText("1년 이상 ⚠").parentElement).toHaveTextContent("0건");
  });

  it("restores the employee's locked filters into the desktop list, KPI, and ordering", async () => {
    const day = 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      `dexcowin_mes_defect_filters:${operator.employee_id}`,
      JSON.stringify({ version: 1, scope: "my", actorScope: "mine", sort: "oldest" }),
    );
    mocks.listDefects.mockResolvedValueOnce([
      {
        ...location,
        record_id: "record-recent",
        item_id: "recent",
        mes_code: "RECENT-MINE",
        defective_at: new Date(Date.now() - 10 * day).toISOString(),
      },
      {
        ...location,
        record_id: "record-old",
        item_id: "old",
        mes_code: "OLD-MINE",
        defective_at: new Date(Date.now() - 100 * day).toISOString(),
      },
      {
        ...location,
        record_id: "record-other",
        item_id: "other",
        mes_code: "OTHER-ACTOR",
        quarantined_by_employee_id: "employee-2",
      },
      {
        ...location,
        record_id: "record-other-dept",
        item_id: "other-dept",
        mes_code: "OTHER-DEPT",
        department: "vacuum",
      },
    ]);

    render(<DesktopDefectView operator={operator} />);
    fireEvent.click(screen.getByRole("button", { name: "Open list" }));

    expect(await screen.findByRole("checkbox", { name: "필터 고정" })).toBeChecked();
    expect(screen.getByRole("combobox")).toHaveValue("oldest");
    expect(screen.getByRole("button", { name: "내 부서" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "내가 격리" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("격리 중").parentElement).toHaveTextContent("2건");

    const rows = within(screen.getByTestId("defect-list")).getAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual(["Process OLD-MINE", "Process RECENT-MINE"]);
  });
});
