import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { AdminSessionProvider, useAdminSession } from "../admin-session";
import { postJson, fetcher } from "@/lib/api-core";

// Helper: 표준 Response mock --------------------------------------

function makeOkResponse(body: unknown = {}): Response {
  const text = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AdminSessionProvider>{children}</AdminSessionProvider>
);

describe("useAdminSession", () => {
  it("throws when used outside of <AdminSessionProvider>", () => {
    // React 가 error boundary 없는 throw 를 콘솔에 찍는데, 테스트 가독성을 위해 silence.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAdminSession())).toThrow(
      /AdminSessionProvider/,
    );
    spy.mockRestore();
  });

  it("returns null pin initially and updates on setPin", () => {
    const { result } = renderHook(() => useAdminSession(), { wrapper });
    expect(result.current.pin).toBeNull();

    act(() => {
      result.current.setPin("1234");
    });
    expect(result.current.pin).toBe("1234");
  });

  it("clears pin to null when clearPin is called", () => {
    const { result } = renderHook(() => useAdminSession(), { wrapper });
    act(() => {
      result.current.setPin("9999");
    });
    expect(result.current.pin).toBe("9999");

    act(() => {
      result.current.clearPin();
    });
    expect(result.current.pin).toBeNull();
  });
});

describe("AdminSessionProvider × api-core PIN injection", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(makeOkResponse({ ok: true })),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("injects X-Admin-Pin header into postJson after setPin", async () => {
    const { result } = renderHook(() => useAdminSession(), { wrapper });

    // PIN 미설정 — 헤더에 X-Admin-Pin 없음.
    await postJson("/api/x", { foo: 1 });
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const firstInit = fetchSpy.mock.calls[0][1] as RequestInit;
    const firstHeaders = (firstInit.headers ?? {}) as Record<string, string>;
    expect(firstHeaders["X-Admin-Pin"]).toBeUndefined();
    expect(firstHeaders["Content-Type"]).toBe("application/json");

    // PIN 설정 — 이후 요청은 헤더 자동 주입.
    act(() => {
      result.current.setPin("4242");
    });
    await postJson("/api/y", { bar: 2 });
    const secondInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const secondHeaders = (secondInit.headers ?? {}) as Record<string, string>;
    expect(secondHeaders["X-Admin-Pin"]).toBe("4242");
    expect(secondHeaders["Content-Type"]).toBe("application/json");
  });

  it("injects X-Admin-Pin header into fetcher (GET) after setPin", async () => {
    const { result } = renderHook(() => useAdminSession(), { wrapper });
    act(() => {
      result.current.setPin("7777");
    });

    await fetcher("/api/z");
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-Admin-Pin"]).toBe("7777");
  });

  it("stops injecting X-Admin-Pin after Provider unmounts", async () => {
    const { result, unmount } = renderHook(() => useAdminSession(), { wrapper });
    act(() => {
      result.current.setPin("5555");
    });
    unmount();

    await postJson("/api/q", { foo: 1 });
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-Admin-Pin"]).toBeUndefined();
  });

  it("Provider renders children without throwing", () => {
    const { getByText } = render(
      <AdminSessionProvider>
        <span>child-rendered</span>
      </AdminSessionProvider>,
    );
    expect(getByText("child-rendered")).toBeInTheDocument();
  });
});
