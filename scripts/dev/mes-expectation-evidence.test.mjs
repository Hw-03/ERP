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

test("Vitest 원본 JSON의 모든 파라미터 인스턴스를 선언 위치에 연결한다", async () => {
  const { parseReport, matchInstances } = await load();
  const result = parseReport("vitest", vitest([item("case A"), item("case B")]), { root: "/repo" });
  const matches = matchInstances(result, { file: "frontend/item.test.ts", selector: "case %s", line: 10 }, ["suite case A", "suite case B"]);
  assert.deepEqual(matches.map((r) => r.name), ["suite case A", "suite case B"]);
});

test("0매칭·파라미터 일부·중복·SKIP·다른 선언 위치는 PASS가 아니다", async () => {
  const { parseReport, matchInstances } = await load();
  const binding = { file: "frontend/item.test.ts", selector: "case %s", line: 10 };
  for (const rows of [[], [item("case A")], [item("case A"), item("case A")], [item("case A"), item("case B", "pending")], [item("case A"), { ...item("case B"), location: { line: 20 } }]]) {
    assert.throws(() => matchInstances(parseReport("vitest", vitest(rows), { root: "/repo" }), binding, ["suite case A", "suite case B"]));
  }
});

test("실제 runner 실패·재시도·expected failure는 성공 목록으로 덮어쓸 수 없다", async () => {
  const { parseReport, matchInstances } = await load();
  const binding = { file: "frontend/item.test.ts", selector: "case A", line: 10 };
  for (const metadata of [{ retryCount: 1 }, { expectedFailure: true }, { repeatCount: 1 }]) {
    const raw = vitest([{ ...item("case A"), mes: metadata }]);
    assert.throws(() => matchInstances(parseReport("vitest", raw, { root: "/repo" }), binding, ["suite case A"]));
  }
  assert.throws(() => parseReport("vitest", vitest([item("case A")]).replace('"success":true', '"success":false'), { root: "/repo" }));
});

test("Playwright 프로젝트·선언 위치·재시도 없는 실제 성공을 검증한다", async () => {
  const { parseReport, matchInstances } = await load();
  const raw = { errors: [], suites: [{ title: "flow", file: "flow.spec.ts", specs: [{ title: "saves", file: "flow.spec.ts", line: 8, tests: [{ projectName: "chromium", expectedStatus: "passed", status: "expected", results: [{ status: "passed", retry: 0 }] }] }] }] };
  const parse = () => parseReport("playwright", JSON.stringify(raw), { root: "/repo", testRoot: "frontend/tests/e2e" });
  const binding = { file: "frontend/tests/e2e/flow.spec.ts", selector: "saves", line: 8 };
  assert.equal(matchInstances(parse(), binding, ["chromium::flow > saves"]).length, 1);
  raw.suites[0].specs[0].tests[0].results.unshift({ status: "failed", retry: 0 });
  assert.throws(() => matchInstances(parse(), binding, ["chromium::flow > saves"]));
});

test("JUnit은 XML parser로 읽으며 실패·skip과 HTML entity를 보존한다", async () => {
  const { parseReport, matchInstances } = await load();
  const xml = '<testsuites><testsuite name="pytest"><testcase classname="tests.test_flow" name="test_save[A&amp;B]"/><testcase classname="tests.test_flow" name="test_save[C]"><skipped type="pytest.skip"/></testcase></testsuite></testsuites>';
  const result = parseReport("pytest", xml, { root: "/repo" });
  assert.equal(result[0].name, "test_save[A&B]");
  assert.throws(() => matchInstances(result, { file: "backend/tests/test_flow.py", selector: "test_save" }, ["test_save[A&B]", "test_save[C]"]));
});

test("입력 snapshot은 CRLF 차이를 무시하고 파일 추가·삭제·본문 변경을 탐지한다", async () => {
  const { captureSnapshot } = await load();
  const files = { "backend/app/a.py": "x = 1\r\n", "docs/note.md": "note" };
  const capture = () => captureSnapshot(["backend/app/"], Object.keys(files), (name) => Buffer.from(files[name]));
  const first = capture();
  files["backend/app/a.py"] = "x = 1\n";
  files["docs/note.md"] = "changed";
  assert.deepEqual(capture(), first);
  files["backend/app/b.py"] = "new";
  assert.notEqual(capture().sha256, first.sha256);
  delete files["backend/app/b.py"];
  files["backend/app/a.py"] = "x = 2\n";
  assert.notEqual(capture().sha256, first.sha256);
  delete files["backend/app/a.py"];
  assert.throws(capture, /empty/);
});

test("조건 지문은 원문과 연결 변경을 탐지하고 실행 기록 갱신에는 영향받지 않는다", async () => {
  const { conditionFingerprint } = await load();
  const row = { id: "ID", decisionIds: ["G01"] };
  const condition = { id: "c", expected: "allowed", requiredEvidence: ["test"], bindings: [{ file: "backend/tests/test_a.py", selector: "test_a", assertion: "assert ok", sourceHash: "abc" }], execution: { status: "NOT_RUN" } };
  const first = conditionFingerprint(row, condition);
  condition.execution.status = "PASS";
  assert.equal(conditionFingerprint(row, condition), first);
  condition.expected = "forbidden";
  assert.notEqual(conditionFingerprint(row, condition), first);
});

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

