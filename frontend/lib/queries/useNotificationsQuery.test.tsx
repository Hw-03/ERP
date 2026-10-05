import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationsApi } from "@/lib/api/notifications";
import type { NotificationListResponse } from "@/lib/api/types";
import { queryKeys } from "./keys";
import { useMarkNotificationsReadMutation, useNotificationsQuery } from "./useNotificationsQuery";

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
    expect(list).toHaveBeenCalledWith(employeeId);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(otherKey)).toEqual(unread);
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
    const response = deferred<NotificationListResponse>();
    vi.spyOn(notificationsApi, "markNotificationsRead").mockReturnValue(response.promise);
    const { result } = renderHook(() => useMarkNotificationsReadMutation(), { wrapper: makeWrapper(client) });
    const saveError = new Error("읽음 저장 실패");
    let outcome!: Promise<unknown>;
    act(() => {
      outcome = result.current.mutateAsync({ recipient_employee_id: employeeId }).catch((error: unknown) => error);
    });
    expect(client.getQueryData(key)).toEqual(unread);
    await act(async () => response.reject(saveError));
    expect(await outcome).toBe(saveError);
    expect(client.getQueryData(key)).toEqual(unread);
  });
});

describe("다른 기기에서 읽은 알림", () => {
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
