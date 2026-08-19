import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSupportedNodeVersion } from "./require-node-20.mjs";

test("accepts Node.js 20", () => {
  assert.doesNotThrow(() => assertSupportedNodeVersion("v20.20.2"));
});

test("Playwright config and global setup fail closed on direct npx entry", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const config = fs.readFileSync(path.join(root, "playwright.config.ts"), "utf-8");
  const setup = fs.readFileSync(path.join(root, "tests/e2e/global-setup.ts"), "utf-8");

  assert.match(config, /assertSupportedNodeVersion\(process\.version\)/);
  assert.match(setup, /assertSupportedNodeVersion\(process\.version\)/);
  assert.doesNotMatch(config, /npx playwright test --ui/);
});

test("verification scripts stay compatible with every declared Node 20 release", () => {
  assert.doesNotMatch(fs.readFileSync(new URL("./require-node-20.test.mjs", import.meta.url), "utf-8"), /import\.meta\.dirname/);
  assert.doesNotMatch(fs.readFileSync(new URL("./typecheck-baseline.test.mjs", import.meta.url), "utf-8"), /import\.meta\.dirname/);
});

test("rejects unsupported Node.js before frontend tooling starts", () => {
  assert.throws(
    () => assertSupportedNodeVersion("v24.1.0"),
    /requires Node\.js 20/,
  );
});
