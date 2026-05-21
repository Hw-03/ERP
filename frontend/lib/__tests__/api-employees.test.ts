import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { employeesApi } from "../api/employees";

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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("employeesApi.getEmployees", () => {
  it("hits /api/employees with empty query", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse([])),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await employeesApi.getEmployees();
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/api\/employees\?/);
  });

  it("encodes department + active_only", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse([])),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await employeesApi.getEmployees({ department: "조립", activeOnly: true });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("active_only=true");
    expect(url).toMatch(/department=/);
  });
});

describe("employeesApi.verifyEmployeePin", () => {
  it("POSTs pin to /verify-pin", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ employee_id: "abc" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await employeesApi.verifyEmployeePin("abc", "1234");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/employees/abc/verify-pin");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ pin: "1234" });
  });
});

describe("employeesApi.resetEmployeePin", () => {
  it("POSTs admin_pin to /reset-pin (snake_case)", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({})),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await employeesApi.resetEmployeePin("emp-1", "0000");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/api/employees/emp-1/reset-pin");
    expect(JSON.parse(init.body as string)).toEqual({ admin_pin: "0000" });
  });
});

describe("employeesApi.deleteEmployee", () => {
  it("DELETE /api/employees/{id}", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ result: "deactivated" })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const out = await employeesApi.deleteEmployee("emp-1");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(out.result).toBe("deactivated");
  });
});

describe("employeesApi.updateEmployee", () => {
  it("PUTs partial payload", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(makeResponse({ employee_id: "emp-1", is_active: false })),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await employeesApi.updateEmployee("emp-1", { is_active: false });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ is_active: false });
  });
});
