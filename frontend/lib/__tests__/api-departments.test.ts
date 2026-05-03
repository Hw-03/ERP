import { describe, it, expect, vi, afterEach } from "vitest";
import { departmentsApi } from "../api/departments";

function makeResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("departmentsApi", () => {
  it("getAppSession GET /api/app-session", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ boot_id: "b", started_at: "" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.getAppSession();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/app-session");
  });

  it("getDepartments without params", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.getDepartments();
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments");
  });

  it("getDepartments with isActive=true → query string", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse([])));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.getDepartments({ isActive: true });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("is_active=true");
  });

  it("deleteDepartment DELETE with pin in query", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.deleteDepartment(7, "0000");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments/7");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("pin=0000");
  });

  it("reorderDepartments PATCH /api/departments/reorder", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({ ok: true })));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.reorderDepartments({ items: [{ id: 1, display_order: 0 }], pin: "0000" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
  });

  it("createDepartment POST /api/departments", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.createDepartment({ name: "AS2", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
  });

  it("updateDepartment PUT /api/departments/{id}", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(makeResponse({})));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await departmentsApi.updateDepartment(7, { name: "rename", pin: "0000" });
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/departments/7");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
  });
});
