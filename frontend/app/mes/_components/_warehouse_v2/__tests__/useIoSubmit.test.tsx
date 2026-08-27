import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ResultUnknownError } from "@/lib/api-core";
import { useIoSubmit } from "../useIoSubmit";

const submitMock = vi.fn();
const requestIdMock = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { submit: (...args: unknown[]) => submitMock(...args) },
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

describe("useIoSubmit", () => {
  beforeEach(() => {
    sessionStorage.clear();
    submitMock.mockReset();
    requestIdMock.mockReset();
    requestIdMock.mockReturnValueOnce("key-1").mockReturnValueOnce("key-2");
  });

  it("결과 불명 뒤에는 호출자 form이 바뀌어도 같은 key와 payload를 재전송한다", async () => {
    submitMock
      .mockRejectedValueOnce(new ResultUnknownError())
      .mockResolvedValueOnce({ batch: { batch_id: "b-1" } });
    const { result } = renderHook(() => useIoSubmit());

    let firstRequest: Promise<unknown>;
    act(() => {
      firstRequest = result.current.submit(payload("first", 1));
    });
    await act(async () => {
      await expect(firstRequest!).rejects.toBeInstanceOf(ResultUnknownError);
    });
    expect(hasPendingStorage("i")).toBe(true);
    await act(async () => {
      await result.current.submit(payload("changed", 9));
    });

    expect(submitMock).toHaveBeenCalledTimes(2);
    expect(submitMock.mock.calls[1][0]).toEqual(submitMock.mock.calls[0][0]);
    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
    expect(hasPendingStorage("i")).toBe(false);
  });

  it("결과 불명 뒤 unmount와 remount를 거쳐도 exact 요청을 복원한다", async () => {
    submitMock
      .mockRejectedValueOnce(new ResultUnknownError())
      .mockResolvedValueOnce({ batch: { batch_id: "b-remount" } });
    const firstHook = renderHook(() => useIoSubmit());

    await act(async () => {
      await expect(firstHook.result.current.submit(payload("first", 1))).rejects.toBeInstanceOf(
        ResultUnknownError,
      );
    });
    firstHook.unmount();
    const secondHook = renderHook(() => useIoSubmit());
    await act(async () => {
      await secondHook.result.current.submit(payload("changed", 9));
    });

    expect(submitMock.mock.calls[1][0]).toEqual(submitMock.mock.calls[0][0]);
    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
  });

  it("in-flight 중 remount된 동일 scope는 하나의 전송 결과를 공유한다", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    submitMock.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const firstHook = renderHook(() => useIoSubmit());
    let firstRequest: Promise<unknown>;
    act(() => {
      firstRequest = firstHook.result.current.submit(payload("first", 1));
    });
    firstHook.unmount();
    const secondHook = renderHook(() => useIoSubmit());
    let secondRequest: Promise<unknown>;
    act(() => {
      secondRequest = secondHook.result.current.submit(payload("changed", 9));
    });

    await act(async () => {
      resolvers.forEach((resolve) => resolve({ batch: { batch_id: "b-shared" } }));
      await Promise.all([firstRequest!, secondRequest!]);
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it("성공 뒤 다음 명령은 새 key와 현재 payload를 사용한다", async () => {
    submitMock.mockResolvedValue({ batch: { batch_id: "b-1" } });
    const { result } = renderHook(() => useIoSubmit());

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

  it("확정 422에서는 snapshot을 폐기하지만 503에서는 유지한다", async () => {
    submitMock
      .mockRejectedValueOnce(new ApiError("invalid", 422))
      .mockRejectedValueOnce(new ApiError("busy", 503))
      .mockResolvedValueOnce({ batch: { batch_id: "b-3" } });
    const { result } = renderHook(() => useIoSubmit());

    await act(async () => {
      await expect(result.current.submit(payload("invalid", 1))).rejects.toMatchObject({
        status: 422,
      });
    });
    await act(async () => {
      await expect(result.current.submit(payload("busy", 2))).rejects.toMatchObject({
        status: 503,
      });
    });
    await act(async () => {
      await result.current.submit(payload("changed", 9));
    });

    expect(submitMock.mock.calls[0][0].client_request_id).toBe("key-1");
    expect(submitMock.mock.calls[1][0].client_request_id).toBe("key-2");
    expect(submitMock.mock.calls[2][0]).toEqual(submitMock.mock.calls[1][0]);
  });
});
