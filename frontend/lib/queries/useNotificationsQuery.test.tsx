import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationsApi } from "@/lib/api/notifications";
import type { NotificationListResponse } from "@/lib/api/types";
import { queryKeys } from "./keys";
import { useDeleteNotificationMutation, useDeleteReadNotificationsMutation, useMarkNotificationsReadMutation, useNotificationsQuery } from "./useNotificationsQuery";
import * as notificationQueries from "./useNotificationsQuery";

const employeeId = "employee-1";
const key = queryKeys.notifications.list(employeeId);
const unread: NotificationListResponse = {
  items: [{
    notification_id: "notification-1",
    recipient_employee_id: employeeId,
    type: "approval_approved",
    title: "결재 승인됨",
    body: null,
    target_tab: null,
    target_section: null,
    related_request_id: null,
    is_read: false,
    created_at: "2026-10-06T09:00:00",
  }],
  unread_count: 1,
};
const read: NotificationListResponse = {
  items: unread.items.map((item) => ({ ...item, is_read: true })),
  unread_count: 0,
};
const clients: QueryClient[] = [];

describe("알림 count 키", () => {
  it("직원별 count 키를 상세 목록과 분리한다", () => {
    expect(queryKeys.notifications).toHaveProperty("unreadCount");
    expect(queryKeys.notifications.unreadCount(employeeId)).toEqual(["notifications", "unreadCount", employeeId]);
    expect(queryKeys.notifications.unreadCount("employee-2")).not.toEqual(queryKeys.notifications.unreadCount(employeeId));
  });
});

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  client.setQueryData(key, unread);
  clients.push(client);
  return client;
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe("알림 읽음 캐시", () => {
  it("읽음 저장 성공 뒤 count를 동기화하고 이전 count 조회가 늦게 도착해도 되돌리지 않는다", async () => {
    const client = makeClient();
    const countKey = queryKeys.notifications.unreadCount(employeeId);
    client.setQueryData(countKey, { count: 1 });
    const oldCount = deferred<{ count: number }>();
    const saved = deferred<NotificationListResponse>();
    const previousFetch = client.fetchQuery({ queryKey: countKey, staleTime: 0, queryFn: ({ signal }) => {
      void signal.aborted;
      return oldCount.promise;
    } }).catch(() => undefined);
    vi.spyOn(notificationsApi, "markNotificationsRead").mockReturnValue(saved.promise);
    const { result } = renderHook(() => useMarkNotificationsReadMutation(), { wrapper: makeWrapper(client) });
    act(() => result.current.mutate({ recipient_employee_id: employeeId }));
    expect(client.getQueryData(countKey)).toEqual({ count: 1 });
    await act(async () => saved.resolve(read));
    await waitFor(() => expect(client.getQueryData(countKey)).toEqual({ count: 0 }));
    await act(async () => oldCount.resolve({ count: 1 }));
    await previousFetch;
    expect(client.getQueryData(countKey)).toEqual({ count: 0 });
  });

  it.each([false, true])("전체 응답으로 오래된 미읽음 목록을 덮지 않는다 (모두 읽음=%s)", async (all) => {
    const client = makeClient();
    const unreadKey = queryKeys.notifications.unread(employeeId);
    const older = { ...unread.items[0], notification_id: "older-notification" };
    const filtered = { items: [...unread.items, older], unread_count: 2 };
    client.setQueryData(unreadKey, filtered);
    const otherKey = queryKeys.notifications.unread("employee-2");
    client.setQueryData(otherKey, filtered);
    const saved = { ...read, unread_count: all ? 0 : 1 };
    const refresh = deferred<NotificationListResponse>();
    vi.spyOn(notificationsApi, "listNotifications").mockReturnValue(refresh.promise);
    vi.spyOn(notificationsApi, "markNotificationsRead").mockResolvedValue(saved);
    const { result } = renderHook(() => ({
      query: useNotificationsQuery(employeeId, { unreadOnly: true }),
      mutation: useMarkNotificationsReadMutation(),
    }), { wrapper: makeWrapper(client) });
    expect(result.current.query.data).toEqual(filtered);

    act(() => result.current.mutation.mutate({
      recipient_employee_id: employeeId,
      ...(all ? {} : { notification_ids: ["notification-1"] }),
    }));

    await waitFor(() => expect(client.getQueryData(unreadKey)).toEqual({
      items: all ? [] : [older], unread_count: all ? 0 : 1,
    }));
    expect(client.getQueryData(key)).toEqual(saved);
    expect(client.getQueryData(otherKey)).toEqual(filtered);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    await act(async () => refresh.resolve({ items: all ? [] : [older], unread_count: saved.unread_count }));
  });

  it("필터 조회가 늦게 끝나도 읽음 성공 상태를 되돌리지 않는다", async () => {
    const client = makeClient();
    const unreadKey = queryKeys.notifications.unread(employeeId);
    client.setQueryData(unreadKey, unread);
    const staleRequest = deferred<NotificationListResponse>();
    const refresh = deferred<NotificationListResponse>();
    const list = vi.spyOn(notificationsApi, "listNotifications")
      .mockReturnValueOnce(staleRequest.promise).mockReturnValue(refresh.promise);
    vi.spyOn(notificationsApi, "markNotificationsRead").mockResolvedValue(read);
    const { result } = renderHook(() => ({
      query: useNotificationsQuery(employeeId, { unreadOnly: true }),
      mutation: useMarkNotificationsReadMutation(),
    }), { wrapper: makeWrapper(client) });
    act(() => { void result.current.query.refetch(); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => result.current.mutation.mutate({ recipient_employee_id: employeeId }));
    await waitFor(() => expect(result.current.query.data).toEqual({ items: [], unread_count: 0 }));
    await act(async () => staleRequest.resolve(unread));
    expect(client.getQueryData(unreadKey)).toEqual({ items: [], unread_count: 0 });
    await act(async () => refresh.resolve({ items: [], unread_count: 0 }));
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
  });

  it.each([false, true])("재조회를 기다리지 않고 읽음 성공 응답을 반영한다 (모두 읽음=%s)", async (all) => {
    const client = makeClient();
    const otherKey = queryKeys.notifications.list("employee-2");
    client.setQueryData(otherKey, unread);
    const refresh = deferred<NotificationListResponse>();
    const list = vi.spyOn(notificationsApi, "listNotifications").mockReturnValue(refresh.promise);
    vi.spyOn(notificationsApi, "markNotificationsRead").mockResolvedValue(read);
    const { result } = renderHook(() => ({
      query: useNotificationsQuery(employeeId),
      mutation: useMarkNotificationsReadMutation(),
    }), { wrapper: makeWrapper(client) });

    act(() => result.current.mutation.mutate({
      recipient_employee_id: employeeId,
      ...(all ? {} : { notification_ids: ["notification-1"] }),
    }));

    await waitFor(() => expect(result.current.query.data).toEqual(read));
    expect(list).toHaveBeenCalledWith(employeeId, false, expect.any(AbortSignal));
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(otherKey)).toEqual(unread);
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    await act(async () => refresh.resolve(read));
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
  });

  it("읽음 저장 전에 시작한 느린 조회가 읽음 성공 응답을 덮어쓰지 않는다", async () => {
    const client = makeClient();
    const staleRequest = deferred<NotificationListResponse>();
    const refresh = deferred<NotificationListResponse>();
    const list = vi.spyOn(notificationsApi, "listNotifications")
      .mockReturnValueOnce(staleRequest.promise)
      .mockReturnValue(refresh.promise);
    vi.spyOn(notificationsApi, "markNotificationsRead").mockResolvedValue(read);
    const { result } = renderHook(() => ({
      query: useNotificationsQuery(employeeId),
      mutation: useMarkNotificationsReadMutation(),
    }), { wrapper: makeWrapper(client) });

    act(() => { void result.current.query.refetch(); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => result.current.mutation.mutate({ recipient_employee_id: employeeId }));
    await waitFor(() => expect(result.current.query.data).toEqual(read));
    await act(async () => staleRequest.resolve(unread));
    expect(client.getQueryData(key)).toEqual(read);
    await act(async () => refresh.resolve(read));
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(result.current.query.data).toEqual(read);
  });

  it("저장 응답을 받은 뒤에도 후속 재조회에서 새 알림을 반영한다", async () => {
    const client = makeClient();
    const latest = { items: [...read.items, { ...unread.items[0], notification_id: "notification-2" }], unread_count: 1 };
    vi.spyOn(notificationsApi, "listNotifications").mockResolvedValue(latest);
    vi.spyOn(notificationsApi, "markNotificationsRead").mockResolvedValue(read);
    const { result } = renderHook(() => ({
      query: useNotificationsQuery(employeeId),
      mutation: useMarkNotificationsReadMutation(),
    }), { wrapper: makeWrapper(client) });

    await act(async () => result.current.mutation.mutateAsync({ recipient_employee_id: employeeId }));
    await waitFor(() => expect(result.current.query.data).toEqual(latest));
  });

  it("저장 중이거나 실패하면 기존 미읽음 상태를 유지한다", async () => {
    const client = makeClient();
    const countKey = queryKeys.notifications.unreadCount(employeeId);
    client.setQueryData(countKey, { count: 1 });
    const response = deferred<NotificationListResponse>();
    vi.spyOn(notificationsApi, "markNotificationsRead").mockReturnValue(response.promise);
    const { result } = renderHook(() => useMarkNotificationsReadMutation(), { wrapper: makeWrapper(client) });
    const saveError = new Error("읽음 저장 실패");
    let outcome!: Promise<unknown>;
    act(() => {
      outcome = result.current.mutateAsync({ recipient_employee_id: employeeId }).catch((error: unknown) => error);
    });
    expect(client.getQueryData(key)).toEqual(unread);
    expect(client.getQueryData(countKey)).toEqual({ count: 1 });
    await act(async () => response.reject(saveError));
    expect(await outcome).toBe(saveError);
    expect(client.getQueryData(key)).toEqual(unread);
    expect(client.getQueryData(countKey)).toEqual({ count: 1 });
  });
});

describe("알림 count 조회", () => {
  it("새 count 훅을 직원별로 조회하고 화면 포커스·재연결에서 fresh 캐시도 재확인한다", async () => {
    expect(notificationQueries).toHaveProperty("useNotificationUnreadCountQuery");
    const client = makeClient();
    const countKey = queryKeys.notifications.unreadCount(employeeId);
    client.setQueryData(countKey, { count: 9 });
    const count = vi.spyOn(notificationsApi, "getUnreadCount").mockResolvedValue({ count: 3 });
    const { result } = renderHook(() => notificationQueries.useNotificationUnreadCountQuery(employeeId), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.data).toEqual({ count: 3 }));
    expect(count).toHaveBeenCalledTimes(1);
    count.mockResolvedValue({ count: 2 });
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(result.current.data).toEqual({ count: 2 }));
    count.mockResolvedValue({ count: 1 });
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.data).toEqual({ count: 1 }));
    expect(client.getQueryData(key)).toEqual(unread);
  });

  it.each(["one", "read"] as const)("삭제(%s) 성공은 count를 임의 감소시키지 않고 늦은 응답을 취소한 후 정확히 재조회한다", async (mode) => {
    expect(notificationQueries).toHaveProperty("useNotificationUnreadCountQuery");
    const client = makeClient();
    const countKey = queryKeys.notifications.unreadCount(employeeId);
    client.setQueryData(countKey, { count: 3 });
    const oldCount = deferred<{ count: number }>();
    const freshCount = deferred<{ count: number }>();
    const count = vi.spyOn(notificationsApi, "getUnreadCount").mockReturnValueOnce(oldCount.promise).mockReturnValue(freshCount.promise);
    vi.spyOn(notificationsApi, "deleteNotification").mockResolvedValue();
    vi.spyOn(notificationsApi, "deleteReadNotifications").mockResolvedValue();
    const { result } = renderHook(() => ({ query: notificationQueries.useNotificationUnreadCountQuery(employeeId), single: useDeleteNotificationMutation(), read: useDeleteReadNotificationsMutation() }), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(count).toHaveBeenCalledTimes(1));
    act(() => {
      if (mode === "one") result.current.single.mutate({ employeeId, notificationId: "already-read" });
      else result.current.read.mutate(employeeId);
    });
    await waitFor(() => expect(count).toHaveBeenCalledTimes(2));
    expect(result.current.query.data).toEqual({ count: 3 });
    await act(async () => freshCount.resolve({ count: 3 }));
    await act(async () => oldCount.resolve({ count: 99 }));
    await waitFor(() => expect((mode === "one" ? result.current.single : result.current.read).isSuccess).toBe(true));
    expect(client.getQueryData(countKey)).toEqual({ count: 3 });
  });
});

