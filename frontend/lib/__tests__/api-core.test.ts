import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toApiUrl,
  extractErrorMessage,
  parseError,
  fetcher,
  fetchBlob,
  postJson,
  putJson,
  patchJson,
  deleteJson,
  FALLBACK_SERVER_API_BASE,
  registerAdminPinProvider,
  registerOperatorCredsProvider,
  ApiConnectionError,
  ResultUnknownError,
  ApiError,
} from "../api-core";
import { adminApi } from "../api/admin";
import { setAuditScreen } from "../activity-audit-context";

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
    window.localStorage.clear();
    window.sessionStorage.clear();
    setAuditScreen(null);
    registerAdminPinProvider(() => null);
    registerOperatorCredsProvider(() => null);
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

  it("postJson converts a network rejection into ResultUnknownError", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    ) as unknown as typeof fetch;

    const error = await postJson("/api/items", { name: "X" }).catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(ResultUnknownError);
    expect(error).toBeInstanceOf(ApiConnectionError);
    expect(error).toMatchObject({
      message: "연결 실패",
    });
  });

  it("postJson converts a timeout into ResultUnknownError", async () => {
    let requestSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const request = postJson("/api/items", { name: "X" });
    const failure = request.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await failure;

    expect(error).toBeInstanceOf(ResultUnknownError);
    expect(error).toBeInstanceOf(ApiConnectionError);
    expect(error).toMatchObject({
      message: "연결 실패",
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("postJson combines a caller signal with its timeout signal", async () => {
    const caller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason),
          { once: true },
        );
      });
    }) as unknown as typeof fetch;

    const result = postJson("/api/items", { name: "X" }, caller.signal).catch(
      (error: unknown) => error,
    );
    caller.abort();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(await result).toBeInstanceOf(ResultUnknownError);
    expect(requestSignal).toBeDefined();
    expect(requestSignal).not.toBe(caller.signal);
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("postJson rejects a late success after its timeout as ResultUnknownError", async () => {
    globalThis.fetch = vi.fn(() =>
      new Promise<Response>((resolve) => {
        setTimeout(
          () => resolve(makeResponse({ ok: true, body: { id: "late" } })),
          20_000,
        );
      }),
    ) as unknown as typeof fetch;

    const result = postJson("/api/items", { name: "X" }).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(20_000);

    expect(await result).toBeInstanceOf(ResultUnknownError);
  });

  it("postJson treats a lost success body as ResultUnknownError", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.reject(new TypeError("body connection lost")),
      } as Response),
    ) as unknown as typeof fetch;

    await expect(postJson("/api/items", { name: "X" })).rejects.toBeInstanceOf(
      ResultUnknownError,
    );
  });

  it("postJson preserves a known 422 even when its error body is lost", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        text: () => Promise.reject(new TypeError("body connection lost")),
      } as Response),
    ) as unknown as typeof fetch;

    const error = await postJson("/api/items", { name: "X" }).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422 });
  });

  it("postJson clears its timeout after a successful response", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { id: "1" } })),
    ) as unknown as typeof fetch;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    try {
      await postJson("/api/items", { name: "X" });

      const timeoutCallIndex = setTimeoutSpy.mock.calls.findIndex(
        ([, delay]) => delay === 15_000,
      );
      expect(timeoutCallIndex).toBeGreaterThanOrEqual(0);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(
        setTimeoutSpy.mock.results[timeoutCallIndex]?.value,
      );
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  it("attaches the audit session, terminal, screen, and source to write requests", async () => {
    setAuditScreen({ key: "warehouse.io.produce.step5", label: "production submit" });
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await postJson("/api/items", { name: "X" });

    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers).toMatchObject({
      "X-MES-Audit-Screen": "warehouse.io.produce.step5",
      "X-MES-Audit-Screen-Label": encodeURIComponent("production submit"),
      "X-MES-Audit-Source": "desktop",
    });
    expect(headers["X-MES-Audit-Session"]).toMatch(/^[a-f0-9-]+$/);
    expect(headers["X-MES-Terminal-Id"]).toMatch(/^[a-f0-9-]+$/);
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

  it("write helpers preserve structured error code and extra on !ok", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({
          ok: false,
          status: 409,
          body: {
            detail: {
              code: "PIN_CHANGE_REQUIRED",
              message: "새 PIN을 먼저 설정해야 합니다.",
              extra: { expires_in: 600 },
            },
          },
        }),
      ),
    ) as unknown as typeof fetch;

    const failure = await postJson("/api/operator-session", {}).catch((error) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      message: "새 PIN을 먼저 설정해야 합니다.",
      status: 409,
      code: "PIN_CHANGE_REQUIRED",
      extra: { expires_in: 600 },
    });
  });

  it("dispatches an authentication-required event for HTTP 401", async () => {
    const listener = vi.fn();
    window.addEventListener("dexcowin_auth_required", listener);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        makeResponse({
          ok: false,
          status: 401,
          body: { detail: { code: "SESSION_EXPIRED", message: "세션이 만료되었습니다." } },
        }),
      ),
    ) as unknown as typeof fetch;

    await fetcher("/api/items").catch(() => undefined);

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("dexcowin_auth_required", listener);
  });

  it("rejects a cross-tab mutation with the tab operator claim and opens an auth boundary", async () => {
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "operator-a", employee_code: "A001", name: "작업자 A" }),
    );
    const listener = vi.fn();
    window.addEventListener("dexcowin_auth_required", listener);
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        makeResponse({
          ok: false,
          status: 403,
          body: {
            detail: {
              code: "ACTOR_MISMATCH",
              message: "세션 작업자와 요청 작업자가 다릅니다.",
            },
          },
        }),
      ),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const failure = await postJson("/api/io/submit", { work_type: "receive" }).catch(
      (error: unknown) => error,
    );

    const headers = new Headers((fetchSpy.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get("X-MES-Employee-Code")).toBe("A001");
    expect(failure).toMatchObject({ status: 403, code: "ACTOR_MISMATCH" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("dexcowin_auth_required", listener);
  });

  it("keeps a same-actor mutation on the normal success path", async () => {
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "operator-a", employee_code: "A001", name: "작업자 A" }),
    );
    const listener = vi.fn();
    window.addEventListener("dexcowin_auth_required", listener);
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ ok: true, body: { accepted: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(postJson("/api/io/submit", { work_type: "receive" })).resolves.toEqual({
      accepted: true,
    });

    const headers = new Headers((fetchSpy.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get("X-MES-Employee-Code")).toBe("A001");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("dexcowin_auth_required", listener);
  });

  it("keeps login and PIN bootstrap claimless but binds logout to the tab operator", async () => {
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "operator-a", employee_code: "A001", name: "작업자 A" }),
    );
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ ok: true, body: { employee: {}, boot_id: "boot-b" } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await postJson("/api/operator-session", { employee_id: "operator-b", pin: "2222" });
    await postJson("/api/operator-session/complete-pin-change", {
      employee_id: "operator-b",
      new_pin: "3333",
    });
    await deleteJson("/api/operator-session");

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchSpy.mock.calls[0]?.[1]?.headers).get("X-MES-Employee-Code")).toBeNull();
    expect(new Headers(fetchSpy.mock.calls[1]?.[1]?.headers).get("X-MES-Employee-Code")).toBeNull();
    expect(new Headers(fetchSpy.mock.calls[2]?.[1]?.headers).get("X-MES-Employee-Code")).toBe(
      "A001",
    );
  });

  it("postJson without body skips Content-Type while keeping audit headers", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await postJson("/api/queue/abc/confirm");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["X-MES-Audit-Session"]).toMatch(/^[a-f0-9-]+$/);
  });

  it("does not turn the current operator cache into an actor header", async () => {
    window.sessionStorage.setItem(
      "dexcowin_mes_operator",
      JSON.stringify({ employee_id: "emp-1", name: "Kim", employee_code: "E22" }),
    );
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetcher("/api/items");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("X-MES-Employee-Code")).toBeNull();
    expect(headers.get("X-Employee-Code")).toBeNull();
  });

  it("fetcher skips the log-only employee header before login", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetcher("/api/items");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.headers).toBeUndefined();
  });

  it("does not attach warehouse step-up credentials to GET requests", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    registerOperatorCredsProvider(() => ({ code: "E001", pin: "2468" }));

    await fetcher("/api/warehouse-map/reconcile");

    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Employee-Code")).toBeNull();
    expect(headers.get("X-Operator-Pin")).toBeNull();
  });

  it("attaches warehouse step-up credentials to mutation requests", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    registerOperatorCredsProvider(() => ({ code: "E001", pin: "2468" }));

    await postJson("/api/warehouse-map/locations", { code: "A-01" });

    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Employee-Code")).toBe("E001");
    expect(headers.get("X-Operator-Pin")).toBe("2468");
  });

  it("does not disclose warehouse step-up credentials to other mutations", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ ok: true, body: { ok: true } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    registerOperatorCredsProvider(() => ({ code: "E001", pin: "2468" }));

    await postJson("/api/io/submit", { work_type: "receive" });

    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Employee-Code")).toBeNull();
    expect(headers.get("X-Operator-Pin")).toBeNull();
  });

  it("fetchBlob sends the registered admin PIN header and returns the response Blob", async () => {
    const blob = new Blob(["audit export"], { type: "text/csv" });
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", blob: () => Promise.resolve(blob) }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    registerAdminPinProvider(() => "2468");

    await expect(fetchBlob("/api/admin/audit-csv/2026-05.csv")).resolves.toBe(blob);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "X-Admin-Pin": "2468" });
  });

  it("adminApi.downloadAuditFile returns the downloaded Blob", async () => {
    const blob = new Blob(["xlsx export"]);
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", blob: () => Promise.resolve(blob) }),
    ) as unknown as typeof fetch;

    await expect(adminApi.downloadAuditFile("2026-05", "xlsx")).resolves.toBe(blob);
  });

  it("adminApi.updateCurrentAuditTerminal sends the current browser terminal", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({
        ok: true,
        body: { terminal_id: "9ea597dc-35ef-4bc0-8a31-4649cff9b5ae", name: "출하 PC-1" },
      })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await adminApi.updateCurrentAuditTerminal({
      terminal_id: "9ea597dc-35ef-4bc0-8a31-4649cff9b5ae",
      name: "출하 PC-1",
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/activity-audit/terminals/current");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      terminal_id: "9ea597dc-35ef-4bc0-8a31-4649cff9b5ae",
      name: "출하 PC-1",
    });
  });

  it("adminApi.listActivityAuditFiles requests the work audit file list", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true, body: [] })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await adminApi.listActivityAuditFiles();

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/activity-audit/files");
  });

  it("adminApi.downloadActivityAuditFile returns the selected monthly workbook", async () => {
    const blob = new Blob(["activity audit"]);
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", blob: () => Promise.resolve(blob) }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(adminApi.downloadActivityAuditFile("2026-08", "xlsx")).resolves.toBe(blob);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/activity-audit/2026-08.xlsx");
  });

  it("adminApi.downloadF704Ledger requests the selected annual F704-02 workbook", async () => {
    const blob = new Blob(["f704 workbook"]);
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", blob: () => Promise.resolve(blob) }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(adminApi.downloadF704Ledger(2026)).resolves.toBe(blob);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/audit-ledger/f704-02.xlsx?year=2026");
  });

  it("adminApi.downloadF705ProductionLog requests the selected annual F705-02 workbook", async () => {
    const blob = new Blob(["f705 workbook"]);
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: "OK", blob: () => Promise.resolve(blob) }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(adminApi.downloadF705ProductionLog(2026)).resolves.toBe(blob);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/admin/production-log/f705-02.xlsx?year=2026");
  });

  it("fetchBlob converts a network error into the fetcher connection guidance", async () => {
    const url = "/api/admin/audit-csv/2026-05.csv";
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("network unavailable"))) as unknown as typeof fetch;

    await expect(fetchBlob(url)).rejects.toThrow(
      `API 연결에 실패했습니다. ${url} 주소에 접근할 수 있는지 확인해 주세요.`,
    );
  });

  it("fetcher and fetchBlob use the same network failure guidance", async () => {
    const url = "/api/admin/audit-csv/2026-05.csv";
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("network unavailable"))) as unknown as typeof fetch;

    const fetcherFailure = await fetcher(url).catch((error) => error);
    const blobFailure = await fetchBlob(url).catch((error) => error);

    expect(fetcherFailure).toMatchObject({
      message: `API 연결에 실패했습니다. ${url} 주소에 접근할 수 있는지 확인해 주세요.`,
    });
    expect(blobFailure).toMatchObject({ message: fetcherFailure.message });
  });

  it("fetchBlob rethrows AbortError without wrapping it", async () => {
    const abort = new Error("request cancelled");
    abort.name = "AbortError";
    globalThis.fetch = vi.fn(() => Promise.reject(abort)) as unknown as typeof fetch;

    await expect(fetchBlob("/api/admin/audit-csv/2026-05.csv")).rejects.toBe(abort);
  });

  it("fetchBlob preserves the exact AbortError object when a signal is supplied", async () => {
    const controller = new AbortController();
    const abort = new Error("request cancelled");
    abort.name = "AbortError";
    const fetchSpy = vi.fn(() => Promise.reject(abort));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchBlob("/api/admin/audit-csv/2026-05.csv", controller.signal)).rejects.toBe(abort);
    expect((fetchSpy.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it("fetchBlob preserves an HTTP error as ApiError with its parsed message", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: false, status: 403, body: { detail: { message: "PIN required" } } })),
    ) as unknown as typeof fetch;

    const failure = await fetchBlob("/api/admin/audit-csv/2026-05.csv").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ message: "PIN required", status: 403 });
  });

  it("deleteJson uses DELETE method and parses JSON when present", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ ok: true, body: { result: "deleted" } })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await deleteJson<{ result: string }>("/api/employees/abc");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ result: "deleted" });
  });

  it("deleteJson tolerates 204 No Content (returns undefined)", async () => {
    const res = {
      ok: true,
      status: 204,
      statusText: "No Content",
      text: () => Promise.resolve(""),
      json: () => Promise.reject(new Error("should not call json on 204")),
    } as unknown as Response;
    globalThis.fetch = vi.fn(() => Promise.resolve(res)) as unknown as typeof fetch;
    const result = await deleteJson<void>("/api/models/1");
    expect(result).toBeUndefined();
  });

  it("write helpers tolerate empty body (returns undefined)", async () => {
    const res = {
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(""),
      json: () => Promise.reject(new Error("should not call json on empty body")),
    } as unknown as Response;
    globalThis.fetch = vi.fn(() => Promise.resolve(res)) as unknown as typeof fetch;
    const result = await postJson<void>("/api/employees/abc/reset-pin", { admin_pin: "0000" });
    expect(result).toBeUndefined();
  });
});
