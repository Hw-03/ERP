import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileWarehouseScreen } from "../MobileWarehouseScreen";

const currentWizardProps = vi.hoisted(() => ({
  value: null as null | {
    onStepChange?: (step: number) => void;
    restoreDraft?: { batch_id: string } | null;
    restoreStep?: number;
    onDraftSaved?: (batchId: string, step: number, persistInUrl?: boolean) => void;
  },
}));

const currentTabsProps = vi.hoisted(() => ({
  showAsResearchQueue: undefined as boolean | undefined,
  active: undefined as string | undefined,
}));

const operatorState = vi.hoisted(() => ({
  value: {
    employee_id: "emp-1",
    name: "Kim",
    department: "Assembly",
    warehouse_role: "none",
    department_role: "none",
    as_research_approver: false,
  },
}));

const apiMocks = vi.hoisted(() => ({
  listStockRequestDrafts: vi.fn(),
  listDrafts: vi.fn(),
  countAsResearchQueue: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMocks,
}));

vi.mock("../../../_warehouse_hooks/useWarehouseData", () => ({
  useWarehouseData: () => ({
    employees: [],
    items: [],
    productModels: [],
    loadFailure: null,
    setItems: vi.fn(),
  }),
}));

vi.mock("../../../login/useCurrentOperator", () => ({
  readCurrentOperator: () => operatorState.value,
}));

vi.mock("../../../_warehouse_sections/WarehouseHeader", () => ({
  WarehouseHeader: () => <div data-testid="warehouse-header" />,
}));

vi.mock("../../../_warehouse_sections/WarehouseSectionTabs", () => ({
  WarehouseSectionTabs: ({ onChange, showAsResearchQueue, active }: { onChange: (next: string) => void; showAsResearchQueue?: boolean; active: string }) => {
    currentTabsProps.showAsResearchQueue = showAsResearchQueue;
    currentTabsProps.active = active;
    return (
    <div data-testid="warehouse-section-tabs">
      <button type="button" onClick={() => onChange("compose")}>
        compose
      </button>
      <button type="button" onClick={() => onChange("cart")}>
        cart
      </button>
      <button type="button" onClick={() => onChange("mine")}>
        mine
      </button>
    </div>
    );
  },
}));

vi.mock("../../../_warehouse_sections/WarehouseDraftPanelTabs", () => ({
  WarehouseDraftPanelTabs: ({ onContinueIoDraft, sectionTab, targetRequestId }: { onContinueIoDraft?: (draft: never) => void; sectionTab: string; targetRequestId?: string | null }) => (
    <div data-testid="draft-panels" data-section-tab={sectionTab} data-target-request-id={targetRequestId ?? ""}>
      <button
        type="button"
        onClick={() => onContinueIoDraft?.({ batch_id: "adjust-draft", sub_type: "adjust_out" } as never)}
      >
        continue adjust draft
      </button>
    </div>
  ),
}));

vi.mock("../../warehouse/MobileDirtyLeaveSheet", () => ({
  MobileDirtyLeaveSheet: () => null,
}));

vi.mock("../../warehouse/MobileIoComposeWizard", () => ({
  MobileIoComposeWizard: (props: {
    onStepChange?: (step: number) => void;
    restoreDraft?: { batch_id: string } | null;
    restoreStep?: number;
    onDraftSaved?: (batchId: string, step: number, persistInUrl?: boolean) => void;
  }) => {
    currentWizardProps.value = props;
    return <div data-testid="compose-wizard" />;
  },
}));

