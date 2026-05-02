import { describe, it, expect } from "vitest";

/**
 * Round-12 (#1) — barrel 모듈 smoke 테스트.
 *
 * `lib/mes/{department,format,status}.ts` 등 단순 re-export barrel 들의 import path
 * 를 테스트 — runtime 검증보다는 coverage 카운트 + 회귀 (re-export 누락) 방어 목적.
 */

describe("lib/mes barrel re-exports", () => {
  it("@/lib/mes/department exposes mes-department API", async () => {
    const mod = await import("../mes/department");
    expect(typeof mod.normalizeDepartmentName).toBe("function");
    expect(typeof mod.getDepartmentFallbackColor).toBe("function");
    expect(typeof mod.normalizeDepartment).toBe("function");
    expect(mod.MES_DEPARTMENT_COLORS).toBeDefined();
    expect(mod.DEPARTMENT_LABELS).toBeDefined();
  });

  it("@/lib/mes/format exposes mes-format API", async () => {
    const mod = await import("../mes/format");
    expect(typeof mod.formatQty).toBe("function");
    expect(typeof mod.formatErpCode).toBe("function");
    expect(typeof mod.formatDateTime).toBe("function");
    expect(typeof mod.formatPercent).toBe("function");
  });

  it("@/lib/mes/status exposes mes-status API", async () => {
    const mod = await import("../mes/status");
    expect(typeof mod.toMesTone).toBe("function");
    expect(typeof mod.inferTone).toBe("function");
    expect(typeof mod.getTransactionLabel).toBe("function");
    expect(typeof mod.transactionColor).toBe("function");
  });
});
