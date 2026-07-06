import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileWarehouseScreen } from "../MobileWarehouseScreen";

const currentWizardProps = vi.hoisted(() => ({
  value: null as null | { onStepChange?: (step: number) => void },
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
  readCurrentOperator: () => ({
    employee_id: "emp-1",
    name: "Kim",
    department: "Assembly",
    warehouse_role: "none",
    department_role: "none",
  }),
}));

vi.mock("../../../_warehouse_sections/WarehouseHeader", () => ({
  WarehouseHeader: () => <div data-testid="warehouse-header" />,
}));

vi.mock("../../../_warehouse_sections/WarehouseSectionTabs", () => ({
  WarehouseSectionTabs: ({ onChange }: { onChange: (next: string) => void }) => (
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
  ),
}));

vi.mock("../../../_warehouse_sections/WarehouseDraftPanelTabs", () => ({
  WarehouseDraftPanelTabs: () => <div data-testid="draft-panels" />,
}));

vi.mock("../../warehouse/MobileDirtyLeaveSheet", () => ({
  MobileDirtyLeaveSheet: () => null,
}));

vi.mock("../../warehouse/MobileIoComposeWizard", () => ({
  MobileIoComposeWizard: (props: { onStepChange?: (step: number) => void }) => {
    currentWizardProps.value = props;
    return <div data-testid="compose-wizard" />;
  },
}));

describe("MobileWarehouseScreen compact step header", () => {
  afterEach(() => {
    vi.useRealTimers();
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
});
