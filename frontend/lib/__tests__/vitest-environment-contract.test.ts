import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const configPath = resolve(process.cwd(), "vitest.config.mts");
const packagePath = resolve(process.cwd(), "package.json");

async function readVitestConfig(): Promise<string> {
  return readFile(configPath, "utf8");
}

async function readPackageScripts(): Promise<Record<string, string>> {
  const packageJson = await readFile(packagePath, "utf8");
  return JSON.parse(packageJson).scripts as Record<string, string>;
}

describe("Vitest environment contract", () => {
  it("uses node by default and assigns jsdom only to browser-dependent tests", async () => {
    const config = await readVitestConfig();

    expect(typeof document).toBe("undefined");
    expect(config).toMatch(/environment:\s*"node"/);
    expect(config).toMatch(/isolate:\s*true/);
    expect(config).toMatch(/"\*\*\/\*\.test\.tsx"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/queries\/\*\*\/\*\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/__tests__\/query-\*\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/__tests__\/api-catalog\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/__tests__\/activity-audit-context\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/__tests__\/api-core\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/__tests__\/api-notifications\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"lib\/__tests__\/client-events\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"app\/mes\/_components\/login\/__tests__\/useCurrentOperator\.test\.ts"\s*,\s*"jsdom"/);
    expect(config).toMatch(/"app\/mes\/_components\/_warehouse_v2\/__tests__\/warehouseFlow\.golden\.test\.ts"\s*,\s*"jsdom"/);
  });

  it("keeps test discovery and coverage threshold scope stable", async () => {
    const config = await readVitestConfig();

    expect(config).toMatch(/include:\s*\["app\/\*\*\/\*\.test\.\{ts,tsx\}",\s*"lib\/\*\*\/\*\.test\.\{ts,tsx\}"\]/);
    for (const metric of ["lines", "functions", "branches", "statements"]) {
      expect(config).toMatch(new RegExp(`${metric}:\\s*75`));
    }
  });

  it("uses lightweight local coverage reporters while preserving CI and HTML opt-ins", async () => {
    const scripts = await readPackageScripts();

    expect(scripts["test:coverage"]).toBe("vitest run --coverage --coverage.reporter=text");
    expect(scripts["test:coverage:ci"]).toBe(
      "vitest run --coverage --coverage.reporter=text --coverage.reporter=lcov",
    );
    expect(scripts["test:coverage:html"]).toBe("vitest run --coverage --coverage.reporter=html");
  });
});
