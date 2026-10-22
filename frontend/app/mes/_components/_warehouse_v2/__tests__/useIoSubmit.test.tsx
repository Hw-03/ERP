// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIoSubmit } from "../useIoSubmit";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api-core";
vi.mock("@/lib/api", () => ({ api: { submit: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useIoSubmit", () => {
  it.each([false, true])("제출 성공 후 예약 갱신의 비동기 실패=%s가 성공을 뒤집거나 처리되지 않은 오류를 남기지 않는다", async (asyncFailure) => {
    const response = { batch: { batch_id: "batch" } } as never;
    vi.mocked(api.submit).mockResolvedValue(response);
    const refresh = vi.fn(() => {
      if (asyncFailure) return Promise.reject(new Error("갱신 실패"));
      throw new Error("갱신 실패");
    });
    const { result } = renderHook(() => useIoSubmit(refresh));
    await act(async () => { await expect(result.current.submit({ employeeId: "employee", workType: "process", subType: "produce", bundles: [] })).resolves.toBe(response); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("원작업 응답 유실 뒤 창고 작업을 거쳐 복귀해도 원 제출 키를 재사용한다", async () => {
    vi.mocked(api.submit).mockRejectedValue(new Error("응답 유실"));
    const { result } = renderHook(() => useIoSubmit());
    const original = { employeeId: "employee", workType: "process" as const, subType: "produce" as const, bundles: [] };
    await act(async () => { await result.current.submit(original).catch(() => {}); });
    const restore = result.current.captureSession();
    act(() => result.current.resetSession());
    await act(async () => { await result.current.submit({ ...original, workType: "warehouse_io", subType: "warehouse_to_dept" }).catch(() => {}); });
    act(restore);
    await act(async () => { await result.current.submit(original).catch(() => {}); });
    const keys = vi.mocked(api.submit).mock.calls.map(([payload]) => payload.client_request_id);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
  });
  it("신규 직접 제출의 확정 실패도 배치 ID로 최신 상태를 조회한다", async () => {
    vi.mocked(api.submit).mockRejectedValue(new ApiError("실패 확정", 422, "failed", { state_committed: true, batch_id: "failed-batch" }));
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(() => useIoSubmit(undefined, refresh));
    await act(async () => { await result.current.submit({ employeeId: "employee", workType: "process", subType: "produce", bundles: [] }).catch(() => {}); });
    expect(refresh).toHaveBeenCalledWith("failed-batch");
  });
  it("제출 응답 유실 뒤 재시도에는 같은 생성 키를 사용한다", async () => {
    vi.mocked(api.submit).mockRejectedValue(new Error("연결 실패"));
    const { result } = renderHook(() => useIoSubmit());
    const payload = { employeeId: "employee", workType: "process" as const, subType: "produce" as const, bundles: [] };
    await act(async () => { await result.current.submit(payload).catch(() => {}); await result.current.submit(payload).catch(() => {}); });
    expect(vi.mocked(api.submit).mock.calls[0][0].client_request_id).toBe(vi.mocked(api.submit).mock.calls[1][0].client_request_id);
  });
  it("진행 중인 저장·제출 실행에는 동기적으로 한 번만 진입한다", async () => {
    const pending = deferred<void>();
    const work = vi.fn(async () => pending.promise);
    const { result } = renderHook(() => useIoSubmit());

    let first!: Promise<void | undefined>;
    let second!: Promise<void | undefined>;
    act(() => {
      first = result.current.run(work);
      second = result.current.run(work);
    });

    expect(work).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);
    await expect(second).resolves.toBeUndefined();

    await act(async () => {
      pending.resolve();
      await first;
    });

    expect(result.current.submitting).toBe(false);
  });
});