describe("MobileWarehouseScreen compact step header", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose");
    apiMocks.listStockRequestDrafts.mockReset();
    apiMocks.listDrafts.mockReset();
    apiMocks.countAsResearchQueue.mockReset();
    apiMocks.listStockRequestDrafts.mockReturnValue(new Promise(() => {}));
    apiMocks.listDrafts.mockReturnValue(new Promise(() => {}));
    apiMocks.countAsResearchQueue.mockResolvedValue({ count: 0 });
    currentWizardProps.value = null;
    currentTabsProps.showAsResearchQueue = undefined;
    currentTabsProps.active = undefined;
    operatorState.value = {
      employee_id: "emp-1",
      name: "Kim",
      department: "Assembly",
      warehouse_role: "none",
      department_role: "none",
      as_research_approver: false,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("새 작업 전환용 원 초안 저장은 URL과 복원 상태를 함께 지운다", async () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=source-draft");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "source-draft" }]);
    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    await waitFor(() => expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("source-draft"));
    act(() => currentWizardProps.value?.onDraftSaved?.("source-draft", 4, false));

    expect(new URLSearchParams(window.location.search).get("draftId")).toBeNull();
    expect(currentWizardProps.value?.restoreDraft).toBeNull();
  });

  it("전용 권한 없이 AS·연구 승인함 딥링크를 열어도 탭과 패널을 노출하지 않는다", () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=as-research-queue");

    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    expect(currentTabsProps.showAsResearchQueue).toBe(false);
    expect(screen.getByTestId("compose-wizard")).toBeInTheDocument();
    expect(screen.queryByTestId("draft-panels")).not.toBeInTheDocument();
  });

  it("권한 있는 AS·연구 승인 알림은 전용 대기열과 대상 요청을 연다", () => {
    operatorState.value = { ...operatorState.value, as_research_approver: true };

    render(
      <MobileWarehouseScreen
        globalSearch=""
        onStatusChange={() => {}}
        notificationSection="as-research-queue"
        targetRequestId="as-request-1"
      />,
    );

    expect(currentTabsProps.active).toBe("as-research-queue");
    expect(screen.getByTestId("draft-panels")).toHaveAttribute("data-section-tab", "as-research-queue");
    expect(screen.getByTestId("draft-panels")).toHaveAttribute("data-target-request-id", "as-request-1");
  });

  it("수동 입출고 초안 이어서 작업은 수량 조정 단계로 이동한다", () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=mine");
    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "mine" }));
    fireEvent.click(screen.getByRole("button", { name: "continue adjust draft" }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("section")).toBe("compose");
    expect(params.get("step")).toBe("4");
    expect(params.get("draftId")).toBe("adjust-draft");
  });

  it("늦게 끝난 A 전환은 현재 B draftId와 복원 상태를 지우지 않는다", async () => {
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-a");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "draft-a" }, { batch_id: "draft-b" }]);
    const { rerender } = render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);
    await waitFor(() => expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("draft-a"));
    window.history.replaceState({}, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-b");
    rerender(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);
    await waitFor(() => expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("draft-b"));
    act(() => currentWizardProps.value?.onDraftSaved?.("draft-a", 4, false));
    expect(new URLSearchParams(window.location.search).get("draftId")).toBe("draft-b");
    expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("draft-b");
  });

  it("hides section tabs only while compose is past step 1", () => {
    vi.useFakeTimers();
    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);
    const sectionTabsSlot = () => document.querySelector(".wt");

    expect(sectionTabsSlot()).toHaveClass("wo");
    expect(screen.getByTestId("warehouse-section-tabs")).toBeInTheDocument();

    act(() => {
      currentWizardProps.value?.onStepChange?.(2);
    });
    expect(sectionTabsSlot()).toHaveClass("wc");
    expect(sectionTabsSlot()).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("warehouse-section-tabs")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.getByTestId("warehouse-section-tabs")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(sectionTabsSlot()).not.toBeInTheDocument();
    expect(screen.queryByTestId("warehouse-section-tabs")).not.toBeInTheDocument();

    act(() => {
      currentWizardProps.value?.onStepChange?.(1);
    });
    expect(sectionTabsSlot()).toHaveClass("wo");
    expect(screen.getByTestId("warehouse-section-tabs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "cart" }));
    expect(screen.getByTestId("warehouse-section-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("draft-panels")).toBeInTheDocument();
  });

  it("restores the URL draft and exact step after a responsive shell change", async () => {
    window.history.replaceState(
      {},
      "",
      "/mes?tab=warehouse&section=compose&step=5&draftId=draft-1",
    );
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "draft-1" }]);

    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    expect(screen.getByText("저장한 작업을 불러오는 중입니다.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("compose-wizard")).toBeInTheDocument());
    expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("draft-1");
    expect(currentWizardProps.value?.restoreStep).toBe(5);
  });

  it("restores the URL draft even when the legacy draft count fails", async () => {
    window.history.replaceState(
      {},
      "",
      "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1",
    );
    apiMocks.listStockRequestDrafts.mockRejectedValue(new Error("legacy unavailable"));
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "draft-1" }]);

    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("compose-wizard")).toBeInTheDocument());
    expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("draft-1");
    expect(currentWizardProps.value?.restoreStep).toBe(4);
  });

  it("keeps a URL draft restore error visible and retries instead of opening a blank compose", async () => {
    window.history.replaceState(
      {},
      "",
      "/mes?tab=warehouse&section=compose&step=3&draftId=draft-1",
    );
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts
      .mockRejectedValueOnce(new Error("draft unavailable"))
      .mockResolvedValueOnce([{ batch_id: "draft-1" }]);

    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("저장한 작업을 불러오지 못했습니다.");
    expect(screen.queryByTestId("compose-wizard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(currentWizardProps.value?.restoreDraft?.batch_id).toBe("draft-1"));
    expect(apiMocks.listDrafts).toHaveBeenCalledTimes(2);
  });

  it("does not open a blank compose when the URL draft no longer exists", async () => {
    window.history.replaceState(
      {},
      "",
      "/mes?tab=warehouse&section=compose&step=2&draftId=missing",
    );
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([]);

    render(<MobileWarehouseScreen globalSearch="" onStatusChange={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("저장한 작업을 찾을 수 없습니다.");
    expect(screen.queryByTestId("compose-wizard")).not.toBeInTheDocument();
  });
});
