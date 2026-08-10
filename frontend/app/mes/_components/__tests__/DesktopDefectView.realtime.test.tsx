import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    locations: Array<{ item_id: string; mes_code: string }>;
    onProcess: (location: unknown) => void;
  }) => (
    <div data-testid="defect-list">
      {locations.map((location) => (
        <button key={location.item_id} type="button" onClick={() => onProcess(location)}>
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
  item_id: "item-1",
  item_name: "Defect item",
  mes_code: "D-001",
  department: "assembly",
  quantity: 5,
  defective_at: null,
  has_bom: false,
};

describe("DesktopDefectView realtime refresh", () => {
  beforeEach(() => {
    mocks.revision = null;
    mocks.listDefects.mockReset().mockResolvedValue([]);
    window.history.replaceState(null, "");
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

    mocks.listDefects.mockResolvedValueOnce([{ ...location, quantity: 2 }]);
    mocks.revision = 1;
    rerender(<DesktopDefectView operator={operator} />);
    await waitFor(() => expect(screen.getByTestId("process-location")).toHaveTextContent("2"));

    mocks.listDefects.mockResolvedValueOnce([]);
    mocks.revision = 2;
    rerender(<DesktopDefectView operator={operator} />);
    await waitFor(() => expect(screen.queryByTestId("process-location")).not.toBeInTheDocument());
    expect(screen.getByTestId("defect-list")).toBeInTheDocument();
  });

  it("does not apply an inner transition to the initial hub but keeps it for internal views", async () => {
    render(<DesktopDefectView operator={operator} />);

    expect(screen.getByRole("button", { name: "Open list" }).parentElement).not.toHaveClass("animate-view-fade");

    fireEvent.click(screen.getByRole("button", { name: "Open list" }));

    expect((await screen.findByTestId("defect-list")).parentElement).toHaveClass("animate-view-fade");
  });
});
