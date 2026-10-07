import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const modulePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "normalize-mes-expectations.mjs");
async function load() {
  assert.ok(fs.existsSync(modulePath), "기대값 정규화·개별 assertion 검증기가 필요하다");
  return import(pathToFileURL(modulePath).href);
}
const source = 'test("restores", () => {\n  expect(view.search).toBe("needle");\n});\n';
test("동일한 테스트의 LF와 CRLF는 같은 소스 근거이며 코드 변경은 거부한다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  input.registry.assertions.push({ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{
    file: "frontend/restore.test.ts", selector: "restores", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(source),
  }] });
  const model = normalizeExpectations(input);
  assert.deepEqual(validateExpectations(model, () => Buffer.from(source.replaceAll("\n", "\r\n"))), []);
  assert.ok(validateExpectations(model, () => source.replace("needle", "changed")).some((error) => error.includes("stale source hash")));
});
function inputs() {
  return {
    audit: { run: { runId: "old" }, cases: [
      { id: "8.1-01", source: "CONTRACT", expected: "old technical", staffExpected: "old staff", actual: "old observation", verdict: "PASS" },
      { id: "PC-DELTA-ITEM-01", source: "DELTA", expected: "old closed", staffExpected: "old restore", verdict: "PASS" },
    ], excludedCases: [{ id: "PC-DELTA-HANDOVER-01", reason: "unused" }] },
    feedback: { reviews: { "8.1-01": { verdict: "deferred", note: "keep me" } } },
    policy: { cases: [{ id: "PC-DELTA-ITEM-01", decisionIds: ["G07"], finalExpected: "restore search and selected item", conditions: [
      { id: "search", expected: "restore search" }, { id: "selection", expected: "restore selection" },
    ] }] },
    registry: { assertions: [] },
    provenance: [{ path: "original.json", sha256: "original-hash" }],
  };
}

test("원장 ID·기대·피드백·과거 관찰을 보존하고 분모를 원장에서 산출한다", async () => {
  const { normalizeExpectations } = await load();
  const model = normalizeExpectations(inputs());
  assert.deepEqual(model.cases.map((c) => c.id), ["8.1-01", "PC-DELTA-ITEM-01"]);
  assert.equal(model.cases[0].original.expected, "old technical");
  assert.equal(model.cases[0].userReview.note, "keep me");
  assert.equal(model.cases[0].original.actual, "old observation");
  assert.equal(model.cases[0].currentVerification, "NOT_RUN");
  assert.equal(model.cases[1].assertions.length, 2);
  assert.equal(model.metrics.CONTRACT.total, 1);
  assert.equal(model.metrics.DELTA.total, 1);
  assert.equal(model.excludedCases[0].status, "deferred");
});

test("범위 밖 원문은 문장별 미검토 조건으로 남기고 전부 실행돼도 PASS를 거부한다", async () => {
  const { normalizeExpectations, validateExpectations } = await load();
  const input = inputs();
  input.audit.cases[0].expected = "첫 조건이다. 둘째와 셋째는 함께 한다.\n다른 조건이다.";
  const model = normalizeExpectations(input);
  assert.equal(model.cases[0].assertions.filter((a) => a.origin === "technical").length, 3);
  assert.equal(model.cases[0].atomicReview, "unreviewed");
  for (const condition of model.cases[0].assertions) condition.execution = { status: "PASS" };
  model.cases[0].currentVerification = "PASS";
  assert.ok(validateExpectations(model, () => source).some((error) => error.includes("unreviewed")));
});

test("알 수 없는 ID·중복 원장·중복 정책·누락 조건을 거부한다", async () => {
  const { normalizeExpectations } = await load();
  for (const mutate of [
    (i) => i.audit.cases.push(i.audit.cases[0]),
    (i) => i.policy.cases.push(i.policy.cases[0]),
    (i) => i.policy.cases[0].id = "unknown",
    (i) => i.feedback.reviews.unknown = {},
    (i) => i.registry.assertions.push({ caseId: "unknown", conditionId: "x" }),
    (i) => i.policy.cases[0].conditions = [],
    (i) => i.policy.cases[0].conditions.push(i.policy.cases[0].conditions[0]),
  ]) {
    const input = inputs(); mutate(input);
    assert.throws(() => normalizeExpectations(input));
  }
});

test("실제 selector의 assertion 조각과 파일 SHA를 연결한다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  input.registry.assertions.push({ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{
    file: "frontend/restore.test.ts", selector: "restores", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(source),
  }] });
  const model = normalizeExpectations(input);
  assert.deepEqual(validateExpectations(model, () => source), []);
  assert.equal(model.cases[1].assertions[0].coverage, "linked");
  assert.equal(model.cases[1].assertions[1].coverage, "missing");
  assert.equal(model.cases[1].currentVerification, "NOT_RUN");
});

