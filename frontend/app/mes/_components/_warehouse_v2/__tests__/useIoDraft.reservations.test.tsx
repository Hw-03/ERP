// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type IoBatch, type Item } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
import { useIoDraft } from "../useIoDraft";

vi.mock("@/lib/api", () => ({ api: { saveDraft: vi.fn(), getBatch: vi.fn(), submitDraft: vi.fn(), deleteDraft: vi.fn() } }));
const payload = { employeeId: "employee", workType: "process" as const, subType: "produce" as const, bundles: [] };
beforeEach(() => vi.clearAllMocks());
describe("작업 예약 작성 계약", () => {
  it("복귀 후 늦은 창고 저장 응답이 원작업의 관측 배치를 덮지 않는다", async () => {
    let finish!: (batch: IoBatch) => void;
    vi.mocked(api.saveDraft).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const original = { batch_id: "original", revision: 7 } as IoBatch;
    const { result } = renderHook(() => useIoDraft(original, 1));
    const restore = result.current.captureSession();
    act(() => result.current.resetSession());
    let pending!: Promise<IoBatch>;
    act(() => { pending = result.current.saveDraft(payload); });
    act(restore);
    await act(async () => { finish({ batch_id: "warehouse", revision: 1 } as IoBatch); await pending; });
    expect(result.current.savedBatch?.batch_id).toBe("original");
    expect(result.current.getRevision("original")).toBe(7);
  });
  it("신규 저장의 통신 재시도는 같은 생성 키를 유지한다", async () => {
    vi.mocked(api.saveDraft).mockRejectedValue(new Error("연결 실패"));
    const { result } = renderHook(() => useIoDraft());
    await act(async () => { await result.current.saveDraft(payload).catch(() => {}); await result.current.saveDraft(payload).catch(() => {}); });
    const calls = vi.mocked(api.saveDraft).mock.calls;
    expect(calls[0][0].client_request_id).toEqual(expect.any(String));
    expect(calls[1][0].client_request_id).toBe(calls[0][0].client_request_id);
  });
  it("복원한 관측 버전으로 수정하고 충돌 최신 조회가 원래 버전을 덮지 않는다", async () => {
    const draft = { batch_id: "batch", revision: 7 } as IoBatch;
    vi.mocked(api.saveDraft).mockRejectedValue(new ApiError("다른 작업자가 변경했습니다", 409));
    vi.mocked(api.getBatch).mockResolvedValue({ ...draft, revision: 9 });
    const { result } = renderHook(() => useIoDraft(draft, 1));
    await act(async () => { await result.current.saveDraft({ ...payload, batchId: "batch" }).catch(() => {}); });
    expect(api.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ batch_id: "batch", expected_revision: 7 }));
    expect(api.getBatch).toHaveBeenCalledWith("batch");
    expect(result.current.getRevision("batch")).toBe(7);
  });
  it("충돌로 조회한 현재 예약과 편집용 배치·리비전을 별개로 보존한다", async () => {
    const draft = { batch_id: "batch", requester_employee_id: "employee", revision: 7, status: "draft", reservation_status: "reserved" } as IoBatch;
    const cancelled = { ...draft, revision: 8, status: "cancelled", reservation_status: "inactive" } as IoBatch;
    vi.mocked(api.getBatch).mockResolvedValue(draft);
    vi.mocked(api.saveDraft).mockRejectedValue(new ApiError("취소된 작업입니다", 409));
    const context = { employeeId: "employee", inventorySnapshot: [] as Item[], realtimeRevision: 1 };
    const { result } = renderHook(() => useIoDraft(draft, 1, undefined, undefined, context));
    await act(async () => {});
    vi.mocked(api.getBatch).mockResolvedValue(cancelled);
    await act(async () => { await result.current.saveDraft({ ...payload, batchId: "batch" }).catch(() => {}); });
    expect(result.current.currentReservationBatch).toEqual(cancelled);
    expect(result.current.savedBatch).toEqual(draft);
    expect(result.current.latestBatch).toEqual(cancelled);
    expect(result.current.getRevision("batch")).toBe(7);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
  });
  it("저장 전에 시작한 늦은 예약 조회가 새 저장의 재고 갱신 대기를 우회하지 않는다", async () => {
    const draft = { batch_id: "batch", requester_employee_id: "employee", revision: 7, status: "draft", reservation_status: "reserved" } as IoBatch;
    let finish!: (batch: IoBatch) => void;
    vi.mocked(api.getBatch).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    vi.mocked(api.saveDraft).mockResolvedValue({ ...draft, revision: 8 });
    const context = { employeeId: "employee", inventorySnapshot: [] as Item[], realtimeRevision: 1 };
    const { result } = renderHook(() => useIoDraft(draft, 1, undefined, undefined, context));
    await act(async () => { await result.current.saveDraft({ ...payload, batchId: "batch" }); });
    await act(async () => { finish(draft); });
    expect(result.current.currentReservationBatch).toBeNull();
  });
  it("재고가 저장 응답보다 먼저 갱신되어도 재조회 완료 후 현재 예약을 다시 읽는다", async () => {
    const draft = { batch_id: "batch", requester_employee_id: "employee", revision: 7, status: "draft", reservation_status: "reserved" } as IoBatch;
    const saved = { ...draft, revision: 8 };
    let finishSave!: (batch: IoBatch) => void;
    vi.mocked(api.getBatch).mockResolvedValue(draft);
    vi.mocked(api.saveDraft).mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    const refresh = vi.fn().mockResolvedValue(undefined);
    const context = { employeeId: "employee", inventorySnapshot: [] as Item[], realtimeRevision: 1 };
    const { result, rerender } = renderHook(({ snapshot }) => useIoDraft(draft, 1, refresh, undefined, { ...context, inventorySnapshot: snapshot }), { initialProps: { snapshot: [] as Item[] } });
    let pending!: Promise<IoBatch>;
    act(() => { pending = result.current.saveDraft({ ...payload, batchId: "batch" }); });
    rerender({ snapshot: [] });
    vi.mocked(api.getBatch).mockResolvedValue(saved);
    await act(async () => { finishSave(saved); await pending; });
    expect(result.current.currentReservationBatch).toEqual(saved);
    expect(result.current.getRevision("batch")).toBe(8);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("재고 재조회 실패가 이미 확정된 저장을 실패로 뒤집지 않는다", async () => {
    const saved = { batch_id: "batch", revision: 1 } as IoBatch;
    vi.mocked(api.saveDraft).mockResolvedValue(saved);
    const { result } = renderHook(() => useIoDraft(undefined, undefined, () => Promise.reject(new Error("재조회 실패"))));
    await act(async () => { await expect(result.current.saveDraft(payload)).resolves.toEqual(saved); });
    expect(result.current.savedBatch).toEqual(saved);
    expect(result.current.latestBatch).toBeNull();
  });
  it("복원 직후 조회가 실패해도 같은 재고 스냅샷의 검증된 본인 예약을 유지한다", async () => {
    const draft = { batch_id: "batch", requester_employee_id: "employee", revision: 7, status: "draft", reservation_status: "reserved" } as IoBatch;
    vi.mocked(api.getBatch).mockRejectedValue(new Error("조회 실패"));
    const context = { employeeId: "employee", inventorySnapshot: [] as Item[], realtimeRevision: 1 };
    const { result } = renderHook(() => useIoDraft(draft, 1, undefined, undefined, context));
    await act(async () => {});
    expect(result.current.currentReservationBatch).toEqual(draft);
    expect(result.current.getRevision("batch")).toBe(7);
  });
  it("버전 없는 기존 작업은 0으로 추정해 보내지 않는다", async () => {
    const { result } = renderHook(() => useIoDraft({ batch_id: "batch" } as IoBatch, 1));
    await act(async () => { await expect(result.current.saveDraft({ ...payload, batchId: "batch" })).rejects.toThrow("버전"); });
    expect(api.saveDraft).not.toHaveBeenCalled();
  });
  it("저장 응답 버전으로 기존 작업을 제출하고 확정 실패 뒤 최신 상태를 조회한다", async () => {
    vi.mocked(api.saveDraft).mockResolvedValue({ batch_id: "batch", revision: 8 } as IoBatch);
    vi.mocked(api.submitDraft).mockRejectedValue(new ApiError("실패가 확정되었습니다", 500, "execution_failed", { state_committed: true }));
    vi.mocked(api.getBatch).mockResolvedValue({ batch_id: "batch", revision: 9, status: "failed" } as IoBatch);
    const { result } = renderHook(() => useIoDraft({ batch_id: "batch", revision: 7 } as IoBatch, 1));
    await act(async () => { await result.current.saveDraft({ ...payload, batchId: "batch" }); });
    await act(async () => { await result.current.submitDraft("batch", "employee").catch(() => {}); });
    expect(api.submitDraft).toHaveBeenCalledWith("batch", "employee", 8);
    expect(result.current.latestBatch?.status).toBe("failed");
    expect(result.current.getRevision("batch")).toBe(8);
  });
});
