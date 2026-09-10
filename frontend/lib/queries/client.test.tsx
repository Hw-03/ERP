import { act, render, screen } from "@testing-library/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AUTH_REQUIRED_EVENT, fetcher, postJson } from "@/lib/api-core";
import {
  readCurrentOperator,
  restoreCurrentOperator,
  returnToOperatorLogin,
  type Operator,
} from "@/app/mes/_components/login/useCurrentOperator";
import { QueryProvider } from "./client";

vi.mock("./realtime", () => ({
  RealtimeSyncProvider: ({ children }: { children: ReactNode }) => children,
}));

const ACTOR_SCOPED_QUERY_KEY = ["warehouse", "actor-boundary"] as const;

const OPERATOR_A: Operator = {
  employee_id: "operator-a",
  name: "작업자 A",
  role: "조립/사원",
  department: "조립",
  level: "staff",
  employee_code: "A001",
  warehouse_role: "none",
  department_role: "none",
  assigned_model_slots: [],
  io_enabled: true,
  hidden_sidebar_tabs: [],
  loginPopupEnabled: true,
};

const OPERATOR_B: Operator = {
  ...OPERATOR_A,
  employee_id: "operator-b",
  name: "작업자 B",
  employee_code: "B001",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function QueryClientProbe({ onReady }: { onReady: (client: QueryClient) => void }) {
  onReady(useQueryClient());
  return null;
}

function ActorScopedData({ load }: { load: () => Promise<string> }) {
  const query = useQuery({
    queryKey: ACTOR_SCOPED_QUERY_KEY,
    queryFn: load,
  });
  return <output>{query.data ?? "loading"}</output>;
}

describe("QueryProvider", () => {
  it("인증 경계에서 A의 모든 cache를 지우고 B가 같은 key를 다시 조회한다", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("operator-a-private-data")
      .mockResolvedValueOnce("operator-b-private-data");
    let queryClient!: QueryClient;
    const probe = <QueryClientProbe onReady={(client) => (queryClient = client)} />;
    const view = render(<QueryProvider>{probe}</QueryProvider>);

    const operatorAClient = queryClient;
    await act(async () => {
      await operatorAClient.prefetchQuery({ queryKey: ACTOR_SCOPED_QUERY_KEY, queryFn: load });
    });
    operatorAClient.setQueryData(["admin", "actor-boundary"], "operator-a-admin-data");
    operatorAClient.setQueryData(["permissions", "actor-boundary"], ["warehouse:write"]);
    operatorAClient.getMutationCache().build(operatorAClient, {
      mutationKey: ["warehouse", "operator-a-pending-mutation"],
      mutationFn: async () => undefined,
    });

    view.rerender(
      <QueryProvider>
        {probe}
        <ActorScopedData load={load} />
      </QueryProvider>,
    );
    expect(await screen.findByText("operator-a-private-data")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
    expect(operatorAClient.getQueryCache().getAll()).toHaveLength(3);
    expect(operatorAClient.getMutationCache().getAll()).toHaveLength(1);

    view.rerender(<QueryProvider>{probe}</QueryProvider>);
    act(() => window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT)));

    const operatorBClient = queryClient;
    expect(operatorBClient).not.toBe(operatorAClient);
    expect(operatorAClient.getQueryCache().getAll()).toHaveLength(0);
    expect(operatorAClient.getMutationCache().getAll()).toHaveLength(0);
    expect(operatorBClient.getQueryCache().getAll()).toHaveLength(0);
    expect(operatorBClient.getMutationCache().getAll()).toHaveLength(0);

    view.rerender(
      <QueryProvider>
        {probe}
        <ActorScopedData load={load} />
      </QueryProvider>,
    );

    expect(await screen.findByText("operator-b-private-data")).toBeInTheDocument();
    expect(screen.queryByText("operator-a-private-data")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("경계 이전의 지연 query와 mutation이 완료돼도 B cache epoch를 오염시키지 않는다", async () => {
    const lateQuery = deferred<string>();
    const lateMutation = deferred<string>();
    let queryClient!: QueryClient;
    const probe = <QueryClientProbe onReady={(client) => (queryClient = client)} />;
    const view = render(<QueryProvider>{probe}</QueryProvider>);
    const operatorAClient = queryClient;

    const operatorAQuery = operatorAClient
      .fetchQuery({
        queryKey: ACTOR_SCOPED_QUERY_KEY,
        queryFn: () => lateQuery.promise,
      })
      .catch((error: unknown) => error);
    const operatorAMutation = operatorAClient
      .getMutationCache()
      .build(operatorAClient, {
        mutationKey: ["warehouse", "operator-a-late-mutation"],
        mutationFn: () => lateMutation.promise,
      })
      .execute(undefined);
    expect(operatorAClient.getQueryCache().getAll()).toHaveLength(1);
    expect(operatorAClient.getMutationCache().getAll()).toHaveLength(1);

    act(() => window.dispatchEvent(new CustomEvent(AUTH_REQUIRED_EVENT)));
    const operatorBClient = queryClient;
    expect(operatorBClient).not.toBe(operatorAClient);

    await act(async () => {
      lateQuery.resolve("operator-a-late-query-data");
      lateMutation.resolve("operator-a-late-mutation-result");
      await Promise.all([operatorAQuery, operatorAMutation]);
    });

    expect(operatorBClient.getQueryCache().getAll()).toHaveLength(0);
    expect(operatorBClient.getMutationCache().getAll()).toHaveLength(0);
    expect(operatorBClient.getQueryData(ACTOR_SCOPED_QUERY_KEY)).toBeUndefined();

    const loadOperatorB = vi.fn(async () => "operator-b-fresh-data");
    view.rerender(
      <QueryProvider>
        {probe}
        <ActorScopedData load={loadOperatorB} />
      </QueryProvider>,
    );

    expect(await screen.findByText("operator-b-fresh-data")).toBeInTheDocument();
    expect(screen.queryByText("operator-a-late-query-data")).not.toBeInTheDocument();
    expect(loadOperatorB).toHaveBeenCalledTimes(1);
  });

  it("A의 지연 401이 logout 뒤 복원된 B의 인증·cache epoch를 다시 지우지 않는다", async () => {
    const originalFetch = globalThis.fetch;
    const lateOperatorAResponse = deferred<Response>();
    const authRequiredListener = vi.fn();
    globalThis.fetch = vi.fn(() => lateOperatorAResponse.promise) as unknown as typeof fetch;
    window.addEventListener(AUTH_REQUIRED_EVENT, authRequiredListener);

    let queryClient!: QueryClient;
    const probe = <QueryClientProbe onReady={(client) => (queryClient = client)} />;
    const view = render(<QueryProvider>{probe}</QueryProvider>);

    try {
      act(() => restoreCurrentOperator(OPERATOR_A, "boot-a"));
      const operatorARequest = fetcher("/api/operator-a/private-data").catch(
        (error: unknown) => error,
      );
      const operatorAClient = queryClient;

      act(() => returnToOperatorLogin());
      const operatorBClient = queryClient;
      expect(operatorBClient).not.toBe(operatorAClient);
      expect(authRequiredListener).toHaveBeenCalledTimes(1);

      act(() => restoreCurrentOperator(OPERATOR_B, "boot-b"));
      operatorBClient.setQueryData(ACTOR_SCOPED_QUERY_KEY, "operator-b-private-data");

      await act(async () => {
        lateOperatorAResponse.resolve({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: () => Promise.resolve(JSON.stringify({ detail: "세션이 만료되었습니다." })),
        } as Response);
        await operatorARequest;
      });

      expect(authRequiredListener).toHaveBeenCalledTimes(1);
      expect(queryClient).toBe(operatorBClient);
      expect(readCurrentOperator()?.employee_id).toBe(OPERATOR_B.employee_id);
      expect(operatorBClient.getQueryData(ACTOR_SCOPED_QUERY_KEY)).toBe(
        "operator-b-private-data",
      );
    } finally {
      view.unmount();
      window.removeEventListener(AUTH_REQUIRED_EVENT, authRequiredListener);
      window.sessionStorage.clear();
      globalThis.fetch = originalFetch;
    }
  });

  it("A의 지연 ACTOR_MISMATCH도 B 로그인 뒤의 새 auth generation을 지우지 않는다", async () => {
    const originalFetch = globalThis.fetch;
    const lateOperatorAResponse = deferred<Response>();
    const authRequiredListener = vi.fn();
    globalThis.fetch = vi.fn(() => lateOperatorAResponse.promise) as unknown as typeof fetch;
    window.addEventListener(AUTH_REQUIRED_EVENT, authRequiredListener);

    let queryClient!: QueryClient;
    const probe = <QueryClientProbe onReady={(client) => (queryClient = client)} />;
    const view = render(<QueryProvider>{probe}</QueryProvider>);

    try {
      act(() => restoreCurrentOperator(OPERATOR_A, "boot-a"));
      const operatorARequest = postJson("/api/io/submit", { work_type: "receive" }).catch(
        (error: unknown) => error,
      );

      act(() => returnToOperatorLogin());
      const operatorBClient = queryClient;
      act(() => restoreCurrentOperator(OPERATOR_B, "boot-b"));
      operatorBClient.setQueryData(ACTOR_SCOPED_QUERY_KEY, "operator-b-private-data");

      await act(async () => {
        lateOperatorAResponse.resolve({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: () => Promise.resolve(JSON.stringify({
            detail: {
              code: "ACTOR_MISMATCH",
              message: "세션 작업자와 요청 작업자가 다릅니다.",
            },
          })),
        } as Response);
        await operatorARequest;
      });

      expect(authRequiredListener).toHaveBeenCalledTimes(1);
      expect(queryClient).toBe(operatorBClient);
      expect(readCurrentOperator()?.employee_id).toBe(OPERATOR_B.employee_id);
      expect(operatorBClient.getQueryData(ACTOR_SCOPED_QUERY_KEY)).toBe(
        "operator-b-private-data",
      );
    } finally {
      view.unmount();
      window.removeEventListener(AUTH_REQUIRED_EVENT, authRequiredListener);
      window.sessionStorage.clear();
      globalThis.fetch = originalFetch;
    }
  });
});
