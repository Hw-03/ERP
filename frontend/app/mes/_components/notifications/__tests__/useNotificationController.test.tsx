import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationListResponse } from "@/lib/api/types";
import { queryKeys } from "@/lib/queries/keys";
import type { Operator } from "../../login/useCurrentOperator";
import { useNotificationController } from "../useNotificationController";

const pendingKey = "dexcowin_mes_login_popup_pending";
const fixture: NotificationListResponse = {
  items: [{ notification_id: "n-1", recipient_employee_id: "emp-1", type: "approval_approved", title: "승인 알림", body: null,
    target_tab: null, target_section: null, related_request_id: null, is_read: false, created_at: "2026-10-27T09:00:00" }],
  unread_count: 3,
};
const operator: Operator = { employee_id: "emp-1", employee_code: "E1", name: "테스트", role: "employee", department: "조립",
  warehouse_role: "none", department_role: "none", as_research_approver: false, assigned_model_slots: [], io_enabled: true,
  hidden_sidebar_tabs: [], loginPopupEnabled: true };
const clients: QueryClient[] = [];
const originalFetch = globalThis.fetch;

function response(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function Host({ currentOperator = operator, hidden = false }: { currentOperator?: Operator; hidden?: boolean }) {
  const controller = useNotificationController({ operator: currentOperator, loginDialogEnabled: true });
  return <div ref={controller.visibilityRef} style={hidden ? { display: "none" } : undefined}>
    <output data-testid="count">{controller.unread}</output>
    <button onClick={controller.openDialog}>열기</button>
    {controller.open && <section aria-label="알림 열림">
      <output data-testid="filter">{controller.dialogProps.filter}</output>
      <button onClick={() => controller.dialogProps.onFilterChange("unread")}>미읽음</button>
      <button onClick={() => controller.dialogProps.onFilterChange("all")}>전체</button>
      <button onClick={controller.dialogProps.onClose}>닫기</button>
      {controller.dialogProps.items.map((item) => <span key={item.notification_id}>{item.title}</span>)}
    </section>}
  </div>;
}

function setup(props: Parameters<typeof Host>[0] = {}, client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(queryClient);
  return { client: queryClient, ...render(<QueryClientProvider client={queryClient}><Host {...props} /></QueryClientProvider>) };
}

function requests(spy: ReturnType<typeof vi.fn>, count: boolean): string[] {
  return spy.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/unread-count") === count);
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("알림 상세 지연 조회", () => {
  it("fresh 전체·미읽음 캐시가 있어도 수동 열기와 필터 진입 때 서버 상세를 조회한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.notifications.list("emp-1"), { ...fixture, items: [{ ...fixture.items[0], title: "이전 전체" }] });
    client.setQueryData(queryKeys.notifications.unread("emp-1"), { ...fixture, items: [{ ...fixture.items[0], title: "이전 미읽음" }] });
    const fetchSpy = vi.fn((url: RequestInfo | URL) => {
      const address = String(url);
      return Promise.resolve(response(address.includes("/unread-count") ? { count: 3 }
        : { ...fixture, items: [{ ...fixture.items[0], title: address.includes("unread_only=true") ? "최신 미읽음" : "최신 전체" }] }));
    });
    globalThis.fetch = fetchSpy;
    setup({}, client);
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("3"));
    fireEvent.click(screen.getByText("열기"));
    await screen.findByText("최신 전체");
    fireEvent.click(screen.getByText("미읽음"));
    await screen.findByText("최신 미읽음");
    expect(requests(fetchSpy, false)).toHaveLength(2);
  });

  it("닫힘에는 count만 조회하고 열린 필터 하나만 갱신하며 닫을 때 count를 재확인한다", async () => {
    const fetchSpy = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("/unread-count") ? { count: 3 } : fixture)));
    globalThis.fetch = fetchSpy;
    const { client } = setup();
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("3"));
    expect(requests(fetchSpy, false)).toHaveLength(0);
    fireEvent.click(screen.getByText("열기"));
    await screen.findByText("승인 알림");
    expect(requests(fetchSpy, false)).toHaveLength(1);
    fireEvent.click(screen.getByText("미읽음"));
    await waitFor(() => expect(requests(fetchSpy, false)).toHaveLength(2));
    expect(requests(fetchSpy, false)[1]).toContain("unread_only=true");
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.notifications.all }); });
    expect(requests(fetchSpy, false)).toHaveLength(3);
    expect(requests(fetchSpy, true)).toHaveLength(1);
    fireEvent.click(screen.getByText("닫기"));
    await waitFor(() => expect(requests(fetchSpy, true)).toHaveLength(2));
    expect(requests(fetchSpy, false)).toHaveLength(3);
  });

  it("상세 성공의 unread_count를 독립 count 캐시에 반영한다", async () => {
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("/unread-count") ? { count: 3 } : { ...fixture, unread_count: 1 })));
    const { client } = setup();
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("3"));
    fireEvent.click(screen.getByText("열기"));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    expect(client.getQueryData(queryKeys.notifications.unreadCount("emp-1"))).toEqual({ count: 1 });
  });

  it("필터 전환 전에 시작한 상세가 늦게 도착해도 새 필터의 count를 되돌리지 않는다", async () => {
    const oldAll = deferred<Response>();
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
      const address = String(url);
      return address.includes("/unread-count") ? Promise.resolve(response({ count: 3 }))
        : address.includes("unread_only=true") ? Promise.resolve(response({ ...fixture, unread_count: 1 })) : oldAll.promise;
    });
    const { client } = setup();
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("3"));
    fireEvent.click(screen.getByText("열기"));
    fireEvent.click(screen.getByText("미읽음"));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    await act(async () => oldAll.resolve(response({ ...fixture, unread_count: 99 })));
    expect(client.getQueryData(queryKeys.notifications.unreadCount("emp-1"))).toEqual({ count: 1 });
  });
});

