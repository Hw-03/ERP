// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ResultUnknownError } from "@/lib/api-core";
import { useIoSubmit } from "../useIoSubmit";

const submitMock = vi.fn();
const submitDraftMock = vi.fn();
const requestIdMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    submit: (...args: unknown[]) => submitMock(...args),
    submitDraft: (...args: unknown[]) => submitDraftMock(...args),
  },
}));

vi.mock("@/lib/uuid", () => ({
  makeClientRequestId: () => requestIdMock(),
}));

function payload(notes: string, quantity: number) {
  return {
    employeeId: "employee-1",
    workType: "receive" as const,
    subType: "receive_supplier" as const,
    notes,
    bundles: [{
      bundle_id: "bundle-1",
      source_kind: "direct_item" as const,
      title: "품목",
      source_item_id: "item-1",
      source_mes_code: "TR-001",
      quantity,
      expanded_level: 1,
      lines: [],
    }],
  };
}

function hasPendingStorage(namespace: string): boolean {
  const prefix = `${namespace}:`;
  return Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index)).some((key) => key?.startsWith(prefix));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useIoSubmit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    submitMock.mockReset();
    submitDraftMock.mockReset();
    requestIdMock.mockReset();
    requestIdMock.mockReturnValueOnce("key-1").mockReturnValueOnce("key-2");
  });

  it("결과 불명 뒤 새 제출을 막고 명시적인 결과 확인에서만 원 요청을 재전송한다", async () => {
    submitMock
      .mockRejectedValueOnce(new ResultUnknownError())
      .mockResolvedValueOnce({ batch: { batch_id: "b-1" } });
    const { result } = renderHook(() => useIoSubmit("employee-1"));

    let firstRequest: Promise<unknown>;
    act(() => {
      firstRequest = result.current.submit(payload("first", 1));
    });
    await act(async () => {
      await expect(firstRequest!).rejects.toMatchObject({ name: "PendingIoRequestError" });
    });
    expect(hasPendingStorage("i")).toBe(true);
    await act(async () => {
      await expect(result.current.submit(payload("changed", 9))).rejects.toMatchObject({
        name: "PendingIoRequestError",
      });
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(result.current.pendingRequest?.bundles[0].quantity).toBe(1);
    await act(async () => { await result.current.recoverPending(); });

    expect(submitMock).toHaveBeenCalledTimes(2);
    expect(submitMock.mock.calls[1][0]).toEqual(submitMock.mock.calls[0][0]);
    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
    expect(hasPendingStorage("i")).toBe(false);
  });

  it("결과 불명 뒤 unmount와 remount를 거쳐도 exact 요청을 복원한다", async () => {
    submitMock
      .mockRejectedValueOnce(new ResultUnknownError())
      .mockResolvedValueOnce({ batch: { batch_id: "b-remount" } });
    const firstHook = renderHook(() => useIoSubmit("employee-1"));

    await act(async () => {
      await expect(firstHook.result.current.submit(payload("first", 1))).rejects.toMatchObject({
        name: "PendingIoRequestError",
      });
    });
    firstHook.unmount();
    const secondHook = renderHook(() => useIoSubmit("employee-1"));
    expect(secondHook.result.current.pendingRequest?.notes).toBe("first");
    await act(async () => {
      await secondHook.result.current.recoverPending();
    });

    expect(submitMock.mock.calls[1][0]).toEqual(submitMock.mock.calls[0][0]);
    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
  });

  it("in-flight 중 remount된 동일 scope는 하나의 전송 결과를 공유한다", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    submitMock.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const firstHook = renderHook(() => useIoSubmit("employee-1"));
    let firstRequest: Promise<unknown>;
    act(() => {
      firstRequest = firstHook.result.current.submit(payload("first", 1));
    });
    firstHook.unmount();
    const secondHook = renderHook(() => useIoSubmit("employee-1"));
    let secondRequest: Promise<unknown>;
    act(() => {
      secondRequest = secondHook.result.current.recoverPending();
    });

    await act(async () => {
      resolvers.forEach((resolve) => resolve({ batch: { batch_id: "b-shared" } }));
      await Promise.all([firstRequest!, secondRequest!]);
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it("성공 뒤 다음 명령은 새 key와 현재 payload를 사용한다", async () => {
    submitMock.mockResolvedValue({ batch: { batch_id: "b-1" } });
    const { result } = renderHook(() => useIoSubmit("employee-1"));

    await act(async () => {
      await result.current.submit(payload("first", 1));
    });
    await act(async () => {
      await result.current.submit(payload("second", 2));
    });

    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
    expect(submitMock.mock.calls[1][0].client_request_id).toBe("key-2");
    expect(submitMock.mock.calls[1][0].notes).toBe("second");
  });

  it("기존 초안도 원래 batch와 수량을 보존해 명시적으로 확인한다", async () => {
    submitDraftMock.mockRejectedValueOnce(new ResultUnknownError()).mockResolvedValueOnce({ batch: { batch_id: "draft-1" } });
    const { result } = renderHook(() => useIoSubmit("employee-1"));
    await act(async () => {
      await expect(result.current.submitDraft("draft-1", payload("draft", 1))).rejects.toMatchObject({ name: "PendingIoRequestError" });
    });
    expect(result.current.pendingRequest).toMatchObject({ batch_id: "draft-1", bundles: [{ quantity: 1 }] });
    await act(async () => { await result.current.recoverPending(); });
    expect(submitDraftMock.mock.calls).toEqual([["draft-1", "employee-1"], ["draft-1", "employee-1"]]);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("기존 draft-submit pending은 새 초안 제출로 재전송하지 않고 명시적으로 복구한다", async () => {
    sessionStorage.setItem("io:draft-submit:employee-1", JSON.stringify({
      batchId: "draft-old",
      employeeId: "employee-1",
    }));
    submitDraftMock.mockImplementationOnce(async (batchId: string) => {
      sessionStorage.removeItem("io:draft-submit:employee-1");
      return { batch: { batch_id: batchId } };
    });
    const { result } = renderHook(() => useIoSubmit("employee-1"));

    expect(result.current.pendingDraftRequest).toEqual({
      batchId: "draft-old",
      employeeId: "employee-1",
    });
    await act(async () => {
      await expect(result.current.submitDraft("draft-new", payload("new", 9))).rejects.toMatchObject({
        name: "PendingIoRequestError",
      });
    });
    expect(submitDraftMock).not.toHaveBeenCalled();

    await act(async () => { await result.current.recoverPending(); });

    expect(submitDraftMock).toHaveBeenCalledOnce();
    expect(submitDraftMock).toHaveBeenCalledWith("draft-old", "employee-1");
    expect(result.current.pendingDraftRequest).toBeNull();
  });

  it("확정 422에서는 snapshot을 폐기하지만 503에서는 유지한다", async () => {
    submitMock
      .mockRejectedValueOnce(new ApiError("invalid", 422))
      .mockRejectedValueOnce(new ApiError("busy", 503))
      .mockResolvedValueOnce({ batch: { batch_id: "b-3" } });
    const { result } = renderHook(() => useIoSubmit("employee-1"));

    await act(async () => {
      await expect(result.current.submit(payload("invalid", 1))).rejects.toMatchObject({
        status: 422,
      });
    });
    await act(async () => {
      await expect(result.current.submit(payload("busy", 2))).rejects.toMatchObject({
        name: "PendingIoRequestError",
      });
    });
    await act(async () => {
      await result.current.recoverPending();
    });

    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
    expect(submitMock.mock.calls[1][0].client_request_id).toBe("key-2");
    expect(submitMock.mock.calls[2][0]).toEqual(submitMock.mock.calls[1][0]);
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
