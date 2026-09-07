import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DepartmentMaster } from "@/lib/api";
import {
  DirtyGuardProvider,
  useConfirmNavigation,
} from "@/lib/ui/dirty-guard";
import { AdminDepartmentsProvider } from "../AdminDepartmentsContext";
import { AdminDepartmentsSection } from "../AdminDepartmentsSection";

const assembly: DepartmentMaster = {
  id: 1,
  name: "조립",
  display_order: 1,
  is_active: true,
  color_hex: "#2f74e7",
};
const processing: DepartmentMaster = {
  id: 2,
  name: "가공",
  display_order: 2,
  is_active: true,
  color_hex: "#16a34a",
};

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function GlobalNavigationProbe({ onNavigate }: { onNavigate: () => void }) {
  const confirmNavigation = useConfirmNavigation();
  return (
    <button type="button" onClick={() => confirmNavigation(onNavigate)}>
      전역 이동
    </button>
  );
}

function TestQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function Harness({
  onError,
  onNavigate,
}: {
  onError: (message: string) => void;
  onNavigate: () => void;
}) {
  const [departments] = useState([assembly, processing]);
  const [selectedDept, setSelectedDept] = useState<DepartmentMaster | null>(assembly);
  const [showDepartments, setShowDepartments] = useState(true);

  return (
    <TestQueryProvider>
      <DirtyGuardProvider>
        {showDepartments && (
          <AdminDepartmentsProvider
            departments={departments}
            selectedDept={selectedDept}
            setSelectedDept={setSelectedDept}
            onStatusChange={vi.fn()}
            onError={onError}
            adminPin="0000"
          >
            <AdminDepartmentsSection
              employees={[]}
              items={[]}
            />
          </AdminDepartmentsProvider>
        )}
        <span data-testid="selected-department">{selectedDept?.name ?? "none"}</span>
        <GlobalNavigationProbe onNavigate={onNavigate} />
        <button type="button" onClick={() => setShowDepartments(false)}>
          강제 언마운트
        </button>
      </DirtyGuardProvider>
    </TestQueryProvider>
  );
}

const originalFetch = globalThis.fetch;

describe("department save navigation contract", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("waits for persistence and baseline installation before local department navigation", async () => {
    const pending = deferred<Response>();
    vi.mocked(globalThis.fetch).mockReturnValue(pending.promise);
    const { container } = render(<Harness onError={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), {
      target: { value: "조립 2" },
    });
    fireEvent.click(container.querySelector("[data-admin-department-row='2']")!);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("selected-department")).toHaveTextContent("조립");

    fireEvent.click(screen.getByRole("button", { name: "저장하고 이동" }));
    expect(screen.getByTestId("selected-department")).toHaveTextContent("조립");

    pending.resolve(makeResponse({ ...assembly, name: "조립 2" }));
    await waitFor(() => {
      expect(screen.getByTestId("selected-department")).toHaveTextContent("가공");
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the form and navigation blocked when persistence fails", async () => {
    const pending = deferred<Response>();
    vi.mocked(globalThis.fetch).mockReturnValue(pending.promise);
    const onError = vi.fn();
    const { container } = render(<Harness onError={onError} onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), {
      target: { value: "실패할 이름" },
    });
    fireEvent.click(container.querySelector("[data-admin-department-row='2']")!);
    fireEvent.click(screen.getByRole("button", { name: "저장하고 이동" }));
    pending.reject(new Error("저장 실패"));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("연결 실패"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("selected-department")).toHaveTextContent("조립");
    expect(screen.getByRole("textbox", { name: "부서명" })).toHaveValue("실패할 이름");
  });

  it("persists edits made during an in-flight save before navigation proceeds", async () => {
    const firstSave = deferred<Response>();
    const latestSave = deferred<Response>();
    vi.mocked(globalThis.fetch)
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(latestSave.promise);
    const { container } = render(<Harness onError={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), {
      target: { value: "저장 중 값" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), {
      target: { value: "후속 편집" },
    });
    fireEvent.click(container.querySelector("[data-admin-department-row='2']")!);
    fireEvent.click(screen.getByRole("button", { name: "저장하고 이동" }));

    firstSave.resolve(makeResponse({ ...assembly, name: "저장 중 값" }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    const latestRequest = vi.mocked(globalThis.fetch).mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(latestRequest.body))).toMatchObject({ name: "후속 편집" });
    expect(screen.getByTestId("selected-department")).not.toHaveTextContent("가공");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    latestSave.resolve(makeResponse({ ...assembly, name: "후속 편집" }));
    await waitFor(() => {
      expect(screen.getByTestId("selected-department")).toHaveTextContent("가공");
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after one request when the server normalizes the saved name", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      makeResponse({ ...assembly, name: "조립 2" }),
    );
    const { container } = render(<Harness onError={vi.fn()} onNavigate={vi.fn()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), {
      target: { value: "  조립 2  " },
    });
    fireEvent.click(container.querySelector("[data-admin-department-row='2']")!);
    fireEvent.click(screen.getByRole("button", { name: "저장하고 이동" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-department")).toHaveTextContent("가공");
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("registers global dirty state and removes the registry entry on unmount", async () => {
    const onNavigate = vi.fn();
    render(<Harness onError={vi.fn()} onNavigate={onNavigate} />);

    fireEvent.change(screen.getByRole("textbox", { name: "부서명" }), {
      target: { value: "작성 중" },
    });
    fireEvent.click(screen.getByRole("button", { name: "전역 이동" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    fireEvent.click(screen.getByRole("button", { name: "강제 언마운트" }));
    fireEvent.click(screen.getByRole("button", { name: "전역 이동" }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
