import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionLog } from "@/lib/api";
import { productionApi } from "@/lib/api/production";
import type { InventoryEffectRow } from "../historyInventoryEffect";
import {
  HistoryCancelAction,
  useHistoryCancellationScopeLogs,
} from "../HistoryCancelAction";

vi.mock("@/lib/api/production", () => ({
  productionApi: {
    getTransactions: vi.fn(),
  },
}));

const effects: InventoryEffectRow[] = [
  {
    key: "item-1:EA:location::조립:PRODUCTION:",
    scope: "location",
    itemId: "item-1",
    itemName: "부품 A",
    unit: "EA",
    locationId: null,
    boxId: null,
    department: "조립",
    status: "PRODUCTION",
    label: "조립 생산",
    delta: -2,
    deltaLabel: "-2",
  },
];

function makeScopeLog(
  logId: string,
  itemName: string,
  cancelled = false,
): TransactionLog {
  return {
    log_id: logId,
    item_id: `${logId}-item`,
    item_name: itemName,
    transaction_type: "PRODUCE",
    quantity_change: 1,
    quantity_before: 0,
    quantity_after: 1,
    transfer_qty: null,
    reference_no: null,
    operation_batch_id: "batch-1",
    created_at: "2026-07-10T01:00:00Z",
    cancelled,
    cancel_reason: cancelled ? "cancelled successfully" : null,
    cancelled_by: cancelled ? "employee-1" : null,
    cancelled_at: cancelled ? "2026-07-10T02:00:00Z" : null,
  } as TransactionLog;
}

function ScopeHarness({ visibleLogs }: { visibleLogs: TransactionLog[] }) {
  const scope = useHistoryCancellationScopeLogs({
    panelOpen: true,
    identity: "batch:batch-1",
    visibleLogs,
    operationBatchId: "batch-1",
  });
  return (
    <div data-testid="scope-state" data-status={scope.status}>
      {scope.logs.map((log) => `${log.log_id}:${log.item_name}:${log.cancelled}`).join("|")}
    </div>
  );
}

beforeEach(() => {
  vi.mocked(productionApi.getTransactions).mockReset();
});

describe("HistoryCancelAction", () => {
  it("preserves hidden exact-scope logs while synchronizing visible cancellation", async () => {
    const visible = makeScopeLog("visible", "visible-item");
    const hidden = makeScopeLog("hidden", "hidden-item");
    vi.mocked(productionApi.getTransactions).mockResolvedValue([visible, hidden]);
    const { rerender } = render(<ScopeHarness visibleLogs={[visible]} />);

    await waitFor(() => {
      expect(screen.getByTestId("scope-state")).toHaveAttribute("data-status", "ready");
      expect(screen.getByTestId("scope-state")).toHaveTextContent("hidden:hidden-item:false");
    });

    rerender(<ScopeHarness visibleLogs={[makeScopeLog("visible", "visible-item", true)]} />);

    await waitFor(() => {
      expect(screen.getByTestId("scope-state")).toHaveTextContent("visible:visible-item:true");
      expect(screen.getByTestId("scope-state")).toHaveTextContent("hidden:hidden-item:true");
    });
    expect(productionApi.getTransactions).toHaveBeenCalledTimes(1);
  });

  it("uses the same confirmation structure for single and batch scopes", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <HistoryCancelAction
        panelOpen
        identity="log:log-1"
        scope="single"
        effects={effects}
        cancelled={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    expect(screen.getByText("취소 범위 확인")).toBeInTheDocument();
    expect(screen.getByText("조립 생산")).toBeInTheDocument();
    expect(screen.getByText("-2 EA")).toBeInTheDocument();
    expect(screen.getByLabelText("취소 사유")).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소 확정" })).toBeInTheDocument();

    rerender(
      <HistoryCancelAction
        panelOpen
        identity="batch:batch-1"
        scope="batch"
        effects={effects}
        cancelled={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 작업 묶음 전체 취소" }));
    expect(screen.getByText("취소 범위 확인")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소 확정" })).toBeInTheDocument();
  });

  it("clears reason and PIN on close, identity change, and successful submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const props = {
      scope: "single" as const,
      effects,
      cancelled: false,
      onSubmit,
    };
    const { rerender } = render(
      <HistoryCancelAction panelOpen identity="log:log-1" {...props} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "첫 사유" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });

    rerender(<HistoryCancelAction panelOpen={false} identity="log:log-1" {...props} />);
    rerender(<HistoryCancelAction panelOpen identity="log:log-1" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    expect(screen.getByLabelText("취소 사유")).toHaveValue("");
    expect(screen.getByLabelText("PIN")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "둘째 사유" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "5678" } });
    rerender(<HistoryCancelAction panelOpen identity="log:log-2" {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    expect(screen.getByLabelText("취소 사유")).toHaveValue("");
    expect(screen.getByLabelText("PIN")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "최종 사유" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ reason: "최종 사유", pin: "9999" });
      expect(screen.getByRole("button", { name: "이 이력 1건 취소" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    expect(screen.getByLabelText("취소 사유")).toHaveValue("");
    expect(screen.getByLabelText("PIN")).toHaveValue("");
  });

  it("blocks duplicate submissions while the first request is pending", async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    render(
      <HistoryCancelAction
        panelOpen
        identity="batch:batch-1"
        scope="batch"
        effects={effects}
        cancelled={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 작업 묶음 전체 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "중복 방지" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    const submit = screen.getByRole("button", { name: "취소 확정" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolveSubmit();
    await waitFor(() => expect(screen.getByRole("button", { name: "이 작업 묶음 전체 취소" })).toBeInTheDocument());
  });

  it("keeps the request lock while the same panel is closed and reopened", async () => {
    let resolveFirst: () => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const props = {
      identity: "log:log-1",
      scope: "single" as const,
      effects,
      cancelled: false,
      onSubmit,
    };
    const { rerender } = render(<HistoryCancelAction panelOpen {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "첫 요청" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    rerender(<HistoryCancelAction panelOpen={false} {...props} />);
    rerender(<HistoryCancelAction panelOpen {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "두 번째 시도" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolveFirst();
    await waitFor(() => expect(screen.getByLabelText("취소 사유")).toHaveValue("두 번째 시도"));
  });

  it("keeps the request lock when a closed panel unmounts and remounts the same target", async () => {
    let resolveFirst: () => void = () => {};
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }),
    );
    const props = {
      panelOpen: true,
      identity: "log:log-1",
      scope: "single" as const,
      effects,
      cancelled: false,
      onSubmit,
    };
    const firstMount = render(<HistoryCancelAction {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "첫 요청" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    firstMount.unmount();
    render(<HistoryCancelAction {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "재열기" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolveFirst();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("does not let a late response overwrite a newly selected target form", async () => {
    let resolveFirst: () => void = () => {};
    const onSubmit = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValue(undefined);
    const baseProps = {
      panelOpen: true,
      scope: "single" as const,
      effects,
      cancelled: false,
      onSubmit,
    };
    const { rerender } = render(
      <HistoryCancelAction identity="log:log-1" {...baseProps} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "이전 대상" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));

    rerender(<HistoryCancelAction identity="log:log-2" {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "이 이력 1건 취소" }));
    fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "새 대상" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "5678" } });
    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    resolveFirst();
    await waitFor(() => {
      expect(screen.getByLabelText("취소 사유")).toHaveValue("새 대상");
      expect(screen.getByLabelText("PIN")).toHaveValue("5678");
    });

    fireEvent.click(screen.getByRole("button", { name: "취소 확정" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  });
});