describe("다른 기기에서 읽은 알림", () => {
  it("닫힌 팝업의 미읽음 조회는 요청하지 않는다", async () => {
    const list = vi.spyOn(notificationsApi, "listNotifications").mockResolvedValue(read);
    const client = makeClient();
    const { result } = renderHook(() => useNotificationsQuery(employeeId, { unreadOnly: true, enabled: false }), { wrapper: makeWrapper(client) });
    expect(result.current.data).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
  });

  it("미읽음 조회는 서버 필터를 전달하고 전체 캐시를 유지한다", async () => {
    const filtered = { items: [{ ...unread.items[0], notification_id: "old-unread" }], unread_count: 1 };
    const list = vi.spyOn(notificationsApi, "listNotifications").mockResolvedValue(filtered);
    const client = makeClient();
    const { result } = renderHook(() => useNotificationsQuery(employeeId, { unreadOnly: true }), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.data).toEqual(filtered));
    expect(list).toHaveBeenCalledWith(employeeId, true, expect.any(AbortSignal));
    expect(client.getQueryData(key)).toEqual(unread);
  });

  it("fresh 캐시도 화면 포커스 복귀 시 서버 상태로 갱신한다", async () => {
    focusManager.setFocused(false);
    const client = makeClient();
    const list = vi.spyOn(notificationsApi, "listNotifications").mockResolvedValue(read);
    const { result } = renderHook(() => useNotificationsQuery(employeeId), { wrapper: makeWrapper(client) });
    expect(result.current.data).toEqual(unread);
    expect(list).not.toHaveBeenCalled();

    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(result.current.data).toEqual(read));
  });

  it("fresh 캐시도 네트워크 재연결 시 서버 상태로 갱신한다", async () => {
    const client = makeClient();
    vi.spyOn(notificationsApi, "listNotifications").mockResolvedValue(read);
    const { result } = renderHook(() => useNotificationsQuery(employeeId), { wrapper: makeWrapper(client) });
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(result.current.data).toEqual(read));
  });
});
