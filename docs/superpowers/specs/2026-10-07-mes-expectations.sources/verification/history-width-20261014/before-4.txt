import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "mes-expectation-evidence.mjs");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
async function load() {
  assert.ok(fs.existsSync(modulePath), "실제 runner와 현재 입력을 대조하는 근거 검증기가 필요하다");
  return import(pathToFileURL(modulePath).href);
}
const item = (name, status = "passed") => ({ fullName: `suite ${name}`, title: name, status, location: { line: 10, column: 3 }, failureMessages: [] });
const vitest = (rows) => JSON.stringify({ success: true, numTotalTests: rows.length, testResults: [{ name: "/repo/frontend/item.test.ts", status: "passed", assertionResults: rows }] });

function evidenceFixture(captureSnapshot, conditionFingerprint) {
  const row = { id: "ID", decisionIds: ["G01"] };
  const binding = { file: "frontend/item.test.ts", selector: "case A", line: 10, sourceHash: "test-hash", assertion: "expect(ok).toBe(true)" };
  const condition = { id: "c", expected: "works", requiredEvidence: ["test"], bindings: [binding] };
  const files = { "frontend/app/item.ts": "ok", "frontend/item.test.ts": "test", "raw.json": vitest([item("case A")]) };
  const read = (p) => Buffer.from(files[p]);
  const inputs = ["frontend/app/", "frontend/item.test.ts"];
  const snapshot = captureSnapshot(inputs, Object.keys(files), read);
  const report = { schemaVersion: 2, runId: "run-1", startedAt: "2026-10-07T12:00:00+09:00", endedAt: "2026-10-07T12:01:00+09:00", argv: ["node", "vitest", "run"], cwd: "frontend", exitCode: 0, runner: "vitest", root: "/repo", snapshot, raw: { path: "raw.json", sha256: hash(files["raw.json"]) }, conditions: [{ caseId: row.id, conditionId: condition.id, fingerprint: conditionFingerprint(row, condition), targets: [{ file: binding.file, selector: binding.selector, instances: ["suite case A"] }] }], environment: { kind: "unit", versions: { node: "20" } } };
  const observed = { file: binding.file, name: "suite case A", line: 10, mode: "run", expectedFailure: false, retry: 0, repeat: 0, status: "PASS" };
  files["collection.json"] = JSON.stringify({ schemaVersion: 1, collected: [observed], completed: [observed] });
  report.collection = { path: "collection.json", sha256: hash(files["collection.json"]) };
  return { row, condition, files, read, inputs, report };
}

async function reviewedFixture() {
  const evidence = await load();
  const f = evidenceFixture(evidence.captureSnapshot, evidence.conditionFingerprint);
  const leaf = "frontend/tests/e2e/unrelated.spec.ts";
  f.files[leaf] = 'test("unrelated", async () => {});';
  f.inputs = ["frontend/"];
  f.report.snapshot = evidence.captureSnapshot(f.inputs, Object.keys(f.files), f.read);
  f.files["original.json"] = JSON.stringify(f.report);
  f.files["before.txt"] = f.files[leaf];
  f.files[leaf] = 'test("unrelated", async () => { await settle(); });';
  f.files["local.log"] = '  ok 1 [chromium] › tests/e2e/unrelated.spec.ts:1:1 › unrelated (1.2s)\n  1 passed (2s)\n';
  const ref = (p) => ({ path: p, sha256: hash(f.read(p)) });
  const review = {
    schemaVersion: 1, kind: "mes-reviewed-reuse", reviewedAt: "2026-10-14T10:00:00+09:00", head: "a".repeat(40),
    baseline: f.report.snapshot,
    current: evidence.captureSnapshot(f.inputs, Object.keys(f.files), f.read),
    changes: [{ path: leaf, before: ref("before.txt"), reason: "unexecuted-leaf-test" }],
    localVerification: { kind: "playwright-list", exitCode: 0, retries: 0, files: [{ path: leaf, sha256: hash(f.files[leaf]) }], result: ref("local.log"), tests: [{ file: leaf, title: "unrelated" }] },
  };
  const record = { schemaVersion: 3, kind: "reviewed-reuse", original: ref("original.json"), review: null };
  const save = () => { f.files["review.json"] = JSON.stringify(review); record.review = ref("review.json"); };
  // The initial reference is assigned only after the review exists.
  return { ...f, leaf, review, record, save, ref };
}

