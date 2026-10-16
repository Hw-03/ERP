import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesktopWarehouseView } from "../DesktopWarehouseView";

const currentComposeProps = vi.hoisted(() => ({
  value: null as null | {
    restoreDraft?: { batch_id: string } | null;
    restoreStep?: number;
    itemPickerFullscreen?: boolean;
    onItemPickerFullscreenChange?: (fullscreen: boolean) => void;
    onDraftSaved?: (batchId: string, step: number, persistInUrl?: boolean) => void;
    onNewWork?: () => void;
  },
}));

const currentWorkAreaProps = vi.hoisted(() => ({
  value: null as null | {
    onEmptyStateChange?: (empty: boolean) => void;
    targetRequestId?: string | null;
  },
}));

const apiMocks = vi.hoisted(() => ({
  listStockRequestDrafts: vi.fn(),
  listDrafts: vi.fn(),
  countAsResearchQueue: vi.fn(),
  countWarehouseQueue: vi.fn(),
  countDepartmentQueue: vi.fn(),
}));

const operatorState = vi.hoisted(() => ({
  value: {
    employee_id: "emp-1",
    warehouse_role: "none",
    department_role: "none",
    department: "조립",
    as_research_approver: false,
  },
}));

vi.mock("@/lib/api", () => ({ api: apiMocks }));

vi.mock("@/app/mes/_components/_warehouse_hooks/useWarehouseData", () => ({
  useWarehouseData: () => ({
    employees: [],
    items: [],
    productModels: [],
    loadFailure: null,
    setItems: vi.fn(),
  }),
}));

vi.mock("@/app/mes/_components/_warehouse_sections/WarehouseHeader", () => ({
  WarehouseHeader: () => <div />,
}));

vi.mock("@/app/mes/_components/_warehouse_sections/WarehouseDraftPanelTabs", () => ({
  WarehouseDraftPanelTabs: ({
    sectionTab,
    onContinueIoDraft,
    onEmptyStateChange,
    targetRequestId,
    canSeeQueue, canSeeDeptQueue, canSeeAsResearchQueue,
  }: {
    sectionTab: string;
    onContinueIoDraft?: (draft: never) => void;
    onEmptyStateChange?: (empty: boolean) => void;
    targetRequestId?: string | null;
    canSeeQueue: boolean; canSeeDeptQueue: boolean; canSeeAsResearchQueue: boolean;
  }) => {
    currentWorkAreaProps.value = { onEmptyStateChange, targetRequestId };
    if (sectionTab === "compose") return null;
    if ((sectionTab === "queue" && !canSeeQueue) || (sectionTab === "dept-queue" && !canSeeDeptQueue) || (sectionTab === "as-research-queue" && !canSeeAsResearchQueue)) return null;

    return (
      <>
        <button
          type="button"
          onClick={() => onContinueIoDraft?.({ batch_id: "draft-2", sub_type: "adjust_out" } as never)}
        >
          continue draft
        </button>
        <button type="button" onClick={() => onEmptyStateChange?.(true)}>set empty</button>
        <button type="button" onClick={() => onEmptyStateChange?.(false)}>set populated</button>
      </>
    );
  },
}));

vi.mock("@/app/mes/_components/_warehouse_v2/IoComposeView", () => ({
  IoComposeView: (props: {
    onItemConversionFocusChange: (focused: boolean) => void;
    restoreDraft?: { batch_id: string } | null;
    restoreStep?: number;
    onDraftSaved?: (batchId: string, step: number, persistInUrl?: boolean) => void;
  }) => {
    currentComposeProps.value = props;
    return (
      <div data-testid="io-compose-view">
        <input aria-label="작성 중인 수량" defaultValue="7" />
        <button type="button" data-testid="item-conversion-focus" onClick={() => props.onItemConversionFocusChange(true)}>
          품목 전환 포커스
        </button>
      </div>
    );
  },
}));

vi.mock("@/app/mes/_components/login/useCurrentOperator", () => ({
  readCurrentOperator: () => operatorState.value,
}));

