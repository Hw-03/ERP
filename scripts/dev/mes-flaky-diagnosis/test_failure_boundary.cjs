"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require(path.resolve(process.env.MES_TOOL_FRONTEND || "frontend", "node_modules/typescript"));
const { instrument } = require("./instrument-failure.cjs");

async function run(body, captureFails = false) {
  let callback;
  const events = [];
  const original = new Error("original assertion");
  const input = `test('guard', async ({ page, actors }) => { ${body} });`;
  const result = instrument(ts, input, "guard.spec.ts", "./helper");
  const helper = { registerBoundary: () => events.push("register"),
    preserveFailure: async error => { assert.equal(error, original); events.push("capture"); if (captureFails) throw Error("observer failure"); },
    needsPreservation: () => true, beforeCleanup: async () => events.push("barrier") };
  const code = ts.transpileModule(result.text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const register = (_title, fn) => { callback = fn; };
  register.afterEach = () => {};
  vm.runInNewContext(code, { exports: {}, require: () => helper, test: register,
    original, events, console: { error() {} } });
  assert.match(callback.toString(), /async \(\{ page, actors \}\)/);
  let error;
  try { await callback({ page: {}, actors: {} }); } catch (failure) { error = failure; }
  return { events, error, original, result };
}
test("first error is preserved before body finally; the exact original exception survives", async () => {
  const row = await run('try { throw original; } finally { events.push("cleanup"); }');
  assert.equal(row.error, row.original);
  assert.ok(row.events.indexOf("capture") < row.events.indexOf("cleanup"));
  assert.equal(row.result.boundaries, 1);
});
test("observer failure cannot replace the original test exception", async () => {
  const row = await run('throw original;', true);
  assert.equal(row.error, row.original);
});
test("handled errors do not trigger evidence capture or add a normal-path await", async () => {
  const row = await run('try { try { throw original; } finally { events.push("cleanup"); } } catch { events.push("handled"); }');
  assert.equal(row.error, undefined);
  assert.deepEqual(row.events, ["register", "cleanup", "handled"]);
});
