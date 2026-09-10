import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

import { findRegressions, parseDiagnostics } from "./typecheck-baseline.mjs";

test("groups TypeScript diagnostics by file and error code", () => {
  const diagnostics = parseDiagnostics([
    "lib/a.test.ts(1,2): error TS2493: tuple issue",
    "lib/a.test.ts(4,5): error TS2493: tuple issue",
    "lib/b.test.tsx(7,8): error TS2322: assignment issue",
  ].join("\n"));

  assert.deepEqual(diagnostics, {
    "lib/a.test.ts:TS2493:tuple issue": 2,
    "lib/b.test.tsx:TS2322:assignment issue": 1,
  });
});

function runFakeCompiler(source, baselineDiagnostics = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mes-ts-baseline-"));
  const fake = path.join(temp, "fake-tsc.mjs");
  const baseline = path.join(temp, "baseline.json");
  fs.writeFileSync(fake, source, "utf-8");
  fs.writeFileSync(baseline, JSON.stringify({
    project: "fake.json",
    diagnostic_count: Object.values(baselineDiagnostics).reduce((total, count) => total + count, 0),
    diagnostics: baselineDiagnostics,
  }), "utf-8");
  return spawnSync(
    process.execPath,
    [path.resolve(HERE, "typecheck-baseline.mjs"), "fake.json", baseline],
    { encoding: "utf-8", env: { ...process.env, TYPECHECK_TSC_PATH: fake } },
  );
}

test("actual CLI accepts only parsed known diagnostics from the compiler", () => {
  const result = runFakeCompiler(
    `process.stderr.write("a.test.ts(1,2): error TS2322: known issue\\n"); process.exit(2);`,
    { "a.test.ts:TS2322:known issue": 1 },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("actual CLI rejects unparsed fatal compiler output", () => {
  const result = runFakeCompiler(`process.stderr.write("FATAL compiler crashed\\n"); process.exit(2);`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FATAL compiler crashed/);
});

test("actual CLI rejects unexpected compiler exit", () => {
  const result = runFakeCompiler(`process.stderr.write("UNEXPECTED-MARKER\\n"); process.exit(7);`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /UNEXPECTED-MARKER/);
});

test("actual CLI rejects compiler termination by signal", () => {
  const result = runFakeCompiler(`process.stderr.write("SIGNAL-MARKER\\n"); process.kill(process.pid, "SIGTERM");`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SIGNAL-MARKER/);
});

test("actual CLI rejects compiler spawn errors", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mes-ts-baseline-missing-"));
  const baseline = path.join(temp, "baseline.json");
  fs.writeFileSync(baseline, JSON.stringify({ diagnostics: {} }), "utf-8");
  const result = spawnSync(
    process.execPath,
    [path.resolve(HERE, "typecheck-baseline.mjs"), "fake.json", baseline],
    { encoding: "utf-8", env: { ...process.env, TYPECHECK_TSC_PATH: path.join(temp, "missing") } },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /missing/);
});

test("actual CLI rejects inconsistent baseline metadata", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mes-ts-baseline-metadata-"));
  const fake = path.join(temp, "fake-tsc.mjs");
  const baseline = path.join(temp, "baseline.json");
  fs.writeFileSync(fake, "process.exit(0);", "utf-8");
  fs.writeFileSync(baseline, JSON.stringify({ project: "wrong.json", diagnostic_count: 9, diagnostics: {} }), "utf-8");
  const result = spawnSync(process.execPath, [path.resolve(HERE, "typecheck-baseline.mjs"), "expected.json", baseline], {
    encoding: "utf-8",
    env: { ...process.env, TYPECHECK_TSC_PATH: fake },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /baseline metadata/i);
});

test("does not drop global compiler diagnostics", () => {
  assert.deepEqual(
    parseDiagnostics("error TS18003: No inputs were found in config file 'missing.json'."),
    { "<global>:TS18003:No inputs were found in config file 'missing.json'.": 1 },
  );
});

test("reports only diagnostics above the checked-in ceiling", () => {
  assert.deepEqual(
    findRegressions(
      { "a.test.ts:TS2322:assignment issue": 3, "new.test.ts:TS2345:new issue": 1 },
      { "a.test.ts:TS2322:assignment issue": 2 },
    ),
    [
      { key: "a.test.ts:TS2322:assignment issue", baseline: 2, actual: 3 },
      { key: "new.test.ts:TS2345:new issue", baseline: 0, actual: 1 },
    ],
  );
});
