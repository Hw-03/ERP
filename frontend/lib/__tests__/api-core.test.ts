import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toApiUrl,
  extractErrorMessage,
  parseError,
  fetcher,
  postJson,
  putJson,
  patchJson,
  FALLBACK_SERVER_API_BASE,
} from "../api-core";

// Helpers --------------------------------------------------------

function makeResponse(opts: {
  ok: boolean;
  status?: number;
  statusText?: string;
  body: string | object;
}): Response {
  const { ok, status = ok ? 200 : 500, statusText = ok ? "OK" : "Error", body } = opts;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
  } as unknown as Response;
}

// toApiUrl -------------------------------------------------------

describe("toApiUrl", () => {
  it("returns the path as-is when no SERVER_API_BASE configured", () => {
    // 본 테스트 환경엔 NEXT_PUBLIC_API_URL 가 설정돼 있지 않으므로 상대경로 그대로.
    expect(toApiUrl("/api/items")).toBe("/api/items");
  });

  it("preserves query strings", () => {
    expect(toApiUrl("/api/items?foo=1&bar=baz")).toBe("/api/items?foo=1&bar=baz");
  });
});

// FALLBACK_SERVER_API_BASE ---------------------------------------

describe("FALLBACK_SERVER_API_BASE", () => {
  it("exports the documented default", () => {
    expect(FALLBACK_SERVER_API_BASE).toBe("http://127.0.0.1:8000");
  });
});

// extractErrorMessage --------------------------------------------

describe("extractErrorMessage", () => {
  it("returns the string detail directly", () => {
    expect(extractErrorMessage("품목을 찾을 수 없습니다.")).toBe("품목을 찾을 수 없습니다.");
  });

  it("returns the message field of legacy detail object", () => {
    expect(extractErrorMessage({ message: "수량이 부족합니다." })).toBe("수량이 부족합니다.");
  });

  it("appends shortages list with newlines", () => {
    const msg = extractErrorMessage({
      message: "재고 부족",
      shortages: ["A 5개", "B 2개"],
    });
    expect(msg).toBe("재고 부족\nA 5개\nB 2개");
  });

  it("reads shortages from extra wrapper (Phase 4 shape)", () => {
    const msg = extractErrorMessage({
      code: "STOCK_SHORT",
      message: "재고 부족",
      extra: { shortages: ["A 5개"] },
    });
    expect(msg).toBe("재고 부족\nA 5개");
  });

  it("falls back to provided fallback when message is missing", () => {
    expect(extractErrorMessage({}, "처리 실패")).toBe("처리 실패");
  });

  it("uses fallback when detail is null/undefined", () => {
    expect(extractErrorMessage(null, "처리 실패")).toBe("처리 실패");
    expect(extractErrorMessage(undefined, "처리 실패")).toBe("처리 실패");
  });
});

// parseError -----------------------------------------------------

describe("parseError", () => {
  it("extracts message from JSON detail", async () => {
    const res = makeResponse({ ok: false, body: { detail: { message: "충돌" } } });
    expect(await parseError(res)).toBe("충돌");
  });

  it("returns raw text when body is not JSON", async () => {
    const res = makeResponse({ ok: false, body: "plain text error", statusText: "Bad" });
    expect(await parseError(res)).toBe("plain text error");
  });

  it("falls back to statusText when body is empty", async () => {
    const res = {
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: () => Promise.resolve(""),
      json: () => Promise.resolve({}),
    } as unknown as Response;
    expect(await parseError(res)).toBe("Bad Gateway");
  });
});

// fetcher / postJson / putJson / patchJson -----------------------

describe("fetcher / write helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("fetcher returns parsed json on success", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { count: 3 } })),
    ) as unknown as typeof fetch;
    const result = await fetcher<{ count: number }>("/api/x");
    expect(result).toEqual({ count: 3 });
  });

  it("fetcher throws Error with parsed message on !ok", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({ ok: false, body: { detail: { message: "권한 없음" } } }),
      ),
    ) as unknown as typeof fetch;
    await expect(fetcher("/api/x")).rejects.toThrow("권한 없음");
  });

  it("fetcher rethrows AbortError directly", async () => {
    const abort = new Error("AbortError");
    abort.name = "AbortError";
    globalThis.fetch = vi.fn(() => Promise.reject(abort)) as unknown as typeof fetch;
    await expect(fetcher("/api/x")).rejects.toThrow("AbortError");
  });

  it("postJson calls fetch with method POST + JSON body", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { id: "1" } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await postJson("/api/items", { name: "X" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/items");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ name: "X" });
  });

  it("putJson uses PUT method", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: {} })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await putJson("/api/items/1", { x: 1 });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
  });

  it("patchJson uses PATCH method", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: {} })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await patchJson("/api/items/1", { x: 1 });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
  });

  it("write helpers throw with parsed message on !ok", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({ ok: false, body: { detail: { message: "유효성 실패" } } }),
      ),
    ) as unknown as typeof fetch;
    await expect(postJson("/api/items", {})).rejects.toThrow("유효성 실패");
  });
});
