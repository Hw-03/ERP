import assert from "node:assert/strict";
import test from "node:test";
import { seedOperator } from "./_mobile-auth.mjs";

test("mobile assessment uses independent roles and omits obsolete session grades", async () => {
  const originalFetch = globalThis.fetch;
  const employees = [
    { employee_id: "old-admin", name: "legacy", is_active: true, level: "admin", warehouse_role: "none", department_role: "none" },
    { employee_id: "approver", name: "department approver", is_active: true, level: "staff", warehouse_role: "none", department_role: "primary" },
  ];
  const initialized = [];
  globalThis.fetch = async (url) => ({ ok: true, json: async () => url.endsWith("/api/app-session") ? { boot_id: "qa-boot" } : employees });
  try {
    const operator = await seedOperator({ addInitScript: async (_script, values) => initialized.push(values) }, "http://qa.invalid");
    assert.equal(operator.employee_id, "approver");
    assert.equal(Object.hasOwn(operator, "level"), false);
    assert.equal(initialized[0][3], "qa-boot");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
