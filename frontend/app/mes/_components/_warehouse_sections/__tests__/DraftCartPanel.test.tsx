import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { workDraftsApi } from "@/lib/api/work-drafts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IoBatch } from "@/lib/api";
import { DraftCartPanel } from "../DraftCartPanel";

const mockDraftData = vi.hoisted(() => ({
  stockDrafts: [] as unknown[],
  ioDrafts: [] as unknown[],
}));
const mockFailure = vi.hoisted(() => ({ error: null as Error | null, refetch: vi.fn() }));
const mockDeleteIoDraft = vi.hoisted(() => vi.fn());
const mockDeleteStockRequestDraft = vi.hoisted(() => vi.fn());

vi.mock("@/lib/queries/useDraftCartQuery", () => ({
  useDraftCartQuery: () => ({
    data: mockDraftData,
    isLoading: false,
    error: mockFailure.error,
    refetch: mockFailure.refetch,
  }),
  useDeleteIoDraftMutation: () => ({ mutate: mockDeleteIoDraft }),
  useDeleteStockRequestDraftMutation: () => ({ mutate: mockDeleteStockRequestDraft }),
}));

function makeIoDraft(): IoBatch {
  return {
    batch_id: "batch-1",
    revision: 6,
    work_type: "process",
    sub_type: "disassemble",
    status: "draft",
    requester_employee_id: "emp-1",
    requester_name: "권동환",
    requester_department: "조립",
    approver_employee_id: null,
    approver_name: null,
    from_department: null,
    to_department: "조립",
    requires_approval: true,
    stock_request_id: null,
    shipping_request_id: null,
    reference_no: null,
    notes: null,
    created_at: "2026-08-04T00:05:00Z",
    updated_at: "2026-08-04T00:10:00Z",
    submitted_at: null,
    completed_at: null,
    bundles: [],
  };
}

describe("DraftCartPanel empty state", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    mockDraftData.stockDrafts = [];
    mockDraftData.ioDrafts = [];
    mockFailure.error = null;
    mockFailure.refetch.mockClear();
    mockDeleteIoDraft.mockClear();
    mockDeleteStockRequestDraft.mockClear();
  });

  it("preserves successful empty drafts when refresh fails", () => {
    mockFailure.error = new Error("갱신 실패");
    render(<DraftCartPanel employeeId="emp-1" refreshNonce={0} onContinue={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("기존 내용을 표시합니다");
    mockFailure.refetch.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mockFailure.refetch).toHaveBeenCalledOnce();
  });

  it("offers a request-compose action when there is no work in progress", () => {
    const onStartCompose = vi.fn();

    render(
      <DraftCartPanel
        layout="desktop"
        employeeId="emp-1"
        refreshNonce={0}
        onContinue={vi.fn()}
        onChanged={vi.fn()}
        onStartCompose={onStartCompose}
      />,
    );

    expect(screen.getByText("작업 중인 요청이 없습니다.")).toBeInTheDocument();
    expect(screen.getByTestId("warehouse-empty-work-area")).toHaveClass("flex-1", "min-h-0");
    fireEvent.click(screen.getByRole("button", { name: "요청 작성" }));
    expect(onStartCompose).toHaveBeenCalledOnce();
  });

  it("uses the hierarchy table only in the desktop layout", () => {
    mockDraftData.ioDrafts = [makeIoDraft()];
    const commonProps = {
      employeeId: "emp-1",
      refreshNonce: 0,
      onContinue: vi.fn(),
      onContinueIo: vi.fn(),
      onChanged: vi.fn(),
    };
    const { rerender } = render(<DraftCartPanel {...commonProps} layout="desktop" />);

    expect(screen.getByRole("columnheader", { name: "예정 변동" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/작업 카드:/)).not.toBeInTheDocument();

    rerender(<DraftCartPanel {...commonProps} layout="mobile" />);
    expect(screen.queryByRole("columnheader", { name: "예정 변동" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("작업 카드: 분해 출고, 분해")).toBeInTheDocument();
  });

  it("locks the confirmation after the first delete request", () => {
    mockDraftData.ioDrafts = [makeIoDraft()];
    render(
      <DraftCartPanel
        layout="desktop"
        employeeId="emp-1"
        refreshNonce={0}
        onContinue={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "작업 삭제" }));
    const confirmButton = screen.getByRole("button", { name: "삭제" });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.keyDown(window, { key: "Enter" });

    expect(mockDeleteIoDraft).toHaveBeenCalledOnce();
    expect(mockDeleteIoDraft).toHaveBeenCalledWith({ batchId: "batch-1", employeeId: "emp-1", expectedRevision: 6 }, expect.any(Object));
    expect(screen.getByRole("button", { name: "삭제 중..." })).toBeDisabled();
  });

  it("이어서 하기는 클릭한 목록 대신 최신 단건을 복원한다", async () => {
    mockDraftData.ioDrafts = [makeIoDraft()];
    const latest = { ...makeIoDraft(), revision: 8 };
    const get = vi.spyOn(workDraftsApi, "getOwnedIo").mockResolvedValue(latest);
    const onContinueIo = vi.fn();
    render(<DraftCartPanel layout="desktop" employeeId="emp-1" refreshNonce={0} onContinue={vi.fn()} onContinueIo={onContinueIo} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    await waitFor(() => expect(onContinueIo).toHaveBeenCalledWith(latest));
    expect(get).toHaveBeenCalledWith("emp-1", "batch-1", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(mockFailure.refetch).not.toHaveBeenCalled();
  });

  it("퇴장 뒤 도착한 이어하기 응답으로 화면을 다시 열지 않는다", async () => {
    mockDraftData.ioDrafts = [makeIoDraft()];
    let complete!: (draft: IoBatch) => void;
    const get = vi.spyOn(workDraftsApi, "getOwnedIo").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const onContinueIo = vi.fn();
    const view = render(<DraftCartPanel layout="desktop" employeeId="emp-1" refreshNonce={0} onContinue={vi.fn()} onContinueIo={onContinueIo} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "이어서 작업" }));
    view.unmount();
    await act(async () => { complete(makeIoDraft()); });
    expect(get.mock.calls[0][2]?.signal?.aborted).toBe(true);
    expect(onContinueIo).not.toHaveBeenCalled();
  });
});
