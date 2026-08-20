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

test("operator helpers reuse global-setup-issued HttpOnly sessions without repeated issuance", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const e2eHelper = fs.readFileSync(path.join(root, "tests/e2e/_helpers.ts"), "utf-8");
  const globalSetup = fs.readFileSync(path.join(root, "tests/e2e/global-setup.ts"), "utf-8");
  const mobileAuth = fs.readFileSync(path.join(root, "scripts/_mobile-auth.mjs"), "utf-8");

  assert.doesNotMatch(e2eHelper, /page\.request\.post\("\/api\/operator-session"/);
  assert.match(e2eHelper, /page\.context\(\)\.addCookies/);
  assert.match(e2eHelper, /page\.request\.get\("\/api\/operator-session"\)/);
  assert.doesNotMatch(e2eHelper, /sessionStorage|\/api\/app-session/);
  assert.match(globalSetup, /storageState\(\)/);
  assert.match(globalSetup, /cookie\.name === OPERATOR_SESSION_COOKIE && cookie\.httpOnly/);
  assert.match(globalSetup, /operatorAuth/);
  assert.match(globalSetup, /context\.post\("\/api\/operator-session"/);
  assert.match(globalSetup, /complete-pin-change/);
  assert.match(mobileAuth, /context\.request\.post\(`\$\{baseUrl\}\/api\/operator-session`/);
  assert.doesNotMatch(mobileAuth, /sessionStorage|\/api\/app-session/);
});

test("global setup stock seed uses a real Employee actor and complete warehouse line shape", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const globalSetup = fs.readFileSync(path.join(root, "tests/e2e/global-setup.ts"), "utf-8");

  assert.match(
    globalSetup,
    /actor = db\.query\(Employee\).*warehouseEmployee\.employee_id.*\.one\(\)/,
  );
  assert.match(globalSetup, /db, requester=actor, request_type=StockRequestTypeEnum\.WAREHOUSE_TO_DEPT/);
  assert.match(
    globalSetup,
    /from_bucket=RequestBucketEnum\.WAREHOUSE, from_department=None, to_bucket=RequestBucketEnum\.PRODUCTION/,
  );
});