test("검토 재사용은 실행하지 않은 leaf E2E 변경만 이월하며 원래 실행은 보존한다", async () => {
  const module = await import("./mes-expectation-reviewed-reuse.mjs").catch(() => ({}));
  assert.equal(typeof module.resolveReviewedReuse, "function", "reviewed reuse resolver is required");
  const f = await reviewedFixture(); f.save();
  const resolved = module.resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) });
  assert.deepEqual(resolved.report, f.report);
  const { verifyExecution } = await load();
  assert.deepEqual(verifyExecution(resolved.report, f.row, f.condition, { read: resolved.read, paths: resolved.paths, requiredInputs: f.inputs }), []);
});

test("검토 재사용은 변경 누락·업무 코드·공유 fixture·실행 대상·변조를 거부한다", async () => {
  const { resolveReviewedReuse } = await import("./mes-expectation-reviewed-reuse.mjs");
  for (const mutate of [
    f => f.review.changes = [],
    f => f.files["frontend/app/item.ts"] = "changed product",
    f => f.files["frontend/tests/e2e/_shared.ts"] = "new helper",
    f => f.files["before.txt"] += "tamper",
    f => f.record.original.sha256 = "tamper",
    f => f.review.current.files = [],
    f => f.review.changes.push(f.review.changes[0]),
    f => f.files["frontend/item.test.ts"] += ' import "./tests/e2e/unrelated.spec";',
    f => f.review.changes[0].reason = "trust me",
    f => f.review.localVerification.files[0].sha256 = "wrong",
  ]) {
    const f = await reviewedFixture(); mutate(f); f.save();
    assert.throws(() => resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) }));
  }
});

test("스냅샷이 맞아도 수집된 테스트 파일은 변경 제외할 수 없다", async () => {
  const { resolveReviewedReuse } = await import("./mes-expectation-reviewed-reuse.mjs");
  const f = await reviewedFixture();
  const collection = JSON.parse(f.files["collection.json"]);
  collection.collected.push({ file: f.leaf, name: "unrelated", mode: "run" });
  f.files["collection.json"] = JSON.stringify(collection);
  f.report.collection.sha256 = hash(f.files["collection.json"]);
  f.files["original.json"] = JSON.stringify(f.report);
  f.record.original = f.ref("original.json");
  f.save();
  assert.throws(() => resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) }), /collected|executed/);
});

test("이월된 원문도 raw·조건·바인딩 검사를 그대로 거친다", async () => {
  const { resolveReviewedReuse } = await import("./mes-expectation-reviewed-reuse.mjs");
  const { verifyExecution } = await load();
  const f = await reviewedFixture(); f.save();
  const resolved = resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) });
  f.condition.expected = "changed contract";
  assert.ok(verifyExecution(resolved.report, f.row, f.condition, { read: resolved.read, paths: resolved.paths, requiredInputs: f.inputs }).length);
  f.condition.expected = "works";
  f.condition.bindings[0].selector = "changed selector";
  assert.ok(verifyExecution(resolved.report, f.row, f.condition, { read: resolved.read, paths: resolved.paths, requiredInputs: f.inputs }).length);
});

