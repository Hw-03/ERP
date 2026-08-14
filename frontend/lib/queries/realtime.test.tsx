import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "./client";
import {
  invalidateOperationalQueries,
  RealtimeSyncProvider,
  useRealtimeRevision,
} from "./realtime";

type EventListener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  listeners = new Map<string, Set<EventListener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emitRevision(data: string): void {
    const event = new MessageEvent("revision", { data });
    this.listeners.get("revision")?.forEach((listener) => listener(event));
  }

  emitError(): void {
    this.onerror?.(new Event("error"));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }
}

const VALID_SNAPSHOT = { revision: 7, updated_at: "2026-08-04T12:00:00+09:00" };

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <RealtimeSyncProvider>{children}</RealtimeSyncProvider>
      </QueryClientProvider>
    );
  };
}

function RevisionValue() {
  return <output data-testid="revision">{String(useRealtimeRevision())}</output>;
}

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(makeResponse(VALID_SNAPSHOT))));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("invalidateOperationalQueries", () => {
  it("무효화하는 operational query root 목록이 정확하다", async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    await invalidateOperationalQueries(client);

    expect(invalidateSpy.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["items"],
      ["inventory"],
      ["transactions"],
      ["shipping"],
      ["stockRequests"],
      ["notifications"],
      ["production"],
      ["bom"],
      ["warehouseMap"],
      ["weekly"],
      ["dailyWorkReports"],
    ]);
  });
});