test("schema 2는 raw runner·조건 지문·제품 snapshot을 함께 검증한다", async () => {
  const { captureSnapshot, conditionFingerprint, verifyExecution } = await load();
  const fixture = evidenceFixture(captureSnapshot, conditionFingerprint);
  assert.deepEqual(verifyExecution(fixture.report, fixture.row, fixture.condition, { read: fixture.read, paths: Object.keys(fixture.files), requiredInputs: fixture.inputs }), []);
});

test("제품 변경·raw 변조·exit 실패·다른 조건·입력 축소·옛 요약 PASS를 거부한다", async () => {
  const { captureSnapshot, conditionFingerprint, verifyExecution } = await load();
  for (const mutate of [
    (f) => f.files["frontend/app/item.ts"] = "changed",
    (f) => f.files["raw.json"] += " ",
    (f) => f.report.exitCode = 1,
    (f) => f.report.conditions[0].fingerprint = "old",
    (f) => f.report.snapshot = captureSnapshot(["frontend/item.test.ts"], Object.keys(f.files), f.read),
    (f) => f.report.schemaVersion = 1,
    (f) => f.report.conditions[0].targets[0].instances = [],
  ]) {
    const fixture = evidenceFixture(captureSnapshot, conditionFingerprint); mutate(fixture);
    assert.ok(verifyExecution(fixture.report, fixture.row, fixture.condition, { read: fixture.read, paths: Object.keys(fixture.files), requiredInputs: fixture.inputs }).length > 0);
  }
});

test("browser 필수 조건은 unit 결과로 닫지 않으며 DB·fixture 식별을 요구한다", async () => {
  const { captureSnapshot, conditionFingerprint, verifyExecution } = await load();
  const f = evidenceFixture(captureSnapshot, conditionFingerprint);
  f.condition.requiredEvidence = ["browser"];
  f.report.conditions[0].fingerprint = conditionFingerprint(f.row, f.condition);
  assert.ok(verifyExecution(f.report, f.row, f.condition, { read: f.read, paths: Object.keys(f.files), requiredInputs: f.inputs, evidenceKind: "browser" }).length > 0);
  f.report.environment = { kind: "browser", versions: { node: "20" } };
  assert.ok(verifyExecution(f.report, f.row, f.condition, { read: f.read, paths: Object.keys(f.files), requiredInputs: f.inputs, evidenceKind: "browser" }).length > 0);
});

test("전체 수집 목록에 있는 파라미터를 raw와 요약에서 함께 빼도 탐지한다", async () => {
  const { captureSnapshot, conditionFingerprint, verifyExecution } = await load();
  const f = evidenceFixture(captureSnapshot, conditionFingerprint);
  const collection = JSON.parse(f.files["collection.json"]);
  collection.collected.push({ ...collection.collected[0], name: "suite case B" });
  f.files["collection.json"] = JSON.stringify(collection);
  f.report.collection.sha256 = hash(f.files["collection.json"]);
  assert.ok(verifyExecution(f.report, f.row, f.condition, { read: f.read, paths: Object.keys(f.files), requiredInputs: f.inputs }).some((error) => error.includes("collection")));
});

test("Vitest 공식 JSON이 숨기는 retry/fails 상태는 runner 관찰 자료에서 확인한다", async () => {
  const { captureSnapshot, conditionFingerprint, verifyExecution } = await load();
  for (const change of [{ retry: 1 }, { expectedFailure: true }, { mode: "skip" }, { status: "FAIL" }]) {
    const f = evidenceFixture(captureSnapshot, conditionFingerprint);
    const collection = JSON.parse(f.files["collection.json"]);
    Object.assign(collection.completed[0], change);
    f.files["collection.json"] = JSON.stringify(collection);
    f.report.collection.sha256 = hash(f.files["collection.json"]);
    assert.ok(verifyExecution(f.report, f.row, f.condition, { read: f.read, paths: Object.keys(f.files), requiredInputs: f.inputs }).length > 0);
  }
});

test("공유 테스트 helper·bootstrap·실제 프론트 설정도 관련 입력에 포함한다", async () => {
  const { requiredInputs } = await load();
  const paths = ["backend/app/main.py", "backend/tests/test_shared.py", "backend/tests/test_bound.py", "backend/bootstrap_db.py", "backend/bootstrap/schema.py", "frontend/next.config.js", "frontend/tailwind.config.ts"];
  const covered = (inputs, file) => inputs.some((input) => input.endsWith("/") ? file.startsWith(input) : file === input);
  const backend = requiredInputs([{ file: "backend/tests/test_bound.py" }], paths);
  assert.ok(covered(backend, "backend/tests/test_shared.py"));
  const browser = requiredInputs([{ file: "frontend/tests/e2e/flow.spec.ts" }], paths);
  for (const file of ["backend/bootstrap_db.py", "backend/bootstrap/schema.py", "frontend/next.config.js", "frontend/tailwind.config.ts"]) assert.ok(covered(browser, file), file);
});

