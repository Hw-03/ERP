import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WarehouseQueuePanel } from "../WarehouseQueuePanel";
import { DepartmentQueuePanel } from "../DepartmentQueuePanel";
import { AsResearchQueuePanel } from "../AsResearchQueuePanel";
import { MyRequestsPanel } from "../MyRequestsPanel";

const query = vi.hoisted(() => ({ data: [] as unknown[] | undefined, isLoading: false, error: new Error("조회 실패") as Error | null, refetch: vi.fn() }));
vi.mock("@/lib/queries/useStockRequestsQuery", () => ({
  useWarehouseQueueQuery: () => query,
  useDepartmentQueueQuery: () => query,
  useAsResearchQueueQuery: () => query,
  useMyStockRequestsQuery: () => query,
  useApproveStockRequestMutation: () => ({ mutate: vi.fn() }),
  useRejectStockRequestMutation: () => ({ mutate: vi.fn() }),
  useApproveStockRequestDepartmentMutation: () => ({ mutate: vi.fn() }),
  useRejectStockRequestDepartmentMutation: () => ({ mutate: vi.fn() }),
  useApproveStockRequestAsResearchMutation: () => ({ mutate: vi.fn() }),
  useRejectStockRequestAsResearchMutation: () => ({ mutate: vi.fn() }),
  useCancelStockRequestMutation: () => ({ mutate: vi.fn() }),
  useRevertToDraftMutation: () => ({ mutate: vi.fn() }),
}));

describe.each([WarehouseQueuePanel, DepartmentQueuePanel, AsResearchQueuePanel, MyRequestsPanel])("queue read state", (Panel) => {
  beforeEach(() => { query.data = []; query.isLoading = false; query.error = new Error("조회 실패"); query.refetch.mockClear(); });
  it("keeps a full work area while the initial list is loading", () => {
    query.data = undefined;
    query.isLoading = true;
    query.error = null;
    render(<Panel approverEmployeeId="e1" employeeId="e1" refreshNonce={0} onChanged={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveClass("flex-1", "rounded-[20px]");
    expect(screen.queryByTestId("warehouse-empty-work-area")).not.toBeInTheDocument();
  });
  it("retains a successful empty result on refresh failure", () => {
    render(<Panel approverEmployeeId="e1" employeeId="e1" refreshNonce={0} onChanged={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("기존 내용을 표시합니다");
    query.refetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(query.refetch).toHaveBeenCalledOnce();
  });
  it("does not describe a failed first query as cached content", () => {
    query.data = undefined;
    render(<Panel approverEmployeeId="e1" employeeId="e1" refreshNonce={0} onChanged={vi.fn()} />);
    expect(screen.getByRole("alert")).not.toHaveTextContent("기존 내용을 표시합니다");
  });
});

it("uses the approval-inbox empty work area for my requests", () => {
  query.data = [];
  query.isLoading = false;
  query.error = null;
  render(<MyRequestsPanel employeeId="e1" refreshNonce={0} onChanged={vi.fn()} />);
  expect(screen.getByTestId("warehouse-empty-work-area")).toHaveTextContent("아직 제출한 요청이 없습니다.");
  expect(screen.getByText("요청을 제출하면 진행 상태를 여기에서 확인할 수 있습니다.")).toBeInTheDocument();
});