describe("DesktopWarehouseView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=mine");
    apiMocks.listStockRequestDrafts.mockReset();
    apiMocks.listDrafts.mockReset();
    apiMocks.countAsResearchQueue.mockReset();
    apiMocks.listStockRequestDrafts.mockReturnValue(new Promise(() => {}));
    apiMocks.listDrafts.mockReturnValue(new Promise(() => {}));
    apiMocks.countAsResearchQueue.mockResolvedValue({ count: 0 });
    apiMocks.countWarehouseQueue.mockReset().mockReturnValue(new Promise(() => {}));
    apiMocks.countDepartmentQueue.mockReset().mockReturnValue(new Promise(() => {}));
    operatorState.value = {
      employee_id: "emp-1",
      warehouse_role: "none",
      department_role: "none",
      department: "조립",
      as_research_approver: false,
    };
    currentComposeProps.value = null;
    currentWorkAreaProps.value = null;
  });

  it("내 요청 URL로 직접 진입해도 상단 기본 탭 3개를 표시한다", () => {
    render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    const tabs = screen.getAllByRole("tab");

    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("요청 작성");
    expect(tabs[1]).toHaveTextContent("작성 중");
    expect(tabs[2]).toHaveTextContent("내 요청");
    tabs.forEach((tab) => expect(tab).toBeVisible());
  });

  it.each(["queue", "dept-queue", "as-research-queue"])("열린 %s 역할 회수는 빈 업무영역 대신 기본 요청으로 복구한다", (section) => {
    apiMocks.countAsResearchQueue.mockReturnValue(new Promise(() => {}));
    operatorState.value = { ...operatorState.value, warehouse_role: "primary", department_role: "deputy", as_research_approver: true };
    const historyState = { __NA: true, tree: ["mes"], mobileShippingIndex: 4 };
    window.history.replaceState(historyState, "", `/mes?tab=warehouse&section=${section}&stockRequestId=old-request`);
    const view = render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "continue draft" })).toBeInTheDocument();
    expect(screen.queryByTestId("io-compose-view")).not.toBeInTheDocument();
    operatorState.value = { ...operatorState.value, ...(section === "queue" ? { warehouse_role: "none" } : section === "dept-queue" ? { department_role: "none" } : { as_research_approver: false }) };
    view.rerender(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    expect(screen.getByTestId("io-compose-view")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "continue draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /요청 작성/ })).toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe("?tab=warehouse");
    expect(window.history.state).toMatchObject(historyState);
  });

  it("작성 중 기본 요청에서 역할 갱신은 입력과 복원 URL을 초기화하지 않는다", () => {
    operatorState.value = { ...operatorState.value, warehouse_role: "primary" };
    window.history.replaceState({ __NA: true }, "", "/mes?tab=warehouse&step=3");
    const view = render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    const input = screen.getByLabelText("작성 중인 수량");
    fireEvent.change(input, { target: { value: "13" } });
    operatorState.value = { ...operatorState.value, warehouse_role: "none" };
    view.rerender(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    expect(screen.getByLabelText("작성 중인 수량")).toBe(input);
    expect(input).toHaveValue("13");
    expect(window.location.search).toBe("?tab=warehouse&step=3");
  });

  it("AS·연구 권한 없이 전용 딥링크로 진입하면 승인함과 패널을 열지 않는다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=as-research-queue");

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.queryByRole("tab", { name: /AS·연구 승인함/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("io-compose-view")).toBeInTheDocument();
  });

  it("AS·연구 승인함도 다른 승인함처럼 남은 작업 영역 높이를 사용한다", () => {
    operatorState.value = { ...operatorState.value, as_research_approver: true };
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=as-research-queue");

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.getByTestId("warehouse-section-work-area")).toHaveClass("flex-1", "min-h-0");
  });

  it("AS·연구 승인 알림의 stockRequestId를 전용 대기열에 전달한다", () => {
    operatorState.value = { ...operatorState.value, as_research_approver: true };
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=as-research-queue&stockRequestId=as-request-1");

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    expect(currentWorkAreaProps.value?.targetRequestId).toBe("as-request-1");
  });

  it("keeps the section tabs sticky above a long Mine list", () => {
    const { container } = render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="tablist"]')?.parentElement).toHaveClass(
      "sticky",
      "top-0",
      "z-20",
      "shrink-0",
    );
  });

  it("keeps warehouse section tabs free of inset elevation", () => {
    render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    screen.getAllByRole("tab").forEach((tab) => expect(tab).toHaveClass("no-btn-inset"));
  });

  it("uses only the shared shell spacing above the section tabs", () => {
    const { container } = render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    const contentRoot = screen.getByTestId("desktop-warehouse-content");

    expect(contentRoot).toHaveClass("pt-0", "gap-3");
    expect(contentRoot).not.toHaveClass("pt-2.5");
  });

  it("keeps cart work area in the remaining desktop height", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart");

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    expect(screen.getByTestId("warehouse-section-work-area")).toHaveClass("flex-1", "min-h-0");
  });

  it("removes bottom scroll space only while a work-area panel is empty", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart");
    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    const contentRoot = screen.getByTestId("desktop-warehouse-content");
    expect(contentRoot).toHaveClass("pb-10");

    fireEvent.click(screen.getByRole("button", { name: "set empty" }));
    expect(contentRoot).toHaveClass("pb-0");
    expect(contentRoot).not.toHaveClass("pb-10");

    fireEvent.click(screen.getByRole("button", { name: "set populated" }));
    expect(contentRoot).toHaveClass("pb-10");
  });

  it("keeps empty work-area spacing when its active tab is clicked again", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart");
    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "set empty" }));
    expect(screen.getByTestId("desktop-warehouse-content")).toHaveClass("pb-0");

    fireEvent.click(screen.getByRole("tab", { name: /작성 중/ }));

    expect(screen.getByTestId("desktop-warehouse-content")).toHaveClass("pb-0");
  });

  it("keeps empty work-area spacing for a same-section popstate", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart");
    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "set empty" }));
    expect(screen.getByTestId("desktop-warehouse-content")).toHaveClass("pb-0");

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(screen.getByTestId("desktop-warehouse-content")).toHaveClass("pb-0");
  });

  it("restores bottom scroll space when popstate enters a work-area panel", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart");
    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "set empty" }));
    expect(screen.getByTestId("desktop-warehouse-content")).toHaveClass("pb-0");

    window.history.replaceState(null, "", "/mes?tab=warehouse&section=mine");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(screen.getByTestId("desktop-warehouse-content")).toHaveClass("pb-10");
  });

  it("요청 작성에서는 섹션 탭 다음에 작성 본문을 바로 렌더한다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose");
    const { container } = render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    const tabSlot = container.querySelector('[role="tablist"]')?.parentElement;
    const composeContent = screen.getByTestId("io-compose-view").parentElement;

    expect(tabSlot?.nextElementSibling).toBe(composeContent);
  });

  it("요청 작성의 품목 전환 포커스에서는 상단 탭을 숨긴다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const { container } = render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "품목 전환 포커스" }));

    expect(container.querySelector('[role="tablist"]')?.parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("품목 선택 전체 화면에서는 입출고 섹션 탭을 DOM에서 제거한다", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const { container } = render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
        itemPickerFullscreen
      />,
    );

    expect(container.querySelector('[role="tablist"]')).not.toBeInTheDocument();
  });

  it("passes fullscreen state and its handler to the compose view", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const onItemPickerFullscreenChange = vi.fn();

    render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
        itemPickerFullscreen
        onItemPickerFullscreenChange={onItemPickerFullscreenChange}
      />,
    );

    expect(currentComposeProps.value?.itemPickerFullscreen).toBe(true);
    currentComposeProps.value?.onItemPickerFullscreenChange?.(false);
    expect(onItemPickerFullscreenChange).toHaveBeenCalledWith(false);
  });

  it("clears item conversion focus when leaving for Mine", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const { container } = render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("item-conversion-focus"));
    fireEvent.click(screen.getAllByRole("tab", { hidden: true })[2]);

    expect(container.querySelector('[role="tablist"]')?.parentElement).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(screen.getAllByRole("tab")[0]);

    expect(container.querySelector('[role="tablist"]')?.parentElement).toHaveAttribute("aria-hidden", "false");
  });

  it("clears item conversion focus when popstate moves from compose to Mine", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse");
    const { container } = render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("item-conversion-focus"));
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=mine");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(container.querySelector('[role="tablist"]')?.parentElement).toHaveAttribute("aria-hidden", "false");
    const mineTabs = screen.getAllByRole("tab");
    expect(mineTabs).toHaveLength(3);
    mineTabs.forEach((tab) => expect(tab).toBeVisible());
    fireEvent.click(mineTabs[0]);
    expect(container.querySelector('[role="tablist"]')?.parentElement).toHaveAttribute("aria-hidden", "false");
  });

  it("clears a cart step before restoring another draft", () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=cart&step=4");
    render(
      <DesktopWarehouseView
        globalSearch=""
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "continue draft" }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("section")).toBe("compose");
    expect(params.get("step")).toBe("4");
    expect(params.get("draftId")).toBe("draft-2");
  });

  it("새 작업 전환용 원 초안 저장은 URL draftId를 남기지 않는다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=source-draft");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "source-draft" }]);
    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    await waitFor(() => expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("source-draft"));
    act(() => currentComposeProps.value?.onDraftSaved?.("source-draft", 4, false));

    const params = new URLSearchParams(window.location.search);
    expect(params.get("draftId")).toBeNull();
    expect(params.get("section")).toBe("compose");
    expect(params.get("step")).toBe("4");
    expect(currentComposeProps.value?.restoreDraft).toBeNull();
  });

  it("새 작업은 부모 초안 복원 추적을 해제하며 같은 저장 초안을 다시 복원할 수 있다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=saved-draft");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "saved-draft" }]);
    const { rerender } = render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    await waitFor(() => expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("saved-draft"));
    act(() => {
      window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=2");
      currentComposeProps.value?.onNewWork?.();
    });
    expect(currentComposeProps.value?.restoreDraft).toBeNull();
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=saved-draft");
    rerender(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    await waitFor(() => expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("saved-draft"));
  });

  it("늦게 끝난 A 전환은 현재 B draftId를 지우지 않는다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-a");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "draft-a" }, { batch_id: "draft-b" }]);
    const { rerender } = render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    await waitFor(() => expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-a"));
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-b");
    rerender(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);
    await waitFor(() => expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-b"));
    act(() => currentComposeProps.value?.onDraftSaved?.("draft-a", 4, false));
    expect(new URLSearchParams(window.location.search).get("draftId")).toBe("draft-b");
    expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-b");
  });

  it("restores the URL draft even when the legacy draft count fails", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1");
    apiMocks.listStockRequestDrafts.mockRejectedValue(new Error("legacy unavailable"));
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "draft-1" }]);

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("item-conversion-focus")).toBeInTheDocument());
    expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-1");
    expect(currentComposeProps.value?.restoreStep).toBe(4);
  });

  it("늦은 URL 초안 응답은 선택한 작성 중 탭을 요청 작성으로 되돌리지 않는다", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=saved-draft");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    let resolveDrafts!: (rows: { batch_id: string }[]) => void;
    apiMocks.listDrafts.mockReturnValue(new Promise<{ batch_id: string }[]>((resolve) => { resolveDrafts = resolve; }));
    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: /작성 중/ }));
    expect(screen.getByRole("tab", { name: /작성 중/ })).toHaveAttribute("aria-selected", "true");
    await act(async () => resolveDrafts([{ batch_id: "saved-draft" }]));

    expect(screen.getByRole("tab", { name: /작성 중/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "continue draft" })).toBeInTheDocument();
    expect(screen.queryByTestId("io-compose-view")).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("section")).toBe("cart");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "continue draft" })));
    expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-2");
    expect(screen.getByRole("tab", { name: /요청 작성/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps a URL draft restore error visible and retries instead of opening a blank compose", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=3&draftId=draft-1");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts
      .mockRejectedValueOnce(new Error("draft unavailable"))
      .mockResolvedValueOnce([{ batch_id: "draft-1" }]);

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("저장한 작업을 불러오지 못했습니다.");
    expect(screen.queryByTestId("item-conversion-focus")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-1"));
    expect(apiMocks.listDrafts).toHaveBeenCalledTimes(2);
  });

  it("does not open a blank compose when the URL draft no longer exists", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=2&draftId=missing");
    apiMocks.listStockRequestDrafts.mockResolvedValue([]);
    apiMocks.listDrafts.mockResolvedValue([]);

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("저장한 작업을 찾을 수 없습니다.");
    expect(screen.queryByTestId("item-conversion-focus")).not.toBeInTheDocument();
  });
});