test("원장 검사는 재사용 구분·리뷰 해시·현재 바인딩을 모두 요구한다", async () => {
  const { validateExpectations, summarize } = await import("./normalize-mes-expectations.mjs");
  const { captureSnapshot, conditionFingerprint } = await load();
  const f = await reviewedFixture();
  const binding = f.condition.bindings[0];
  f.files[binding.file] = 'test("case A", () => { expect(ok).toBe(true); });';
  binding.sourceHash = hash(f.files[binding.file]); binding.line = 1;
  f.review.current = captureSnapshot(f.inputs, Object.keys(f.files), f.read);
  f.review.baseline = captureSnapshot(f.inputs, Object.keys(f.files), p => p === f.leaf ? f.read("before.txt") : f.read(p));
  f.report.snapshot = f.review.baseline;
  f.report.conditions[0].fingerprint = conditionFingerprint(f.row, f.condition);
  const collection = JSON.parse(f.files["collection.json"]);
  for (const list of [collection.collected, collection.completed]) for (const entry of list) entry.line = 1;
  f.files["collection.json"] = JSON.stringify(collection); f.report.collection = f.ref("collection.json");
  const raw = JSON.parse(f.files["raw.json"]); raw.testResults[0].assertionResults[0].location.line = 1;
  f.files["raw.json"] = JSON.stringify(raw); f.report.raw = f.ref("raw.json");
  f.files["original.json"] = JSON.stringify(f.report); f.record.original = f.ref("original.json"); f.save();
  const wrapper = "_attic/runtime/reuse.json"; f.files[wrapper] = JSON.stringify(f.record);
  const assertion = { ...f.condition, coverage: "linked", execution: { status: "PASS", basis: "reviewed-reuse", evidence: [{ evidenceFile: wrapper, evidenceHash: hash(f.files[wrapper]) }] } };
  const cases = [{ ...f.row, source: "CONTRACT", scope: "current-decisions", atomicReview: "reviewed", requiredConditionIds: [assertion.id], assertions: [assertion], currentVerification: "PASS" }];
  const model = { schemaVersion: 2, cases, metrics: summarize(cases) };
  // requiredInputs includes the verifier and Node pin in addition to frontend/.
  const { requiredInputs } = await load();
  for (const file of requiredInputs([binding], Object.keys(f.files)).filter(p => !p.endsWith("/"))) f.files[file] ??= "unchanged input";
  f.inputs = requiredInputs([binding], Object.keys(f.files));
  f.review.current = captureSnapshot(f.inputs, Object.keys(f.files), f.read);
  f.review.baseline = captureSnapshot(f.inputs, Object.keys(f.files), p => p === f.leaf ? f.read("before.txt") : f.read(p));
  f.report.snapshot = f.review.baseline;
  f.files["original.json"] = JSON.stringify(f.report); f.record.original = f.ref("original.json"); f.save();
  f.files[wrapper] = JSON.stringify(f.record); assertion.execution.evidence[0].evidenceHash = hash(f.files[wrapper]);
  const validate = () => validateExpectations(model, f.read, { requireComplete: true, paths: Object.keys(f.files) });
  assert.deepEqual(validate(), []);
  delete assertion.execution.basis; assert.ok(validate().some(e => e.includes("basis")));
  assertion.execution.basis = "reviewed-reuse";
  f.files["review.json"] += " "; assert.ok(validate().some(e => e.includes("hash"))); f.save();
  f.files[binding.file] += "changed"; assert.ok(validate().some(e => e.includes("stale source hash")));
});

test("변경 목록을 다시 작성해도 업무·설정·공유 fixture와 삭제는 제외할 수 없다", async () => {
  const { resolveReviewedReuse } = await import("./mes-expectation-reviewed-reuse.mjs");
  const { captureSnapshot } = await load();
  for (const target of ["frontend/app/item.ts", "frontend/playwright.config.ts", "frontend/tests/e2e/_shared.ts", "DELETE"]) {
    const f = await reviewedFixture();
    if (target === "DELETE") delete f.files[f.leaf];
    else {
      f.files[target] = "old";
      f.review.baseline = captureSnapshot(f.inputs, Object.keys(f.files), p => p === f.leaf ? f.read("before.txt") : f.read(p));
      f.report.snapshot = f.review.baseline;
      f.files["old.txt"] = "old"; f.files[target] = "new";
      f.review.changes.push({ path: target, before: f.ref("old.txt"), reason: "unexecuted-leaf-test" });
    }
    f.review.current = captureSnapshot(f.inputs, Object.keys(f.files), f.read);
    f.files["original.json"] = JSON.stringify(f.report); f.record.original = f.ref("original.json"); f.save();
    assert.throws(() => resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) }), /product\/config\/fixture|deleted/);
  }
});

