'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(path.resolve(__dirname, '../../../../frontend/node_modules/typescript'));
const boundaryFile = path.join(__dirname, '../failure-boundary.ts');
test('failure boundary calls the opt-in memory collector before DB and preserves collector failure', async () => {
  const text = fs.readFileSync(boundaryFile, 'utf8');
  const events = [], exported = {};
  const info = { testId: 'selftest', status: 'failed', title: 'SHIP-VARIANT', retry: 0 };
  const fakeFs = { appendFileSync() {}, mkdirSync() {}, writeFileSync() {} };
  const fakeExecute = () => {};
  fakeExecute[require('node:util').promisify.custom] = async () => { events.push('database'); return { stdout: '{}' }; };
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: exported, Buffer, setTimeout, clearTimeout, process: { env: { MES_DIAG_OUTPUT: '/out', MES_DIAG_SOURCE: '/source' }, hrtime: process.hrtime }, require(name) {
    if (name === '@playwright/test') return { test: { info: () => info } };
    if (name === 'node:fs') return fakeFs;
    if (name === 'node:child_process') return { execFile: fakeExecute };
    return require(name);
  } });
  assert.equal(typeof exported.registerFailureCollector, 'function', 'optional first-failure collector is required');
  exported.registerFailureCollector(async () => { events.push('passive'); throw new Error('observer failure'); });
  exported.registerBoundary(undefined);
  await exported.preserveFailure(new Error('original failure'));
  assert.deepEqual(events, ['passive', 'database']);
  events.length = 0;
  info.testId = 'another-test';
  await exported.preserveFailure(new Error('second failure'));
  assert.deepEqual(events, ['database']);
});
test('generated original retains the immediate fill/assert or fill/next sequences and adds cleanup barrier', () => {
  let installer = {};
  try { installer = require('./install-bom-passive.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof installer.generatePassiveSpec, 'function', 'generated-only installer is required');
  const original = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/tests/e2e/shipping-additional-expectations.spec.ts'), 'utf8');
  const generated = installer.generatePassiveSpec(ts, original);
  assert.match(generated.text, /await quantity.fill\("2"\);\s+await expect\(quantity\).toHaveValue\("2"\);/);
  assert.match(generated.text, /getByTestId\("shipping-bom-line-controls"\).fill\("3"\); await step\(page, 3\);/);
  assert.match(generated.text, /await runFixture\(parts\);\s+} finally {\s+if \(__mesNeedsPreservation\(\)\) await __mesBeforeCleanup\(\);/);
  assert.doesNotMatch(generated.text, /waitForTimeout|\.focus\(|inputValue\(/);
});