test("여러 개별 조건이 같은 selector를 참조해도 assertion은 각각 유지한다", async () => {
  const { normalizeExpectations, sha256 } = await load();
  const input = inputs();
  input.registry.tests = [{ id: "restore", file: "frontend/restore.test.ts", selector: "restores", sourceHash: sha256(source) }];
  input.registry.assertions.push({ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ testId: "restore", assertion: 'expect(view.search).toBe("needle");' }] });
  assert.equal(normalizeExpectations(input).cases[1].assertions[0].bindings[0].selector, "restores");
  input.registry.assertions[0].bindings[0].testId = "unknown";
  assert.throws(() => normalizeExpectations(input), /unknown test/);
});

test("누락 selector·주석뿐인 ID/assertion·다른 테스트의 assertion·변경된 SHA를 탐지한다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  for (const [body, selector, fragment, hash] of [
    [source, "missing", 'expect(view.search).toBe("needle");', sha256(source)],
    ['// test("restores", () => { expect(view.search).toBe("needle"); });', "restores", 'expect(view.search).toBe("needle");', null],
    ['test("restores", () => {\n // expect(view.search).toBe("needle");\n});', "restores", 'expect(view.search).toBe("needle");', null],
    ['test("restores", () => {});\ntest("other", () => { expect(view.search).toBe("needle"); });', "restores", 'expect(view.search).toBe("needle");', null],
    [source, "restores", 'expect(view.search).toBe("needle");', "stale"],
    [source, "restores", "PC-DELTA-ITEM-01", sha256(source)],
    ['test("restores", () => { const fixture = \'expect(view.search).toBe("needle");\'; });', "restores", 'expect(view.search).toBe("needle");', null],
  ]) {
    const input = inputs();
    input.registry.assertions.push({ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "frontend/restore.test.ts", selector, assertion: fragment, sourceHash: hash ?? sha256(body) }] });
    assert.ok(validateExpectations(normalizeExpectations(input), () => body).length > 0);
  }
});

test("Python 예외 assertion은 실제 pytest.raises 본문으로 검증한다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  const body = 'def test_stale():\n    with pytest.raises(ValueError, match="changed"):\n        save()\n';
  input.registry.assertions = [{ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "backend/tests/test_stale.py", selector: "test_stale", assertion: 'with pytest.raises(ValueError, match="changed"):', sourceHash: sha256(body) }] }];
  assert.deepEqual(validateExpectations(normalizeExpectations(input), () => body), []);
});

test("전체 테스트 선언이 여러 줄 fixture 문자열 안에 있으면 실행 근거로 인정하지 않는다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  const body = `const example = \`\ntest("restores", () => {\n  expect(view.search).toBe("needle");\n});\n\`;`;
  input.registry.assertions = [{ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "frontend/restore.test.ts", selector: "restores", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(body) }] }];
  assert.ok(validateExpectations(normalizeExpectations(input), () => body).some((error) => error.includes("actual test body")));
});

test("종료된 테스트 다음의 미실행 helper assertion은 해당 selector의 근거가 아니다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  for (const body of [
    'test("empty", () => {});\nfunction unusedHelper() { expect(view.search).toBe("needle"); }',
    'test("empty", () => { const braces = "})"; /* }) */ });\nconst unusedHelper = () => { expect(view.search).toBe("needle"); };',
  ]) {
    const input = inputs();
    input.registry.assertions = [{ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "frontend/restore.test.ts", selector: "empty", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(body) }] }];
    assert.ok(validateExpectations(normalizeExpectations(input), () => body).some((error) => error.includes("actual test body")));
  }
});

test("Python 테스트의 dedent 뒤 모듈 assertion은 해당 함수의 근거가 아니다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  const body = 'def test_empty():\n    pass\n\nassert fixture == 1\n';
  input.registry.assertions = [{ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "backend/tests/test_empty.py", selector: "test_empty", assertion: 'assert fixture == 1', sourceHash: sha256(body) }] }];
  assert.ok(validateExpectations(normalizeExpectations(input), () => body).some((error) => error.includes("actual test body")));
});

test("Python decorator와 여러 줄 함수 서명은 유지하되 함수 밖 assertion은 제외한다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  const body = '@pytest.mark.parametrize("value", [1])\ndef test_multiline(\n    fixture, value: int,\n) -> None:\n    assert fixture == value\n\nassert fixture == 1\n';
  input.registry.assertions = [{ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "backend/tests/test_empty.py", selector: "test_multiline", assertion: 'assert fixture == value', sourceHash: sha256(body) }] }];
  assert.deepEqual(validateExpectations(normalizeExpectations(input), () => body), []);
  input.registry.assertions[0].bindings[0].assertion = 'assert fixture == 1';
  assert.ok(validateExpectations(normalizeExpectations(input), () => body).some((error) => error.includes("actual test body")));
});

