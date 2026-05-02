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
      // 측정 대상은 단위 테스트가 있는 lib/ 만 — app/ 컴포넌트는 manual UI smoke 영역.
      include: ["lib/**/*.{ts,tsx}"],
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
      // 첫 게이트 — 보수적 threshold. 향후 라운드에서 상향.
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
