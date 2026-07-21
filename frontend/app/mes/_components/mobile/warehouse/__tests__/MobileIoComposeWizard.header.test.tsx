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
  setNotes: vi.fn(),
  goPrev: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { getAllBOM: vi.fn(() => new Promise(() => {})) },
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