test("smoke·P0·ID 필터가 실제 selector만 선택하고 알 수 없는 ID·미연결 조건은 거부한다", async () => {
  const { normalizeExpectations, selectAssertions, sha256 } = await load();
  const input = inputs();
  input.policy.cases[0].verificationTags = ["smoke", "P0"];
  input.registry.assertions = ["search", "selection"].map((conditionId) => ({ caseId: "PC-DELTA-ITEM-01", conditionId, bindings: [{ file: "frontend/restore.test.ts", selector: "restores", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(source) }] }));
  const model = normalizeExpectations(input);
  for (const filter of [{ tier: "smoke" }, { tier: "P0" }, { ids: ["PC-DELTA-ITEM-01"] }]) {
    const selection = selectAssertions(model, filter);
    assert.deepEqual(selection.caseIds, ["PC-DELTA-ITEM-01"]);
    assert.deepEqual(selection.selectors.map(({ file, selector }) => ({ file, selector })), [{ file: "frontend/restore.test.ts", selector: "restores" }]);
    assert.equal(selection.globalPass, false);
  }
  assert.throws(() => selectAssertions(model, { ids: ["unknown"] }), /unknown ID/);
  assert.throws(() => selectAssertions(model, { tier: "invalid" }), /unknown tier/);
  assert.throws(() => selectAssertions(model, { ids: ["8.1-01"] }), /missing selector/);
  model.cases[1].assertions[0].bindings[0].selector = "";
  assert.throws(() => selectAssertions(model, { tier: "P0" }), /missing selector/);
});

test("개별 조건 일부만 실행한 경우 케이스 전체 PASS를 만들지 않는다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  const report = JSON.stringify({ command: "node --test restore.test.ts", executedAt: "2026-10-07T00:00:00Z", results: [{ file: "frontend/restore.test.ts", selector: "restores", sourceHash: sha256(source), status: "PASS" }] });
  const read = (file) => file.endsWith("run.json") ? report : source;
  input.registry.assertions.push({ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [{ file: "frontend/restore.test.ts", selector: "restores", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(source) }], execution: { status: "PASS", evidence: [{ evidenceFile: "_attic/runtime/run.json", evidenceHash: sha256(report) }] } });
  const model = normalizeExpectations(input);
  assert.equal(model.cases[1].currentVerification, "PARTIAL");
  assert.deepEqual(validateExpectations(model, read), []);
  model.cases[1].currentVerification = "PASS";
  assert.ok(validateExpectations(model, read).some((error) => error.includes("partial")));
});

test("개별 조건 누락·중복·registry 중복·근거 없는 실행 PASS를 탐지한다", async () => {
  const { normalizeExpectations, validateExpectations } = await load();
  const input = inputs();
  input.registry.assertions = [{ caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [] }, { caseId: "PC-DELTA-ITEM-01", conditionId: "search", bindings: [] }];
  assert.throws(() => normalizeExpectations(input));
  for (const mutate of [
    (m) => m.cases[1].assertions.pop(),
    (m) => m.cases[1].assertions.push(m.cases[1].assertions[0]),
    (m) => m.cases[1].assertions[0].execution = { status: "PASS" },
  ]) {
    const model = normalizeExpectations(inputs()); mutate(model);
    assert.ok(validateExpectations(model, () => source).length > 0);
  }
});

test("현재 PASS는 각 selector의 실행 결과 artifact와 SHA까지 일치해야 한다", async () => {
  const { normalizeExpectations, validateExpectations, sha256 } = await load();
  const input = inputs();
  const report = JSON.stringify({ command: "node --test restore.test.ts", executedAt: "2026-10-07T00:00:00Z", results: [{ file: "frontend/restore.test.ts", selector: "restores", sourceHash: sha256(source), status: "PASS" }] });
  const evidence = { evidenceFile: "_attic/runtime/run.json", evidenceHash: sha256(report) };
  input.registry.assertions = ["search", "selection"].map((conditionId) => ({ caseId: "PC-DELTA-ITEM-01", conditionId, bindings: [{ file: "frontend/restore.test.ts", selector: "restores", assertion: 'expect(view.search).toBe("needle");', sourceHash: sha256(source) }], execution: { status: "PASS", evidence: [evidence] } }));
  const model = normalizeExpectations(input);
  const read = (file) => file.endsWith("run.json") ? report : source;
  assert.deepEqual(validateExpectations(model, read), []);
  for (const invalid of [report.replace('"PASS"', '"FAIL"'), report.replace('"restores"', '"other"'), report.replace(sha256(source), "stale")]) {
    const candidate = structuredClone(model);
    for (const assertion of candidate.cases[1].assertions) assertion.execution.evidence[0].evidenceHash = sha256(invalid);
    assert.ok(validateExpectations(candidate, (file) => file.endsWith("run.json") ? invalid : source).some((error) => error.includes("execution")));
  }
  assert.ok(validateExpectations(model, (file) => file.endsWith("run.json") ? report + " " : source).some((error) => error.includes("evidence hash")));
});