describe("로그인 알림 count 부트스트랩", () => {
  it("로그인 팝업도 fresh 미읽음 캐시에 머물지 않고 새 상세를 조회한다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.notifications.unread("emp-1"), { ...fixture, items: [{ ...fixture.items[0], title: "이전 미읽음" }] });
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(response(String(url).includes("/unread-count") ? { count: 3 } : fixture)));
    window.sessionStorage.setItem(pendingKey, "emp-1");
    setup({}, client);
    await screen.findByText("승인 알림");
    expect(screen.queryByText("이전 미읽음")).not.toBeInTheDocument();
  });

  it("count 진행 중 수동으로 본 최신 상세는 로그인 마커를 소비하고 닫은 뒤 다시 자동 표시하지 않는다", async () => {
    const initialCount = deferred<Response>();
    let countCalls = 0;
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => String(url).includes("/unread-count")
      ? countCalls++ === 0 ? initialCount.promise : Promise.resolve(response({ count: 3 }))
      : Promise.resolve(response(fixture)));
    window.sessionStorage.setItem(pendingKey, "emp-1");
    setup();
    fireEvent.click(screen.getByText("열기"));
    await screen.findByText("승인 알림");
    await waitFor(() => expect(window.sessionStorage.getItem(pendingKey)).toBeNull());
    expect(screen.getByTestId("filter")).toHaveTextContent("all");
    fireEvent.click(screen.getByText("닫기"));
    await waitFor(() => expect(countCalls).toBe(2));
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("3"));
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
    await act(async () => initialCount.resolve(response({ count: 99 })));
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
  });

  it("캐시가 있어도 새 count 성공 전에는 로그인 마커를 소비하지 않는다", async () => {
    const pending = deferred<Response>();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.notifications.unreadCount("emp-1"), { count: 99 });
    client.setQueryData(queryKeys.notifications.list("emp-1"), { ...fixture, unread_count: 99 });
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => String(url).includes("/unread-count") ? pending.promise : Promise.resolve(response(fixture)));
    window.sessionStorage.setItem(pendingKey, "emp-1");
    setup({}, client);
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey)).toBe("emp-1");
    await act(async () => pending.resolve(response({ count: 3 })));
    await screen.findByLabelText("알림 열림");
    expect(screen.getByTestId("filter")).toHaveTextContent("unread");
    expect(window.sessionStorage.getItem(pendingKey)).toBeNull();
  });

  it.each([0, 3])("count 오류는 마커를 유지하고 재시도 정상 %s 응답 뒤에만 소비한다", async (count) => {
    let fail = true;
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => Promise.resolve(String(url).includes("/unread-count")
      ? response(fail ? { detail: "실패" } : { count }, fail ? 500 : 200) : response(fixture)));
    window.sessionStorage.setItem(pendingKey, "emp-1");
    const { client } = setup();
    await waitFor(() => expect(client.getQueryState(queryKeys.notifications.unreadCount("emp-1"))?.status).toBe("error"));
    expect(window.sessionStorage.getItem(pendingKey)).toBe("emp-1");
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
    fail = false;
    await act(async () => { await client.refetchQueries({ queryKey: queryKeys.notifications.unreadCount("emp-1") }); });
    await waitFor(() => expect(window.sessionStorage.getItem(pendingKey)).toBeNull());
    expect(!!screen.queryByLabelText("알림 열림")).toBe(count > 0);
  });

  it("설정 꺼짐은 정상 count 뒤 마커를 소비하고 숨긴 shell은 소비하지 않는다", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(response({ count: 3 })));
    window.sessionStorage.setItem(pendingKey, "emp-1");
    const { rerender, client } = setup({ hidden: true });
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("3"));
    expect(window.sessionStorage.getItem(pendingKey)).toBe("emp-1");
    rerender(<QueryClientProvider client={client}><Host currentOperator={{ ...operator, loginPopupEnabled: false }} /></QueryClientProvider>);
    await waitFor(() => expect(window.sessionStorage.getItem(pendingKey)).toBeNull());
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
  });

  it("직원 전환 후 이전 count가 늦게 도착해도 새 직원 팝업을 열지 않는다", async () => {
    const oldCount = deferred<Response>();
    const newCount = deferred<Response>();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.notifications.unreadCount("emp-2"), { count: 99 });
    globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
      const address = String(url);
      return address.includes("/unread-count") ? (address.includes("emp-2") ? newCount.promise : oldCount.promise) : Promise.resolve(response(fixture));
    });
    const { rerender } = setup({}, client);
    window.sessionStorage.setItem(pendingKey, "emp-2");
    rerender(<QueryClientProvider client={client}><Host currentOperator={{ ...operator, employee_id: "emp-2" }} /></QueryClientProvider>);
    expect(window.sessionStorage.getItem(pendingKey)).toBe("emp-2");
    await act(async () => oldCount.resolve(response({ count: 3 })));
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(pendingKey)).toBe("emp-2");
    await act(async () => newCount.resolve(response({ count: 0 })));
    await waitFor(() => expect(window.sessionStorage.getItem(pendingKey)).toBeNull());
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(screen.queryByLabelText("알림 열림")).not.toBeInTheDocument();
  });
});
