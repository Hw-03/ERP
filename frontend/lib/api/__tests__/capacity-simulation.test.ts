import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiConnectionError, ApiError } from "../../api-core";
import { catalogApi } from "../catalog";
import { productionApi } from "../production";

const fetchMock = vi.fn<typeof fetch>();
const result = { total_production: 37 };
const ok = () => new Response(JSON.stringify(result), { status: 200 });
const requests = [
  ["일반 BOM", (signal?: AbortSignal) => catalogApi.simulateBOMCapacity("pf", { excluded_item_ids: ["part"] }, signal)],
  ["생산 가능수량", (signal?: AbortSignal) => productionApi.simulateProductionCapacity({ pf_item_id: "pf", excluded_item_ids: ["part"] }, signal)],
] as const;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe.each(requests)("%s 시뮬레이션 요청", (_name, request) => {
  it("15초가 지난 정상 계산 결과를 계속 기다린다", async () => {
    fetchMock.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(ok()), 16_000)));
    let failure: unknown;
    let value: unknown;
    const completion = request().then((response) => { value = response; }, (error: unknown) => { failure = error; });
    await vi.advanceTimersByTimeAsync(16_000);
    await completion;
    expect(failure).toBeUndefined();
    expect(value).toEqual(result);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("일시적인 프록시 연결 실패는 읽기 전용 계산만 한 번 재시도한다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 })).mockResolvedValueOnce(ok());
    await expect(request()).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("잘못된 제외 요청은 재시도 없이 검증 오류를 유지한다", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: "VALIDATION_ERROR", message: "제외할 수 없습니다." } }), { status: 422 }));
    const failure = await request().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("조건 변경으로 취소한 요청은 즉시 중단하고 재시도하지 않는다", async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("취소", "AbortError")), { once: true });
    }));
    const controller = new AbortController();
    const completion = request(controller.signal).catch((error: unknown) => error);
    controller.abort();
    expect(await completion).toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("30초 한도가 지나면 실제 요청도 취소하고 타이머를 정리한다", async () => {
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("시간 초과", "AbortError")), { once: true });
    }));
    const completion = request().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await completion).toBeInstanceOf(ApiConnectionError);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("연결 끊김 후 재시도에도 같은 제외 조건을 전송한다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(ok());
    await expect(request()).resolves.toEqual(result);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  });
});
