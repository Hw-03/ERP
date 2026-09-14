import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

test("직원 회귀 통합 시험 마지막 합성 DB 정합성", async ({}, testInfo) => {
  const root = resolve(process.cwd(), "..");
  const database = resolve(root, "backend/mes_e2e.db").replaceAll("\\", "/");
  const result = spawnSync("python", [resolve(root, "scripts/ops/check_inventory_integrity.py"), "--db-url", `sqlite:///${database}`, "--json"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const diagnostic = JSON.parse(result.stdout) as { blocking_count: number };
  writeFileSync(testInfo.outputPath("final-integrity.json"), JSON.stringify(diagnostic, null, 2), "utf8");
  expect(diagnostic.blocking_count).toBe(0);
});
