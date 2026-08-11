import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileIoComposeWizard } from "../MobileIoComposeWizard";

const wizardState = vi.hoisted(() => ({
  step: 5,
  workType: "warehouse_io",
  subType: "warehouse_to_dept",
  fromDepartment: null,
  toDepartment: "조립",
  bundles: [],
  notes: "",
  hasShortage: false,
  hasInvalidQuantity: false,
  canAdvance: { 4: false },
  setBundles: vi.fn(),
  setNotes: vi.fn(),
  goTo: vi.fn(),
  goPrev: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getAllBOM: vi.fn(() => new Promise(() => {})),
    getItems: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock("../../../_warehouse_v2/useIoWorkState", () => ({
  useIoWorkState: () => wizardState,
}));

vi.mock("../../../_warehouse_v2/useIoDraftRestore", () => ({
  useIoDraftRestore: () => {},
}));

vi.mock("../../../_warehouse_v2/useIoDraft", () => ({
  useIoDraft: () => ({ drafting: false, saveDraft: vi.fn() }),
}));

vi.mock("../../../_warehouse_v2/useIoPreview", () => ({
  useIoPreview: () => ({ previewing: false, previewTarget: vi.fn() }),
}));

vi.mock("../../../_warehouse_v2/useIoSubmit", () => ({
  useIoSubmit: () => ({ submitting: false, submit: vi.fn() }),
}));

describe("MobileIoComposeWizard Step 5 헤더", () => {
  it("4단계를 수량 조정으로 안내한다", () => {
    const originalStep = wizardState.step;
    wizardState.step = 4;
    try {
      render(
        <MobileIoComposeWizard
          globalSearch=""
          operator={null}
          items={[]}
          setItems={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );

      expect(screen.getByText("수량 조정")).toBeInTheDocument();
      expect(screen.queryByText("품목 확인")).not.toBeInTheDocument();
    } finally {
      wizardState.step = originalStep;
    }
  });

  it("keeps 24px of content padding on the work-type step for the common tab-bar gap", () => {
    const originalStep = wizardState.step;
    wizardState.step = 1;
    try {
      render(
        <MobileIoComposeWizard
          globalSearch=""
          operator={null}
          items={[]}
          setItems={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );

      const workTypeButton = screen.getByRole("button", { name: /부서 입출고/ });
      expect(workTypeButton.parentElement?.parentElement).toHaveClass("pb-6");
    } finally {
      wizardState.step = originalStep;
    }
  });

  it("최종 확인에서는 본문 카드와 겹치는 하단 구분선을 렌더하지 않는다", () => {
    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={null}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const title = screen.getByText("최종 확인");
    const header = title.parentElement?.parentElement;
    expect(header).not.toBeNull();
    expect(header).not.toHaveClass("border-b");
  });
});
