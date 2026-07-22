import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DesktopWarehouseView } from "../DesktopWarehouseView";

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
  IoComposeView: ({ onItemConversionFocusChange }: { onItemConversionFocusChange: (focused: boolean) => void }) => (
    <button type="button" onClick={() => onItemConversionFocusChange(true)}>
      품목 전환 포커스
    </button>
  ),
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
    expect(params.get("section")).toBeNull();
    expect(params.get("step")).toBeNull();
  });
});
