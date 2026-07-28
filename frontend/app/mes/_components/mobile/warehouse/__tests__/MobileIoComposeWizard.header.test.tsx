import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  goTo: vi.fn(),
}));

const saveDraftMock = vi.hoisted(() => vi.fn());

vi.mock("../../../_warehouse_v2/IoConfirmStep", () => ({
  IoConfirmStep: ({ onSaveDraft }: { onSaveDraft: () => Promise<void> }) => (
    <button type="button" onClick={() => void onSaveDraft()}>save draft</button>
  ),
}));

vi.mock("../MobileSingleAdjustForm", () => ({
  MobileSingleAdjustForm: ({ onReview }: { onReview: () => void }) => (
    <button type="button" onClick={onReview}>adjust review</button>
  ),
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
  useIoDraft: () => ({ drafting: false, saveDraft: saveDraftMock }),
}));

vi.mock("../../../_warehouse_v2/useIoPreview", () => ({
  useIoPreview: () => ({ previewing: false, previewTarget: vi.fn() }),
}));

vi.mock("../../../_warehouse_v2/useIoSubmit", () => ({
  useIoSubmit: () => ({ submitting: false, submit: vi.fn() }),
}));

describe("MobileIoComposeWizard Step 5 헤더", () => {
  beforeEach(() => {
    wizardState.step = 5;
    wizardState.workType = "warehouse_io";
    wizardState.subType = "warehouse_to_dept";
    wizardState.bundles = [];
    wizardState.goTo.mockReset();
    saveDraftMock.mockReset();
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
  it("moves a single adjustment review into the existing final confirmation step", () => {
    wizardState.step = 3;
    wizardState.subType = "adjust_out";
    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={null}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "adjust review" }));

    expect(wizardState.goTo).toHaveBeenCalledWith(5);
  });

  it("reuses the saved draft id and exposes it for responsive restoration", async () => {
    const onDraftSaved = vi.fn();
    wizardState.bundles = [{ bundle_id: "bundle-1" }] as never[];
    saveDraftMock.mockResolvedValue({ batch_id: "draft-1" });

    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={{ employee_id: "emp-1", name: "김현우", department: "조립" }}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
        onDraftSaved={onDraftSaved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "save draft" }));
    await waitFor(() => expect(saveDraftMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "save draft" }));
    await waitFor(() => expect(saveDraftMock).toHaveBeenCalledTimes(2));

    expect(saveDraftMock.mock.calls[0][0].batchId).toBeNull();
    expect(saveDraftMock.mock.calls[1][0].batchId).toBe("draft-1");
    expect(onDraftSaved).toHaveBeenLastCalledWith("draft-1", 5);
  });

  it("shows the draft error and rejects the viewport flush so the shell stays mounted", async () => {
    const flushDraftRef: { current: (() => Promise<void>) | null } = { current: null };
    wizardState.bundles = [{ bundle_id: "bundle-1" }] as never[];
    saveDraftMock.mockRejectedValue(new Error("임시저장 실패"));

    render(
      <MobileIoComposeWizard
        globalSearch=""
        operator={{ employee_id: "emp-1", name: "김현우", department: "조립" }}
        items={[]}
        setItems={vi.fn()}
        onStatusChange={vi.fn()}
        flushDraftRef={flushDraftRef}
      />,
    );
    await waitFor(() => expect(flushDraftRef.current).not.toBeNull());

    await act(async () => {
      await expect(flushDraftRef.current?.()).rejects.toThrow("임시저장 실패");
    });

    expect(screen.getByText("임시저장 실패")).toBeInTheDocument();
  });
});