describe("RealtimeSyncProvider", () => {
  it("named revision SSE의 첫 valid snapshot을 context에 반영하고 operational cache를 무효화한다", async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();

    render(<RevisionValue />, { wrapper: makeWrapper(client) });

    const source = FakeEventSource.instances[0];
    expect(source.url).toBe("/api/realtime/stream");
    expect(source.listeners.has("revision")).toBe(true);
    expect(screen.getByTestId("revision")).toHaveTextContent("null");

    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));

    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("7"));
    expect(invalidateSpy).toHaveBeenCalledTimes(11);
  });

  it("250ms 창의 revision burst를 최신 context와 한 번의 무효화로 합친다", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 7 }));
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 8 }));
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 9 }));
    });

    expect(screen.getByTestId("revision")).toHaveTextContent("null");
    expect(invalidateSpy).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(screen.getByTestId("revision")).toHaveTextContent("null");
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(screen.getByTestId("revision")).toHaveTextContent("9");
    expect(invalidateSpy).toHaveBeenCalledTimes(11);
  });

  it("hidden 탭은 갱신을 보류하고 visible 복귀 때 최신 revision만 한 번 적용한다", async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 7 }));
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 9 }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(screen.getByTestId("revision")).toHaveTextContent("null");
    expect(invalidateSpy).not.toHaveBeenCalled();

    visibility = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(screen.getByTestId("revision")).toHaveTextContent("9");
    expect(invalidateSpy).toHaveBeenCalledTimes(11);
  });

  it("무효화 진행 중에는 겹쳐 실행하지 않고 최신 revision을 다음 창에 적용한다", async () => {
    vi.useFakeTimers();
    const firstInvalidation = deferred<void>();
    const client = makeClient();
    const invalidateSpy = vi
      .spyOn(client, "invalidateQueries")
      .mockImplementation(() => firstInvalidation.promise);
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 7 })));
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByTestId("revision")).toHaveTextContent("7");
    expect(invalidateSpy).toHaveBeenCalledTimes(11);

    act(() => {
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 8 }));
      source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 9 }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByTestId("revision")).toHaveTextContent("7");
    expect(invalidateSpy).toHaveBeenCalledTimes(11);

    await act(async () => {
      firstInvalidation.resolve();
      await firstInvalidation.promise;
      await Promise.resolve();
    });
    await act(async () => vi.advanceTimersByTimeAsync(250));

    expect(screen.getByTestId("revision")).toHaveTextContent("9");
    expect(invalidateSpy).toHaveBeenCalledTimes(22);
  });

  it("unmount 시 대기 중인 revision flush timer도 정리한다", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const { unmount } = render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("같은 revision 반복과 malformed payload를 무시한다", async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(11));

    act(() => {
      source.emitRevision(JSON.stringify(VALID_SNAPSHOT));
      source.emitRevision("not-json");
      source.emitRevision(JSON.stringify({ revision: "8", updated_at: VALID_SNAPSHOT.updated_at }));
      source.emitRevision(JSON.stringify({ revision: 8 }));
      source.emitRevision(JSON.stringify({ revision: -1, updated_at: VALID_SNAPSHOT.updated_at }));
      source.emitRevision(JSON.stringify({ revision: 8, updated_at: "not-a-date" }));
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(11);
    expect(screen.getByTestId("revision")).toHaveTextContent("7");
  });

  it("revision 값이 커지거나 작아져도 이전 값과 다르면 처리한다", async () => {
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("7"));
    act(() => source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 8 })));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("8"));
    act(() => source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 3 })));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("3"));

    expect(invalidateSpy).toHaveBeenCalledTimes(33);
  });

  it("GET 시작 후 적용된 SSE보다 늦게 도착한 GET 응답을 폐기한다", async () => {
    const pendingResponse = deferred<Response>();
    const fetchSpy = vi.fn(() => pendingResponse.promise);
    vi.stubGlobal("fetch", fetchSpy);
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => window.dispatchEvent(new Event("online")));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    act(() => source.emitRevision(JSON.stringify({ ...VALID_SNAPSHOT, revision: 10 })));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("10"));

    await act(async () => {
      pendingResponse.resolve(makeResponse({ ...VALID_SNAPSHOT, revision: 9 }));
      await pendingResponse.promise;
    });

    expect(screen.getByTestId("revision")).toHaveTextContent("10");
    expect(invalidateSpy).toHaveBeenCalledTimes(11);
  });

  it("GET 시작 후 같은 revision의 valid SSE가 도착해도 늦은 GET 응답을 폐기한다", async () => {
    const pendingResponse = deferred<Response>();
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("7"));
    vi.mocked(fetch).mockImplementation(() => pendingResponse.promise);
    act(() => window.dispatchEvent(new Event("online")));
    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));

    await act(async () => {
      pendingResponse.resolve(makeResponse({ ...VALID_SNAPSHOT, revision: 3 }));
      await pendingResponse.promise;
    });

    expect(screen.getByTestId("revision")).toHaveTextContent("7");
    expect(invalidateSpy).toHaveBeenCalledTimes(11);
  });

  it("GET 요청 중 SSE 변화가 없으면 낮은 revision도 DB restore snapshot으로 적용한다", async () => {
    const client = makeClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitRevision(JSON.stringify(VALID_SNAPSHOT)));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("7"));
    vi.mocked(fetch).mockResolvedValue(makeResponse({ ...VALID_SNAPSHOT, revision: 3 }));

    act(() => window.dispatchEvent(new Event("online")));

    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("3"));
  });

  it("interval, online, visibility check가 겹쳐도 GET은 한 건만 진행한다", async () => {
    vi.useFakeTimers();
    const pendingResponse = deferred<Response>();
    const fetchSpy = vi.fn(() => pendingResponse.promise);
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const client = makeClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitError());
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    act(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => vi.advanceTimersByTimeAsync(2_000));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingResponse.resolve(makeResponse(VALID_SNAPSHOT));
      await pendingResponse.promise;
    });
  });

  it("SSE error 동안 1초 polling하고 open되면 polling을 중단한다", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const fetchSpy = vi.mocked(fetch);
    render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitError());
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    act(() => source.emitOpen());
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("online 및 visible 복귀 시 revision GET을 즉시 확인한다", async () => {
    const client = makeClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const fetchSpy = vi.mocked(fetch);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<RevisionValue />, { wrapper: makeWrapper(client) });

    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    expect(fetchSpy).toHaveBeenNthCalledWith(1, "/api/realtime/revision", { cache: "no-store" });
  });

  it("EventSource가 없으면 즉시 GET 확인 후 1초 polling한다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", undefined);
    const client = makeClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const fetchSpy = vi.mocked(fetch);

    render(<RevisionValue />, { wrapper: makeWrapper(client) });

    await act(async () => Promise.resolve());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("unmount 시 EventSource, interval, browser listener를 정리한다", async () => {
    vi.useFakeTimers();
    const client = makeClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    const fetchSpy = vi.mocked(fetch);
    const { unmount } = render(<RevisionValue />, { wrapper: makeWrapper(client) });
    const source = FakeEventSource.instances[0];

    act(() => source.emitError());
    unmount();

    expect(source.closed).toBe(true);
    expect(source.listeners.get("revision")?.size).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    act(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("QueryProvider", () => {
  it("RealtimeSyncProvider를 QueryClientProvider 내부에 영속 mount한다", async () => {
    render(
      <QueryProvider>
        <RevisionValue />
      </QueryProvider>,
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    act(() => FakeEventSource.instances[0].emitRevision(JSON.stringify(VALID_SNAPSHOT)));
    await waitFor(() => expect(screen.getByTestId("revision")).toHaveTextContent("7"));
  });
});
