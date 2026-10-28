import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-core";
import { MobileIoComposeWizard } from "../MobileIoComposeWizard";

const mocks = vi.hoisted(() => ({ save: vi.fn(), submit: vi.fn(), batch: null as any, latest: null as any, pause: null as any, busy: false }));
const state = vi.hoisted(() => ({
  step: 5, workType: "process", subType: "adjust_in", fromDepartment: "조립", toDepartment: "조립",
  notes: "메모", referenceNo: "", reasonCategory: "", reasonCategoryId: null, selectedSupplierId: null,
  bundles: [] as any[], steps: [1, 2, 3, 4, 5], canAdvance: { 2: true, 4: true },
  hasShortage: false, includedLines: [], setBundles: vi.fn(), goTo: vi.fn(), reset: vi.fn(),
}));
vi.mock("@/lib/queries/realtime", () => ({ useRealtimeRevision: () => 0 }));
vi.mock("@/lib/queries/useBomQuery", () => ({ useBomParentIdsQuery: () => ({ data: [], isSuccess: true }) }));
vi.mock("../../../_warehouse_v2/useIoWorkState", () => ({ useIoWorkState: () => state }));
vi.mock("../../../_warehouse_v2/useIoDraft", () => ({ useIoDraft: () => ({
  saveDraft: mocks.save, savedBatch: mocks.batch, latestBatch: mocks.latest, stocktakePause: mocks.pause, drafting: mocks.busy,
  captureSession: () => vi.fn(), resetSession: vi.fn(), submitDraft: mocks.submit,
}) }));
vi.mock("../../../_warehouse_v2/useIoSubmit", () => ({ useIoSubmit: () => ({
  submitting: false, run: (work: () => Promise<void>) => work(), submit: mocks.submit,
  resetSession: vi.fn(), captureSession: () => vi.fn(),
}) }));
vi.mock("../../../_warehouse_v2/useIoPreview", () => ({ useIoPreview: () => ({ previewing: false }) }));
vi.mock("../../../_warehouse_v2/useIoDraftRestore", () => ({ useIoDraftRestore: ({ draftToRestore, autosaveBatchIdRef }: any) => {
  if (draftToRestore) autosaveBatchIdRef.current = draftToRestore.batch_id;
} }));
vi.mock("../../../_warehouse_v2/IoConfirmStep", () => ({ IoConfirmStep: ({ onSubmit, onSaveDraft }: any) => <>
  <button onClick={onSubmit}>제출</button><button onClick={onSaveDraft}>저장</button>
</> }));
vi.mock("../../../_warehouse_v2/IoBundleCart", () => ({ IoBundleCart: () => null }));

