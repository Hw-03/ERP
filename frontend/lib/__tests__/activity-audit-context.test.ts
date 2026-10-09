import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.resetModules();
});

describe("activity audit context", () => {
  it("오래된 비UUID 단말만 복구하고 기존 감사 세션을 보존한다", async () => {
    window.localStorage.setItem("dexcowin_mes_audit_terminal", "legacy-terminal-2025");
    window.sessionStorage.setItem("dexcowin_mes_audit_session", "existing-audit-session");
    window.sessionStorage.setItem("dexcowin_mes_operator", '{"employee_id":"unchanged-employee"}');
    const audit = await import("../activity-audit-context");
    const terminal = audit.getAuditTerminalId();
    expect(terminal).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(audit.getAuditTerminalId()).toBe(terminal);
    expect(audit.getAuditRequestHeaders()["X-MES-Terminal-Id"]).toBe(terminal);
    expect(audit.getAuditRequestHeaders()["X-MES-Audit-Session"]).toBe("existing-audit-session");
    expect(window.sessionStorage.getItem("dexcowin_mes_operator")).toBe('{"employee_id":"unchanged-employee"}');
  });

  it("이미 등록 가능한 유효UUID 단말은 대소문자를 포함해 그대로 유지한다", async () => {
    const terminal = "12345678-ABCD-4000-8000-123456789ABC";
    window.localStorage.setItem("dexcowin_mes_audit_terminal", terminal);
    const audit = await import("../activity-audit-context");
    expect(audit.getAuditTerminalId()).toBe(terminal);
    expect(audit.getAuditRequestHeaders()["X-MES-Terminal-Id"]).toBe(terminal);
    expect(window.localStorage.getItem("dexcowin_mes_audit_terminal")).toBe(terminal);
  });

  it("keeps one browser session and terminal identifier while attaching the current screen", async () => {
    const audit = await import("../activity-audit-context");

    audit.setAuditScreen({ key: "warehouse.io.produce.confirm", label: "입출고 · 부서 입출고 · 생산 · 제출" });
    const first = audit.getAuditRequestHeaders();
    const second = audit.getAuditRequestHeaders();

    expect(first["X-MES-Audit-Session"]).toMatch(/^[a-f0-9-]+$/);
    expect(first["X-MES-Terminal-Id"]).toMatch(/^[a-f0-9-]+$/);
    expect(second).toMatchObject(first);
    expect(first).toMatchObject({
      "X-MES-Audit-Screen": "warehouse.io.produce.confirm",
      "X-MES-Audit-Screen-Label": encodeURIComponent("입출고 · 부서 입출고 · 생산 · 제출"),
    });
  });

  it("starts a new audit session without changing the registered terminal", async () => {
    const audit = await import("../activity-audit-context");

    const before = audit.getAuditRequestHeaders();
    audit.startAuditSession();
    const after = audit.getAuditRequestHeaders();

    expect(after["X-MES-Audit-Session"]).not.toBe(before["X-MES-Audit-Session"]);
    expect(after["X-MES-Terminal-Id"]).toBe(before["X-MES-Terminal-Id"]);
  });

  it("keeps a detailed workflow screen when its parent tab effect runs afterwards", async () => {
    const audit = await import("../activity-audit-context");

    audit.setAuditScreen({ key: "desktop.warehouse", label: "입출고" });
    audit.setAuditScreen(
      { key: "warehouse.io.process.produce.step5", label: "입출고 · 생산 · 제출" },
      { priority: "workflow" },
    );
    audit.setAuditScreen({ key: "desktop.warehouse", label: "입출고" });

    expect(audit.getAuditRequestHeaders()["X-MES-Audit-Screen"]).toBe(
      "warehouse.io.process.produce.step5",
    );
    audit.setAuditScreen(
      { key: "desktop.shipping", label: "출하" },
      { force: true },
    );
    expect(audit.getAuditRequestHeaders()["X-MES-Audit-Screen"]).toBe("desktop.shipping");
  });

  it("uses an RFC UUID fallback when randomUUID is unavailable", async () => {
    const originalRandomUuid = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
    try {
      const audit = await import("../activity-audit-context");

      expect(audit.getAuditTerminalId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: originalRandomUuid });
    }
  });
});
