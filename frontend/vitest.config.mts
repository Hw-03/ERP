import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["app/**/*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // 측정 대상 — 단위 테스트가 작성된 정본 모듈만 측정.
      // Round-16 (#1): admin/catalog/departments/operations/production/queue/stock-requests
      // mock 테스트 추가하면서 coverage include 에 합류.
      include: [
        "lib/api-core.ts",
        "lib/mes-department.ts",
        "lib/mes-format.ts",
        "lib/mes-status.ts",
        "lib/api/admin.ts",
        "lib/api/catalog.ts",
        "lib/api/departments.ts",
        "lib/api/employees.ts",
        "lib/api/inventory.ts",
        "lib/api/items.ts",
        "lib/api/operations.ts",
        "lib/api/production.ts",
        "lib/api/queue.ts",
        "lib/api/stock-requests.ts",
        "lib/mes/**/*.ts",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/_archive/**",
        "**/*.d.ts",
        // 타입 정의 / barrel 은 runtime 코드가 없어 coverage 의미 없음.
        "lib/api/types/**",
        "lib/api/types.ts",
        "lib/api/index.ts",
        "lib/api.ts",
        "lib/mes/index.ts",
      ],
      // Round-12 (#1) — 50 → 75 상향. 정본 모듈은 모두 80%+ 도달.
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 75,
        statements: 75,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