const operator = { employee_id: "employee", name: "작업자", department: "조립", warehouse_role: "primary" };
function draft() {
  return { batch_id: "draft", requester_employee_id: "employee", work_type: state.workType, sub_type: state.subType,
    from_department: state.fromDepartment, to_department: state.toDepartment, notes: state.notes, bundles: state.bundles };
}
function setup(restored = false) {
  const dirty = vi.fn();
  const blocked = vi.fn();
  const flushDraftRef = { current: null as (() => Promise<void>) | null };
  const props = { globalSearch: "", operator, employees: [], items: [], setItems: vi.fn(), onStatusChange: vi.fn(),
    onDirtyChange: dirty, onLeaveSaveBlockedChange: blocked, flushDraftRef, restoreDraft: restored ? mocks.batch : undefined };
  const view = render(<MobileIoComposeWizard {...props} />);
  return { ...view, dirty, blocked, flushDraftRef, refresh: () => view.rerender(<MobileIoComposeWizard {...props} />) };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.step = 5; state.notes = "메모"; state.referenceNo = "";
  state.bundles = [{ bundle_id: "bundle", lines: [{ line_id: "line", quantity: 1, included: true }] }];
  mocks.pause = null; mocks.batch = null; mocks.latest = null; mocks.busy = false;
  mocks.save.mockResolvedValue({ batch_id: "draft" });
  mocks.submit.mockRejectedValue(new ApiError("조사 중", 409, "WORK_STOCKTAKE_PAUSED"));
});
describe("모바일 입출고 조사 대기", () => {
  it("새 입력은 중립 대기 안내에서 명시 저장한 뒤 저장됨으로 표시한다", async () => {
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    expect(await screen.findByText("재고 조사 대기")).toBeInTheDocument();
    expect(screen.getByText(/아직 저장되지/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "작업 중 등록" }));
    await waitFor(() => expect(screen.getByText(/작업 중 목록에 저장/)).toBeInTheDocument());
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(view.dirty).toHaveBeenLastCalledWith(true);
  });
  it("등록 실패는 저장됨으로 바꾸지 않고 입력과 대기 안내를 유지한다", async () => {
    mocks.save.mockRejectedValue(new Error("저장 실패"));
    setup();
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    await screen.findByText("재고 조사 대기");
    fireEvent.click(screen.getByRole("button", { name: "작업 중 등록" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByText(/저장 결과를 확인하지 못/)).toBeInTheDocument());
    expect(screen.queryByText(/아직 저장되지/)).not.toBeInTheDocument();
    expect(screen.getByText("재고 조사 대기")).toBeInTheDocument();
  });
  it("저장된 blocked 작업이 동일하면 재저장 없이 이동하고 메모 변경은 가드한다", async () => {
    mocks.batch = draft(); mocks.pause = { state: "blocked" };
    const view = setup(true);
    await waitFor(() => expect(view.dirty).toHaveBeenLastCalledWith(false));
    await act(async () => { await view.flushDraftRef.current!(); });
    expect(mocks.save).not.toHaveBeenCalled();
    state.step = 4; view.refresh();
    expect(view.dirty).toHaveBeenLastCalledWith(false);
    state.notes = "추가 메모"; view.refresh();
    expect(view.dirty).toHaveBeenLastCalledWith(true);
    expect(view.blocked).toHaveBeenLastCalledWith(expect.stringContaining("추가 변경"));
    await act(async () => { await expect(view.flushDraftRef.current!()).rejects.toThrow(/조사/); });
  });
  it("저장 대기 중 변경되어 null이면 flush는 실패하고 화면을 유지한다", async () => {
    let resolve!: (value: { batch_id: string }) => void;
    mocks.save.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = setup();
    let pending!: Promise<void>;
    await act(async () => { pending = view.flushDraftRef.current!(); await Promise.resolve(); });
    state.notes = "저장 중 추가"; view.refresh();
    const assertion = expect(pending).rejects.toThrow(/변경|확인/);
    await act(async () => { resolve({ batch_id: "draft" }); await assertion; });
    expect(view.dirty).toHaveBeenLastCalledWith(true);
  });
  it("서버 저장 기준이 없는 blocked 작업과 처리 중인 작업은 이탈 가드를 유지한다", () => {
    mocks.pause = { state: "blocked" };
    const view = setup();
    expect(view.dirty).toHaveBeenLastCalledWith(true);
    view.unmount();
    mocks.batch = draft(); mocks.busy = true;
    const busyView = setup(true);
    expect(busyView.dirty).toHaveBeenLastCalledWith(true);
  });
  it("새 저장이 ACK를 받아도 이후 payload 변경은 저장됨 안내로 표시하지 않는다", async () => {
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    await screen.findByText("재고 조사 대기");
    fireEvent.click(screen.getByRole("button", { name: "작업 중 등록" }));
    await screen.findByText(/작업 중 목록에 저장/);
    state.referenceNo = "추가 참조"; view.refresh();
    expect(screen.getByText(/저장 후 추가 변경은 아직 저장되지/)).toBeInTheDocument();
  });
  it("저장된 모든 묶음을 지운 추가 변경도 이탈 전에 확인한다", () => {
    mocks.batch = draft(); mocks.pause = { state: "blocked" };
    const view = setup(true);
    expect(view.dirty).toHaveBeenLastCalledWith(false);
    state.bundles = []; view.refresh();
    expect(view.dirty).toHaveBeenLastCalledWith(true);
  });
  it("ready 조사작업은 기존 flush 저장을 생략하지 않는다", async () => {
    mocks.batch = draft(); mocks.pause = { state: "ready" };
    const view = setup(true);
    expect(view.dirty).toHaveBeenLastCalledWith(true);
    await act(async () => { await view.flushDraftRef.current!(); });
    expect(mocks.save).toHaveBeenCalledOnce();
  });
  it("ready 재개 버전이 오래됐으면 동일 payload라도 이탈 가드를 유지한다", () => {
    mocks.batch = { ...draft(), revision: 3 }; mocks.latest = { ...mocks.batch, revision: 4 }; mocks.pause = { state: "ready" };
    const view = setup(true);
    expect(view.dirty).toHaveBeenLastCalledWith(true);
  });
});
