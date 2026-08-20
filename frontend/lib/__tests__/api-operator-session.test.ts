import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { operatorSessionApi } from "../api/operator-session";

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? "No Content" : "OK",
    text: () => Promise.resolve(status === 204 ? "" : JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("operatorSessionApi", () => {
  it("creates an operator session with employee ID and PIN", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ employee: {}, boot_id: "boot-1" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await operatorSessionApi.createOperatorSession("emp-1", "1234");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/operator-session");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(init?.body as string)).toEqual({ employee_id: "emp-1", pin: "1234" });
  });

  it("restores the current operator session", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse({ employee: {}, boot_id: "boot-1" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await operatorSessionApi.getOperatorSession();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/operator-session");
    expect(init?.method).toBeUndefined();
    expect(init?.credentials).toBe("include");
  });

  it("completes the initial PIN change without logging in implicitly", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse(undefined, 204)),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await operatorSessionApi.completeOperatorPinChange("emp-1", "5678");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/operator-session/complete-pin-change");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ employee_id: "emp-1", new_pin: "5678" });
  });

  it("deletes the current server session", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse(undefined, 204)),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await operatorSessionApi.deleteOperatorSession();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/operator-session");
    expect(init?.method).toBe("DELETE");
    expect(init?.credentials).toBe("include");
  });

  it("binds a retried logout to the original tab employee claim", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse(undefined, 204)),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await operatorSessionApi.deleteOperatorSession("A001");

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(new Headers(init?.headers).get("X-MES-Employee-Code")).toBe("A001");
  });

  it("cancels only the expected employee PIN-change challenge", async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(makeResponse(undefined, 204)),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await operatorSessionApi.cancelPinChangeChallenge("emp-a");

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/operator-session?pin_change_employee_id=emp-a");
    expect(init?.method).toBe("DELETE");
    expect(init?.credentials).toBe("include");
  });

  it("does not start login B until an in-flight logout A response has settled", async () => {
    let finishLogout!: () => void;
    let browserCookieActor = "actor-a";
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(() =>
        new Promise<Response>((resolve) => {
          finishLogout = () => {
            browserCookieActor = "none";
            resolve(makeResponse(undefined, 204));
          };
        }),
      )
      .mockImplementationOnce(() => {
        browserCookieActor = "actor-b";
        return Promise.resolve(
          makeResponse({ employee: { employee_id: "actor-b" }, boot_id: "boot-b" }),
        );
      });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const logoutA = operatorSessionApi.deleteOperatorSession();
    const loginB = operatorSessionApi.createOperatorSession("actor-b", "2222");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    finishLogout();
    await logoutA;
    const sessionB = await loginB;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(browserCookieActor).toBe("actor-b");
    expect(sessionB.employee.employee_id).toBe("actor-b");
  });

  it("prevents a timed-out login A from overwriting login B with a late response", async () => {
    let firstSignal: AbortSignal | undefined;
    let resolveFirst!: () => void;
    let browserCookieActor = "none";
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve, reject) => {
          firstSignal?.addEventListener(
            "abort",
            () => reject(firstSignal?.reason),
            { once: true },
          );
          resolveFirst = () => {
            if (!firstSignal?.aborted) browserCookieActor = "actor-a";
            resolve(
              makeResponse({
                employee: { employee_id: "actor-a" },
                boot_id: "boot-a",
              }),
            );
          };
        });
      })
      .mockImplementationOnce(() => {
        browserCookieActor = "actor-b";
        return Promise.resolve(
          makeResponse({
            employee: { employee_id: "actor-b" },
            boot_id: "boot-b",
          }),
        );
      });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const firstLogin = operatorSessionApi
      .createOperatorSession("actor-a", "1111")
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    await firstLogin;

    const secondSession = await operatorSessionApi.createOperatorSession("actor-b", "2222");
    const cachedActor = secondSession.employee.employee_id;
    resolveFirst();
    await Promise.resolve();

    expect(firstSignal?.aborted).toBe(true);
    expect(browserCookieActor).toBe("actor-b");
    expect(cachedActor).toBe("actor-b");
  });
});