test("브라우저 성공 화면은 원본 첨부와 연결된 바이트 근거가 있어야 한다", async () => {
  const { captureSnapshot, conditionFingerprint, verifyExecution } = await load();
  const f = evidenceFixture(captureSnapshot, conditionFingerprint);
  const file = "frontend/tests/e2e/flow.spec.ts", instance = "chromium::flow > saves";
  const binding = { file, selector: "saves", line: 8, sourceHash: "fixture", assertion: "expect(saved).toBeVisible()" };
  f.condition.bindings = [binding]; f.condition.requiredEvidence = ["browser"];
  f.files[file] = "fixture";
  f.inputs = [file, "frontend/app/"];
  f.report.snapshot = captureSnapshot(f.inputs, Object.keys(f.files), f.read);
  f.files["raw.json"] = JSON.stringify({ errors: [], suites: [{ title: "flow", specs: [{ title: "saves", file: "flow.spec.ts", line: 8, tests: [{ projectName: "chromium", expectedStatus: "passed", status: "expected", results: [{ status: "passed", retry: 0, attachments: [{ contentType: "image/png", path: "/repo/frontend/test-results/shot.png" }] }] }] }] }] });
  f.files["saved.png"] = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64");
  Object.assign(f.report, { runner: "playwright", testRoot: "frontend/tests/e2e", raw: { path: "raw.json", sha256: hash(f.files["raw.json"]) }, screenshots: [{ instance, source: "frontend/test-results/shot.png", path: "saved.png", sha256: hash(f.files["saved.png"]) }], environment: { kind: "browser", versions: { node: "20" }, baseUrl: "http://127.0.0.1:3100", database: { revision: "0040", fixtureHash: "fixture", logicalSnapshotHash: "snapshot", bootId: "boot" } } });
  f.files["environment.json"] = JSON.stringify(f.report.environment);
  f.report.environmentFile = { path: "environment.json", sha256: hash(f.files["environment.json"]) };
  f.report.conditions = [{ caseId: f.row.id, conditionId: f.condition.id, fingerprint: conditionFingerprint(f.row, f.condition), targets: [{ file, selector: "saves", instances: [instance] }] }];
  const collection = JSON.parse(f.files["raw.json"]);
  collection.suites[0].specs[0].tests[0].results = [];
  collection.suites[0].specs[0].tests[0].status = "skipped";
  f.files["collection.json"] = JSON.stringify(collection);
  f.report.collection = { path: "collection.json", sha256: hash(f.files["collection.json"]), exitCode: 0, argv: ["playwright", "test", "--list"] };
  const verify = () => verifyExecution(f.report, f.row, f.condition, { read: f.read, paths: Object.keys(f.files), requiredInputs: f.inputs, evidenceKind: "browser" });
  assert.deepEqual(verify(), []);
  const screenshots = f.report.screenshots;
  f.report.screenshots = [];
  assert.ok(verify().some((error) => /screenshot/.test(error)), "성공 JSON만으로는 화면 근거가 아니다");
  f.report.screenshots = screenshots;
  const originalScreenshot = f.files["saved.png"];
  f.files["saved.png"] = Buffer.from("changed");
  assert.ok(verify().some((error) => /screenshot/.test(error)));
  f.files["saved.png"] = originalScreenshot;
  for (const invalid of [originalScreenshot.subarray(0, 8), originalScreenshot.subarray(0, -12), Buffer.concat([originalScreenshot, Buffer.from("trailing")])]) {
    f.files["saved.png"] = invalid;
    f.report.screenshots[0].sha256 = hash(invalid);
    assert.ok(verify().some((error) => /screenshot/.test(error)), "해시가 맞아도 잘리거나 손상된 PNG는 화면 증거가 아니다");
  }
  f.files["saved.png"] = originalScreenshot;
  f.report.screenshots[0].sha256 = hash(originalScreenshot);
  const environment = f.files["environment.json"];
  delete f.files["environment.json"];
  assert.ok(verify().length > 0, "환경 원본이 없으면 metadata만으로 증명할 수 없다");
  f.files["environment.json"] = environment;
  f.report.environment.database.bootId = "another-backend";
  assert.ok(verify().some((error) => /environment/.test(error)));
  f.report.environment.database.bootId = "boot";
  delete f.report.environment.database.logicalSnapshotHash;
  assert.ok(verify().some((error) => /identity/.test(error)));
  f.report.environment.database.logicalSnapshotHash = "snapshot";
  collection.suites[0].specs.push({ ...collection.suites[0].specs[0], title: "saves other parameter" });
  f.files["collection.json"] = JSON.stringify(collection);
  f.report.collection.sha256 = hash(f.files["collection.json"]);
  assert.ok(verify().some((error) => /collection/.test(error)), "미실행 파라미터를 성공 목록에서 숨길 수 없다");
});
