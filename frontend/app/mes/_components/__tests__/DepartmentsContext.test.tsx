import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartmentMaster } from "@/lib/api";
import {
  DepartmentsProvider,
  useDepartments,
  useRefreshDepartments,
} from "../DepartmentsContext";
import {
  useDepartmentsQuery,
  useUpdateDepartmentMutation,
} from "@/lib/queries/useDepartmentsQuery";

const originalDepartment: DepartmentMaster = {
  id: 1,
  name: "조립",
  display_order: 1,
  is_active: true,
  color_hex: "#2f74e7",
};

function makeResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function SharedSurface({ label }: { label: string }) {
  const departments = useDepartments();
  return <span data-testid={label}>{departments[0]?.name ?? "loading"}</span>;
}

function AdminSurface() {
  const { data = [] } = useDepartmentsQuery();
  return <span data-testid="admin-department">{data[0]?.name ?? "loading"}</span>;
}

function RenameDepartment() {
  const mutation = useUpdateDepartmentMutation();
  return (
    <button
      type="button"
      onClick={() => {
        void mutation.mutateAsync({
          id: originalDepartment.id,
          payload: { name: "조립 2", pin: "0000" },
        });
      }}
    >
      부서명 변경
    </button>
  );
}

function RefreshDepartments() {
  const refresh = useRefreshDepartments();
  return (
    <button type="button" onClick={() => void refresh()}>
      부서 새로고침
    </button>
  );
}

function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 30 * 60_000 },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSurfaces() {
  return render(
    <TestQueryProvider>
      <DepartmentsProvider>
        <SharedSurface label="desktop-department" />
        <SharedSurface label="mobile-department" />
        <AdminSurface />
        <RenameDepartment />
        <RefreshDepartments />
      </DepartmentsProvider>
    </TestQueryProvider>,
  );
}

const originalFetch = globalThis.fetch;
let serverDepartment = originalDepartment;

describe("DepartmentsContext React Query source", () => {
  beforeEach(() => {
    serverDepartment = originalDepartment;
    globalThis.fetch = vi.fn(async (_input, init) => {
      if ((init?.method ?? "GET") === "PUT") {
        serverDepartment = { ...serverDepartment, name: "조립 2" };
        return makeResponse(serverDepartment);
      }
      return makeResponse([serverDepartment]);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("refreshes desktop, mobile, and admin consumers from one mutation revision", async () => {
    renderSurfaces();

    await waitFor(() => {
      expect(screen.getByTestId("desktop-department")).toHaveTextContent("조립");
      expect(screen.getByTestId("mobile-department")).toHaveTextContent("조립");
      expect(screen.getByTestId("admin-department")).toHaveTextContent("조립");
    });

    fireEvent.click(screen.getByRole("button", { name: "부서명 변경" }));

    await waitFor(() => {
      expect(screen.getByTestId("desktop-department")).toHaveTextContent("조립 2");
      expect(screen.getByTestId("mobile-department")).toHaveTextContent("조립 2");
      expect(screen.getByTestId("admin-department")).toHaveTextContent("조립 2");
    });
  });

  it("manual refresh bypasses staleTime for every active department query", async () => {
    renderSurfaces();
    await waitFor(() => expect(screen.getByTestId("admin-department")).toHaveTextContent("조립"));

    serverDepartment = { ...serverDepartment, name: "서버 최신 부서" };
    fireEvent.click(screen.getByRole("button", { name: "부서 새로고침" }));

    await waitFor(() => {
      expect(screen.getByTestId("desktop-department")).toHaveTextContent("서버 최신 부서");
      expect(screen.getByTestId("mobile-department")).toHaveTextContent("서버 최신 부서");
      expect(screen.getByTestId("admin-department")).toHaveTextContent("서버 최신 부서");
    });
  });
});