test("수집 파일을 사용하지 않는 기존 Node 원문 형식도 보존한다", async () => {
  const { resolveReviewedReuse } = await import("./mes-expectation-reviewed-reuse.mjs");
  const f = await reviewedFixture();
  f.report.runner = "node"; delete f.report.collection;
  f.files["original.json"] = JSON.stringify(f.report); f.record.original = f.ref("original.json"); f.save();
  assert.equal(resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) }).report.runner, "node");
});

test("이름이 spec여도 내보내는 helper 또는 기존 참조가 있으면 이월하지 않는다", async () => {
  const { resolveReviewedReuse } = await import("./mes-expectation-reviewed-reuse.mjs");
  const { captureSnapshot } = await load();
  for (const shared of [false, true]) {
    const f = await reviewedFixture();
    if (shared) f.files[f.leaf] += '\nexport const shared = true;';
    else f.files["frontend/item.test.ts"] += ' import "./tests/e2e/unrelated.spec";';
    f.review.current = captureSnapshot(f.inputs, Object.keys(f.files), f.read);
    f.review.baseline = captureSnapshot(f.inputs, Object.keys(f.files), p => p === f.leaf ? f.read("before.txt") : f.read(p));
    f.report.snapshot = f.review.baseline;
    f.files["original.json"] = JSON.stringify(f.report); f.record.original = f.ref("original.json");
    f.review.localVerification.files[0].sha256 = hash(f.files[f.leaf]); f.save();
    assert.throws(() => resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) }), /consumer|export/);
  }
});

test("도구 변경은 소스에 묶인 전체 호환성 검사 원문을 요구한다", async () => {
  const { resolveReviewedReuse, COMPATIBILITY_FILES, COMPATIBILITY_SUITES } = await import("./mes-expectation-reviewed-reuse.mjs");
  const { captureSnapshot } = await load();
  const f = await reviewedFixture();
  const toolFiles = [...new Set([...COMPATIBILITY_FILES, ...COMPATIBILITY_SUITES, "scripts/dev/mes-expectation-evidence.mjs", "scripts/dev/run-mes-expectations.mjs"])].sort();
  for (const file of toolFiles) f.files[file] = "old tool";
  f.inputs = ["frontend/", "scripts/"];
  f.review.baseline = captureSnapshot(f.inputs, Object.keys(f.files), p => p === f.leaf ? f.read("before.txt") : f.read(p));
  const tool = COMPATIBILITY_FILES[0]; f.files["old-tool.txt"] = f.files[tool]; f.files[tool] = "new tool";
  f.review.current = captureSnapshot(f.inputs, Object.keys(f.files), f.read);
  f.review.changes.push({ path: tool, before: f.ref("old-tool.txt"), reason: "verifier-compatibility" });
  f.save();
  const resolve = () => resolveReviewedReuse(f.record, { read: f.read, paths: Object.keys(f.files) });
  assert.throws(resolve, /compatibility/);
  f.files["tools.xml"] = '<testsuites><testsuite><testcase name="compatibility"/></testsuite></testsuites>';
  f.review.compatibility = { kind: "node-junit", exitCode: 0, argv: ["node", "--test", ...COMPATIBILITY_SUITES], files: toolFiles.map(p => ({path: p, sha256: hash(f.files[p])})), result: f.ref("tools.xml") };
  f.save(); assert.equal(resolve().report.runId, f.report.runId);
  const good = structuredClone(f.review.compatibility);
  for (const mutate of [p => p.exitCode = 1, p => p.files.pop(), p => p.argv.pop(), p => p.result.sha256 = "wrong", p => p.files[0].sha256 = "wrong"]) {
    f.review.compatibility = structuredClone(good); mutate(f.review.compatibility); f.save(); assert.throws(resolve, /compatibility|artifact/);
  }
  f.review.compatibility = good;
  f.files["tools.xml"] = '<testsuites><testsuite><testcase name="compatibility"><skipped/></testcase></testsuite></testsuites>';
  f.review.compatibility.result = f.ref("tools.xml"); f.save(); assert.throws(resolve, /failed\/skipped/);
});

