import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-mes-expectations.mjs");
async function load() {
  assert.ok(fs.existsSync(modulePath), "원장 선택을 실제 runner로 실행하는 도구가 필요하다");
  return import(pathToFileURL(modulePath).href);
}
const binding = (file) => ({ file, selector: "saves", sourceHash: "hash", assertion: "assert.ok(ok)" });
function makeFixture(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mes-expectation-${label}-`));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  return root;
}
function removeFixture(root) {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith("mes-expectation-"));
  fs.rmSync(root, { recursive: true, force: true });
}
function ledger() {
  return { schemaVersion: 2, cases: [{ id: "CASE", scope: "current-decisions", atomicReview: "reviewed", verificationTags: ["smoke"], decisionIds: [], assertions: [{ id: "c", expected: "saves", requiredEvidence: ["test"], coverage: "linked", bindings: [binding("scripts/dev/save.test.mjs")], execution: { status: "NOT_RUN" } }] }] };
}

test("실행 계획은 파일을 중복 실행하지 않고 runner별 전체 인스턴스를 선택한다", async () => {
  const { buildRunPlan } = await load();
  const model = ledger();
  model.cases[0].assertions.push({ ...model.cases[0].assertions[0], id: "c2" });
  model.cases[0].assertions[0].bindings.push(binding("backend/tests/test_save.py"), binding("frontend/app/save.test.ts"), binding("frontend/tests/e2e/save.spec.ts"));
  const plan = buildRunPlan(model, { tier: "full" });
  assert.deepEqual(plan.caseIds, ["CASE"]);
  assert.deepEqual(plan.groups.map((group) => group.runner).sort(), ["node", "playwright", "pytest", "vitest"]);
  assert.equal(plan.groups.find((group) => group.runner === "node").conditions.length, 2);
  assert.equal(plan.globalPass, false);
});

test("마지막 AS 역할 해제는 다른 브라우저 흐름과 분리된 새 DB에서 실행한다", async () => {
  const { buildRunPlan } = await load();
  const model = ledger();
  const isolated = "frontend/tests/e2e/as-research-expectations.spec.ts";
  model.cases[0].assertions[0].bindings = [binding("frontend/tests/e2e/admin-expectations.spec.ts"), binding(isolated)];
  model.cases[0].assertions.push({ ...model.cases[0].assertions[0], id: "again", bindings: [binding(isolated)] });
  const groups = buildRunPlan(model, { tier: "full" }).groups;
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(group => group.files), [["frontend/tests/e2e/admin-expectations.spec.ts"], [isolated]]);
  assert.equal(groups[1].conditions.length, 2);
  assert.ok(groups.every(group => group.runner === "playwright"));
});

test("AS fallback UI와 마지막 역할 회수 파일은 서로도 별도 새 DB 그룹에서 실행한다", async () => {
  const { buildRunPlan } = await load();
  const model = ledger();
  const original = "frontend/tests/e2e/as-research-expectations.spec.ts";
  const ui = "frontend/tests/e2e/as-research-ui-expectations.spec.ts";
  const normal = "frontend/tests/e2e/admin-expectations.spec.ts";
  model.cases[0].assertions[0].bindings = [binding(normal), binding(original), binding(ui)];
  model.cases[0].assertions.push({ ...model.cases[0].assertions[0], id: "ui-again", bindings: [binding(ui)] });
  const groups = buildRunPlan(model, { tier: "full" }).groups;
  assert.deepEqual(groups.map(group => group.files), [[normal], [original], [ui]]);
  assert.equal(groups[2].conditions.length, 2);
  assert.ok(groups.every(group => group.runner === "playwright"));
});

test("미검토·필수 근거 미지정·브라우저 조건의 unit-only 연결은 실행 전에 거부한다", async () => {
  const { buildRunPlan } = await load();
  for (const change of [
    (model) => model.cases[0].atomicReview = "unreviewed",
    (model) => delete model.cases[0].assertions[0].requiredEvidence,
    (model) => model.cases[0].assertions[0].requiredEvidence = ["browser"],
  ]) {
    const model = ledger(); change(model);
    assert.throws(() => buildRunPlan(model, { tier: "full" }));
  }
});

test("실제 Node runner를 실행해 원본 JUnit·종료코드·현재 입력을 남긴다", async () => {
  const { executeGroup } = await load();
  const root = makeFixture("run");
  try {
    fs.mkdirSync(path.join(root, "scripts/dev"), { recursive: true });
    fs.writeFileSync(path.join(root, "scripts/dev/save.test.mjs"), 'import test from "node:test"; import assert from "node:assert/strict"; test("saves", () => assert.equal(1 + 1, 2));');
    const report = await executeGroup({ runner: "node", file: "scripts/dev/save.test.mjs", conditions: [] }, { root, runId: "fixture", output: "evidence", inputs: ["scripts/dev/save.test.mjs"], paths: ["scripts/dev/save.test.mjs"] });
    assert.equal(report.exitCode, 0);
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.snapshot.files.length, 1);
    assert.match(fs.readFileSync(path.join(root, report.raw.path), "utf8"), /testcase name="saves"/);
    assert.equal(report.environment.kind, "unit");
    assert.ok(report.argv.includes("--test"));
  } finally { removeFixture(root); }
});

test("실제 실패 runner는 보고서를 보존하고 PASS로 승격하지 않는다", async () => {
  const { executeGroup } = await load();
  const root = makeFixture("fail");
  try {
    fs.writeFileSync(path.join(root, "bad.test.mjs"), 'import test from "node:test"; test("fails", () => { throw Error("expected failure"); });');
    const report = await executeGroup({ runner: "node", file: "bad.test.mjs", conditions: [] }, { root, runId: "fixture", output: "evidence", inputs: ["bad.test.mjs"], paths: ["bad.test.mjs"] });
    assert.notEqual(report.exitCode, 0);
    assert.match(fs.readFileSync(path.join(root, report.raw.path), "utf8"), /<failure/);
  } finally { removeFixture(root); }
});

async function promotionFixture(multipleAssertions = false) {
  const { runCli } = await load();
  const { normalizeExpectations, sourceSha256 } = await import("./normalize-mes-expectations.mjs");
  const { digest } = await import("./mes-expectation-evidence.mjs");
  const root = makeFixture("promote");
  const file = "scripts/dev/save.test.mjs";
  const source = 'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("saves", () => { assert.equal(1 + 1, 2); assert.ok(true); });\n';
  const paths = [file, "scripts/dev/normalize-mes-expectations.mjs", "scripts/dev/mes-expectation-evidence.mjs", "scripts/dev/run-mes-expectations.mjs"];
  fs.mkdirSync(path.join(root, "scripts/dev"), { recursive: true });
  for (const entry of paths) fs.writeFileSync(path.join(root, entry), entry === file ? source : "// fixture version\n");
  const registry = { assertions: [{ caseId: "CASE", conditionId: "c", bindings: [{ file, selector: "saves", sourceHash: sourceSha256(source), assertion: "assert.equal(1 + 1, 2);" }] }] };
  if (multipleAssertions) registry.assertions[0].bindings.push({ file, selector: "saves", sourceHash: sourceSha256(source), assertion: "assert.ok(true);" });
  const model = normalizeExpectations({ audit: { cases: [{ id: "CASE", expected: "saves" }] }, feedback: { reviews: {} }, policy: { schemaVersion: 2, cases: [{ id: "CASE", conditions: [{ id: "c", expected: "saves", requiredEvidence: ["test"] }] }] }, registry });
  const directory = "_attic/runtime/mes-expectations/promote-fixture";
  const base = "docs/superpowers/specs/2026-10-07-mes-expectations";
  fs.mkdirSync(path.join(root, `${base}.sources`), { recursive: true });
  const sources = [];
  for (const [name, value] of [["audit", { cases: model.cases.map((row) => row.original) }], ["feedback", { reviews: {} }]]) {
    const relative = `${base}.sources/${name}.json`, bytes = JSON.stringify(value);
    fs.writeFileSync(path.join(root, relative), bytes); sources.push({ path: relative, sha256: digest(bytes) });
  }
  fs.writeFileSync(path.join(root, `${base}.sources/manifest.json`), JSON.stringify(sources));
  fs.writeFileSync(path.join(root, `${base}.decisions.json`), JSON.stringify({ schemaVersion: 2, cases: [{ id: "CASE", verificationTags: ["smoke"], conditions: [{ id: "c", expected: "saves", requiredEvidence: ["test"] }] }] }));
  fs.writeFileSync(path.join(root, `${base}.assertions.json`), JSON.stringify(registry));
  const receipt = await runCli(["--ids", "CASE", "--run-id", "promote-fixture"], root);
  assert.equal(receipt.status, "PASS");
  const execution = fs.readdirSync(path.join(root, directory)).find((entry) => entry.endsWith("-execution.json"));
  const report = JSON.parse(fs.readFileSync(path.join(root, directory, execution)));
  assert.equal(report.verificationError, undefined);
  return { root, paths, model, directory, report, registry };
}

test("검증된 raw와 manifest만 영구 보존하고 조건별 실행을 갱신한다", async () => {
  const { promoteRun } = await load();
  const fixture = await promotionFixture();
  try {
    const result = promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root);
    assert.equal(result.promotedConditions, 1);
    const registry = JSON.parse(fs.readFileSync(path.join(fixture.root, "docs/superpowers/specs/2026-10-07-mes-expectations.assertions.json")));
    assert.equal(registry.assertions[0].execution.status, "PASS");
    const evidence = registry.assertions[0].execution.evidence[0];
    assert.ok(evidence.evidenceFile.startsWith("docs/superpowers/specs/2026-10-07-mes-expectations.sources/verification/"));
    const manifest = JSON.parse(fs.readFileSync(path.join(fixture.root, evidence.evidenceFile)));
    assert.ok(fs.existsSync(path.join(fixture.root, manifest.raw.path)));
    const receipt = JSON.parse(fs.readFileSync(path.join(fixture.root, manifest.runReceipt.path)));
    assert.equal(receipt.status, "PASS");
    assert.deepEqual(receipt.caseIds, ["CASE"]);
    assert.deepEqual(receipt.groups[0].declaration.files, ["scripts/dev/save.test.mjs"]);
    assert.equal(receipt.groups[0].snapshotSha256, manifest.snapshot.sha256);
    assert.ok(fs.existsSync(path.join(fixture.root, manifest.runReceipt.originalExecution.path)));
  } finally { removeFixture(fixture.root); }
});

test("같은 테스트의 서로 다른 assertion은 실행 인스턴스를 중복시키지 않는다", async () => {
  const { promoteRun } = await load();
  const fixture = await promotionFixture(true);
  try {
    assert.equal(fixture.report.conditions[0].targets.length, 1);
    assert.equal(promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root).promotedConditions, 1);
  } finally { removeFixture(fixture.root); }
});

test("실행 후 코드나 raw가 달라지면 원장과 영구 근거를 변경하지 않는다", async () => {
  const { promoteRun } = await load();
  for (const target of ["scripts/dev/save.test.mjs", "raw"]) {
    const fixture = await promotionFixture();
    try {
      fs.appendFileSync(path.join(fixture.root, target === "raw" ? fixture.report.raw.path : target), "\nchanged");
      assert.throws(() => promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root), /stale|hash/);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.root, "docs/superpowers/specs/2026-10-07-mes-expectations.assertions.json"))), fixture.registry);
      assert.equal(fs.existsSync(path.join(fixture.root, "docs/superpowers/specs/2026-10-07-mes-expectations.sources/verification/promote-fixture")), false);
    } finally { removeFixture(fixture.root); }
  }
});

test("실제 실행 완료 영수증이 없는 결과는 승격하지 않는다", async () => {
  const { promoteRun } = await load();
  const fixture = await promotionFixture();
  try {
    fs.rmSync(path.join(fixture.root, fixture.directory, "run.json"), { force: true });
    assert.throws(() => promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root), /receipt/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.root, "docs/superpowers/specs/2026-10-07-mes-expectations.assertions.json"))), fixture.registry);
  } finally { removeFixture(fixture.root); }
});

test("완료 영수증의 실패·대상 변경·누락 그룹과 삭제된 실행 파일을 거부한다", async () => {
  const { promoteRun } = await load();
  const fixture = await promotionFixture();
  try {
    const receiptPath = path.join(fixture.root, fixture.directory, "run.json");
    const original = fs.readFileSync(receiptPath);
    for (const change of [
      (receipt) => receipt.status = "FAIL",
      (receipt) => receipt.groups = [],
      (receipt) => receipt.groups[0].declaration.conditions[0].targets[0].selector = "another test",
      (receipt) => receipt.groups[0].artifacts = [],
    ]) {
      const receipt = JSON.parse(original); change(receipt); fs.writeFileSync(receiptPath, JSON.stringify(receipt));
      assert.throws(() => promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root), /receipt/);
    }
    fs.writeFileSync(receiptPath, original);
    const receipt = JSON.parse(original);
    fs.rmSync(path.join(fixture.root, receipt.groups[0].execution.path));
    assert.throws(() => promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root), /receipt.*files/);
  } finally { removeFixture(fixture.root); }
});

test("승격 후 runtime 없이 원본 영수증을 재검증하고 영수증 삭제를 거부한다", async () => {
  const { promoteRun } = await load();
  const { verifyExecution, requiredInputs } = await import("./mes-expectation-evidence.mjs");
  const fixture = await promotionFixture();
  try {
    const saved = promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root);
    const file = fs.readdirSync(path.join(fixture.root, saved.evidenceDirectory)).find((entry) => entry.endsWith("-execution.json") && !entry.startsWith("original-"));
    const report = JSON.parse(fs.readFileSync(path.join(fixture.root, saved.evidenceDirectory, file)));
    const row = fixture.model.cases[0], condition = row.assertions[0];
    const read = (entry) => {
      assert.ok(!entry.startsWith("_attic/runtime/"), "승격 이후 runtime 경로에 의존하지 않는다");
      return fs.readFileSync(path.join(fixture.root, entry));
    };
    const verify = () => verifyExecution(report, row, condition, { read, paths: fixture.paths, requiredInputs: requiredInputs(condition.bindings, fixture.paths) });
    assert.deepEqual(verify(), []);
    report.exitCode = 1;
    assert.ok(verify().length > 0);
    report.exitCode = 0;
    fs.rmSync(path.join(fixture.root, report.runReceipt.path));
    assert.ok(verify().length > 0);
  } finally { removeFixture(fixture.root); }
});

test("raw와 execution 해시를 함께 갱신해도 완료 영수증과 다르면 승격하지 않는다", async () => {
  const { promoteRun } = await load();
  const { digest } = await import("./mes-expectation-evidence.mjs");
  const fixture = await promotionFixture();
  try {
    const raw = path.join(fixture.root, fixture.report.raw.path);
    fs.appendFileSync(raw, "\n");
    fixture.report.raw.sha256 = digest(fs.readFileSync(raw));
    const execution = fs.readdirSync(path.join(fixture.root, fixture.directory)).find((file) => file.endsWith("-execution.json"));
    fs.writeFileSync(path.join(fixture.root, fixture.directory, execution), JSON.stringify(fixture.report));
    assert.throws(() => promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root), /receipt/);
  } finally { removeFixture(fixture.root); }
});

test("브라우저 근거는 전용 DB의 실제 revision·논리 snapshot과 boot ID를 묶는다", async () => {
  const { recordBrowserEnvironment } = await load();
  assert.equal(typeof recordBrowserEnvironment, "function");
  const root = makeFixture("browser");
  try {
    fs.mkdirSync(path.join(root, "backend"));
    const database = path.join(root, "backend/mes_e2e.db");
    execFileSync("python", ["-c", "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('CREATE TABLE alembic_version(version_num TEXT)'); c.execute('INSERT INTO alembic_version VALUES (?)', ('test_revision',)); c.commit(); c.close()", database]);
    const seed = path.join(root, "seed.json"); fs.writeFileSync(seed, '{"itemId":1}');
    const options = { root, database, seedFile: seed, bootId: "test-boot", output: path.join(root, "environment.json") };
    const record = recordBrowserEnvironment(options);
    assert.equal(record.database.revision, "test_revision");
    assert.equal(record.database.bootId, "test-boot");
    assert.match(record.database.logicalSnapshotHash, /^[a-f0-9]{64}$/);
    assert.match(record.database.fixtureHash, /^[a-f0-9]{64}$/);
    assert.throws(() => recordBrowserEnvironment({ ...options, database: path.join(root, "backend/mes.db") }), /dedicated/);
    assert.throws(() => recordBrowserEnvironment({ ...options, bootId: "" }), /boot/);
  } finally { removeFixture(root); }
});

test("pytest 환경·설정의 -k가 실패 파라미터를 가려도 전체 PASS가 되지 않는다", async () => {
  const { executeGroup } = await load();
  const previous = process.env.PYTEST_ADDOPTS;
  for (const fromConfig of [false, true]) {
    const root = makeFixture("pytest");
    try {
      fs.mkdirSync(path.join(root, "backend/tests"), { recursive: true });
      fs.mkdirSync(path.join(root, "scripts/dev"), { recursive: true });
      const plugin = "scripts/dev/mes_expectation_pytest.py";
      fs.copyFileSync(new URL("./mes_expectation_pytest.py", import.meta.url), path.join(root, plugin));
      const file = "backend/tests/test_parameters.py";
      fs.writeFileSync(path.join(root, file), 'import pytest\n@pytest.mark.parametrize("value", ["one", "two"])\ndef test_all(value):\n    assert value == "one"\n');
      if (fromConfig) { delete process.env.PYTEST_ADDOPTS; fs.writeFileSync(path.join(root, "backend/pytest.ini"), "[pytest]\naddopts = -k one\n"); }
      else process.env.PYTEST_ADDOPTS = "-k one";
      const binding = { file, selector: "test_all", sourceHash: "fixture", assertion: "assert value ==" };
      const row = { id: "FIXTURE", decisionIds: [] }, condition = { id: "all", expected: "all parameters", requiredEvidence: ["test"], bindings: [binding] };
      const report = await executeGroup({ runner: "pytest", files: [file], conditions: [{ row, condition, bindings: [binding] }] }, { root, runId: "parameters", output: "evidence", inputs: [file, plugin], paths: [file, plugin] });
      assert.ok(report.exitCode !== 0 || report.verificationError, "failure parameter must not disappear from proof");
    } finally { removeFixture(root); }
  }
  if (previous === undefined) delete process.env.PYTEST_ADDOPTS; else process.env.PYTEST_ADDOPTS = previous;
});

test("이미 PASS인 원장도 실행 계획과 재실행을 다시 만들 수 있다", async () => {
  const { promoteRun, runCli } = await load();
  const { digest } = await import("./mes-expectation-evidence.mjs");
  const fixture = await promotionFixture();
  try {
    promoteRun(fixture.model, fixture.paths, fixture.directory, fixture.root);
    const base = "docs/superpowers/specs/2026-10-07-mes-expectations";
    const audit = { cases: fixture.model.cases.map((row) => row.original) };
    const feedback = { reviews: {} };
    const sources = [];
    for (const [name, value] of [["audit", audit], ["feedback", feedback]]) {
      const relative = `${base}.sources/${name}.json`, bytes = JSON.stringify(value);
      fs.mkdirSync(path.dirname(path.join(fixture.root, relative)), { recursive: true });
      fs.writeFileSync(path.join(fixture.root, relative), bytes); sources.push({ path: relative, sha256: digest(bytes) });
    }
    fs.writeFileSync(path.join(fixture.root, `${base}.sources/manifest.json`), JSON.stringify(sources));
    fs.writeFileSync(path.join(fixture.root, `${base}.decisions.json`), JSON.stringify({ schemaVersion: 2, cases: [{ id: "CASE", verificationTags: ["smoke"], conditions: [{ id: "c", expected: "saves", requiredEvidence: ["test"] }] }] }));
    execFileSync("git", ["init", "--quiet"], { cwd: fixture.root });
    const result = await runCli(["--plan"], fixture.root);
    assert.deepEqual(result.caseIds, ["CASE"]);
  } finally { removeFixture(fixture.root); }
});

test("실행 도중 추가된 제품 파일은 같은 실행의 PASS를 무효화한다", async () => {
  const { executeGroup } = await load();
  const root = makeFixture("membership");
  try {
    fs.mkdirSync(path.join(root, "scripts/dev"), { recursive: true });
    const file = "scripts/dev/add.test.mjs";
    fs.writeFileSync(path.join(root, file), 'import test from "node:test"; import fs from "node:fs"; test("adds", () => fs.writeFileSync("scripts/dev/new.mjs", "changed"));');
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    const report = await executeGroup({ runner: "node", file, conditions: [] }, { root, runId: "membership", output: "evidence", inputs: ["scripts/"], paths: [file] });
    assert.equal(report.exitCode, 0);
    assert.match(report.verificationError ?? "", /inputs changed/);
  } finally { removeFixture(root); }
});

test("합성 브라우저 raw·수집·화면만으로 실제 실행 영수증 없이 승격하지 않는다", async () => {
  const { promoteRun } = await load();
  const { normalizeExpectations, sourceSha256 } = await import("./normalize-mes-expectations.mjs");
  const { captureSnapshot, conditionFingerprint, digest, requiredInputs } = await import("./mes-expectation-evidence.mjs");
  const root = makeFixture("browser-promote");
  try {
    const file = "frontend/tests/e2e/save.spec.ts", directory = "_attic/runtime/mes-expectations/browser-fixture";
    const source = 'test("saves", async () => { expect(saved).toBeVisible(); });\n';
    const paths = [file, "backend/app/main.py", "scripts/dev/normalize-mes-expectations.mjs", "scripts/dev/mes-expectation-evidence.mjs", "scripts/dev/run-mes-expectations.mjs"];
    for (const entry of paths) { fs.mkdirSync(path.dirname(path.join(root, entry)), { recursive: true }); fs.writeFileSync(path.join(root, entry), entry === file ? source : "// fixture\n"); }
    const registry = { assertions: [{ caseId: "CASE", conditionId: "c", bindings: [{ file, selector: "saves", line: 1, sourceHash: sourceSha256(source), assertion: "expect(saved).toBeVisible();" }] }] };
    const model = normalizeExpectations({ audit: { cases: [{ id: "CASE", expected: "saves" }] }, feedback: { reviews: {} }, policy: { schemaVersion: 2, cases: [{ id: "CASE", conditions: [{ id: "c", expected: "saves", requiredEvidence: ["test", "browser"] }] }] }, registry });
    const row = model.cases[0], condition = row.assertions[0], instance = "chromium::flow > saves";
    const raw = Buffer.from(JSON.stringify({ errors: [], suites: [{ title: "flow", specs: [{ title: "saves", file: "save.spec.ts", line: 1, tests: [{ projectName: "chromium", expectedStatus: "passed", status: "expected", results: [{ status: "passed", retry: 0, attachments: [{ contentType: "image/png", path: "frontend/test-results/shot.png" }] }] }] }] }] }));
    const screenshot = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHZkAAAAASUVORK5CYII=", "base64");
    const read = (entry) => fs.readFileSync(path.join(root, entry));
    const report = { schemaVersion: 2, runId: "browser-fixture", runner: "playwright", root, testRoot: "frontend/tests/e2e", startedAt: "2026-10-07T12:00:00+09:00", endedAt: "2026-10-07T12:01:00+09:00", argv: ["node", "playwright", "test"], cwd: "frontend", exitCode: 0, snapshot: captureSnapshot(requiredInputs(condition.bindings, paths), paths, read), raw: { path: `${directory}/raw.json`, sha256: digest(raw) }, screenshots: [{ instance, source: "frontend/test-results/shot.png", path: `${directory}/shot.png`, sha256: digest(screenshot) }], environment: { kind: "browser", versions: { node: "20" }, baseUrl: "http://127.0.0.1:3100", database: { revision: "0040", fixtureHash: "fixture", bootId: "boot" } }, conditions: [{ caseId: row.id, conditionId: condition.id, fingerprint: conditionFingerprint(row, condition), targets: [{ file, selector: "saves", instances: [instance] }] }] };
    fs.mkdirSync(path.join(root, directory), { recursive: true });
    fs.writeFileSync(path.join(root, report.raw.path), raw);
    const collection = JSON.parse(raw);
    collection.suites[0].specs[0].tests[0].results = [];
    collection.suites[0].specs[0].tests[0].status = "skipped";
    const collectionBytes = Buffer.from(JSON.stringify(collection));
    report.collection = { path: `${directory}/collection.json`, sha256: digest(collectionBytes), exitCode: 0, argv: ["playwright", "test", "--list"] };
    fs.writeFileSync(path.join(root, report.collection.path), collectionBytes);
    fs.writeFileSync(path.join(root, report.screenshots[0].path), screenshot);
    fs.writeFileSync(path.join(root, directory, "browser-execution.json"), JSON.stringify(report));
    const base = "docs/superpowers/specs/2026-10-07-mes-expectations";
    fs.mkdirSync(path.dirname(path.join(root, base)), { recursive: true });
    fs.writeFileSync(path.join(root, `${base}.assertions.json`), JSON.stringify(registry));
    assert.throws(() => promoteRun(model, paths, directory, root), /receipt/);
    assert.deepEqual(JSON.parse(read(`${base}.assertions.json`)), registry);
  } finally { removeFixture(root); }
});
