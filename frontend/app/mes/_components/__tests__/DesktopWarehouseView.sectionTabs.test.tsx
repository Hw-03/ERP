import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DesktopWarehouseView } from "../DesktopWarehouseView";

const currentComposeProps = vi.hoisted(() => ({
  value: null as null | {
    restoreDraft?: { batch_id: string } | null;
    restoreStep?: number;
  },
}));

const apiMocks = vi.hoisted(() => ({
  listStockRequestDrafts: vi.fn(),
  listDrafts: vi.fn(),
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
    onContinueIoDraft,
  }: {
    onContinueIoDraft?: (draft: never) => void;
  }) => (
    <button
      type="button"
      onClick={() => onContinueIoDraft?.({ batch_id: "draft-2" } as never)}
    >
      continue draft
    </button>
  ),
}));

vi.mock("@/app/mes/_components/_warehouse_v2/IoComposeView", () => ({
  IoComposeView: (props: {
    onItemConversionFocusChange: (focused: boolean) => void;
    restoreDraft?: { batch_id: string } | null;
    restoreStep?: number;
  }) => {
    currentComposeProps.value = props;
    return (
      <button type="button" data-testid="item-conversion-focus" onClick={() => props.onItemConversionFocusChange(true)}>
        품목 전환 포커스
      </button>
    );
  },
}));

vi.mock("@/app/mes/_components/login/useCurrentOperator", () => ({
  readCurrentOperator: () => ({
    employee_id: "emp-1",
    warehouse_role: "none",
    department_role: "none",
    department: "조립",
  }),
}));

describe("DesktopWarehouseView", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=mine");
    apiMocks.listStockRequestDrafts.mockReset();
    apiMocks.listDrafts.mockReset();
    apiMocks.listStockRequestDrafts.mockReturnValue(new Promise(() => {}));
    apiMocks.listDrafts.mockReturnValue(new Promise(() => {}));
    currentComposeProps.value = null;
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

  it("restores the URL draft even when the legacy draft count fails", async () => {
    window.history.replaceState(null, "", "/mes?tab=warehouse&section=compose&step=4&draftId=draft-1");
    apiMocks.listStockRequestDrafts.mockRejectedValue(new Error("legacy unavailable"));
    apiMocks.listDrafts.mockResolvedValue([{ batch_id: "draft-1" }]);

    render(<DesktopWarehouseView globalSearch="" onStatusChange={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("item-conversion-focus")).toBeInTheDocument());
    expect(currentComposeProps.value?.restoreDraft?.batch_id).toBe("draft-1");
    expect(currentComposeProps.value?.restoreStep).toBe(4);
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
