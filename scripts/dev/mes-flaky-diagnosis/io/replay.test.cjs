"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("./replay-core.cjs");

test("anchor request failure is preserved before condition qualification rejects its incomplete timeline", () => {
  const { settleAnchor } = require("./replay-as.cjs");
  assert.equal(typeof settleAnchor, "function");
  for (const outcome of [{ id: "anchor", client: "browser", status: "REQUEST_FAILED", error: { type: "TypeError" } },
    { id: "anchor", client: "browser", status: "RESPONSE", http_status: 503 },
    { id: "anchor", client: "browser", status: "CONDITION_NOT_MET", reason: "browser_cdp_call_failed" },
    { id: "anchor", client: "browser", status: "RESPONSE", http_status: 200 }]) {
    const actions = [];
    settleAnchor(outcome, { record: (event, value) => actions.push({ event, value }), freezeFailure: value => actions.push({ event: "freeze", value }),
      stop: (reason, id) => actions.push({ event: "stop", reason, id }) });
    assert.equal(actions[0].event, "request.outcome");
    const failure = outcome.status === "REQUEST_FAILED" || outcome.http_status >= 400;
    assert.equal(actions.some(row => row.event === "freeze"), failure);
    if (failure) assert.equal(actions.find(row => row.event === "freeze").value, outcome);
    if (outcome.status !== "RESPONSE" || outcome.http_status !== 200) assert.equal(actions.at(-1).reason, "anchor_not_complete_200");
    else assert.equal(actions.length, 1);
  }
});

test("preparation requires Node instrumentation and the actual auth worker socket, not a parent preload", () => {
  const { preparationWorkerEvidence } = require("./replay-as.cjs");
  assert.equal(typeof preparationWorkerEvidence, "function");
  const auth = { request_id: "asdiag-auth", method: "POST", path: "/api/employees/fresh/verify-pin", started_ms: 100, completed_ms: 150 };
  const shared = { pid: 8, run: "unit", method: auth.method, path: auth.path, mono_ns: "110000000", local: ["127.0.0.1", 50000], remote: ["127.0.0.1", 8021] };
  const receipts = [{ ...shared, event: "next.receipt", request_id: auth.request_id, local: ["127.0.0.1", 3100] },
    { ...shared, event: "next.upstream.finish", request_id: auth.request_id }];
  const node = [{ event: "instrumentation.ready", pid: 8, run: "unit", targetPort: 8021, mono_ns: "90000000" }, { ...shared, event: "request.finish", request: 3, connection: 4 }];
  assert.deepEqual(preparationWorkerEvidence(receipts, node, auth), { pid: 8, run: "unit", node_request: 3, node_connection: 4, local: shared.local, remote: shared.remote });
  for (const changed of [[], node.map(row => ({ ...row, pid: 7 })), node.filter(row => row.event !== "instrumentation.ready"),
    node.map(row => row.event === "request.finish" ? { ...row, local: ["127.0.0.1", 50001] } : row), [...node, { ...node[1] }], [...node, { pid: 8, observer_error: { code: "EIO" } }]])
    assert.equal(preparationWorkerEvidence(receipts, changed, auth), null);
  assert.equal(preparationWorkerEvidence(receipts.map(row => row.event === "next.receipt" ? { ...row, pid: 7 } : row), node, auth), null);
});

test("browser dispatch uses the prepared CDP transport without page.evaluate", async () => {
  const { browserFetch } = require("./replay-as.cjs");
  let evaluated = 0, fetched = 0;
  const expected = { http_status: 200, body_bytes: 2, body_complete_browser_ms: 12, request_id_echo_matches: true };
  const transport = { evaluate: async () => { evaluated++; return expected; }, fetch: async spec => { fetched++; assert.equal(spec.path, "/api/io/drafts"); return expected; } };
  assert.deepEqual(await browserFetch(transport, { path: "/api/io/drafts" }), expected);
  assert.equal(evaluated, 0);
  assert.equal(fetched, 1);
});

test("a browser transport tool failure is a condition, never a product request failure", async () => {
  let calls = 0;
  const { BrowserTransportConditionError } = require("./browser-transport.cjs");
  const error = new BrowserTransportConditionError("browser_cdp_call_failed");
  const outcome = await core.issue({ id: "drafts", method: "GET", path: "/api/io/drafts" }, 100, { responses: {} }, () => 100,
    async () => { calls++; throw error; });
  assert.equal(calls, 1);
  assert.equal(outcome.status, "CONDITION_NOT_MET");
  assert.equal(outcome.reason, "browser_cdp_call_failed");
  assert.equal(JSON.stringify(outcome).includes("private protocol payload"), false);
});

test("submit consumes the exact fresh preview bundle and preserves its signed token", () => {
  const bundles = [{ bundle_id: "fresh-bundle", lines: [{ line_id: "fresh-line", bom_auto_token: "signed-fresh" }] }];
  const resolved = core.resolve({ bundles: { $ref: "responses.preview.bundles" }, client_request_id: { $ref: "fresh.client_request_id" } },
    { responses: { preview: { bundles } }, fresh: { client_request_id: "new-client" } });
  assert.deepEqual(resolved, { bundles, client_request_id: "new-client" });
  assert.throws(() => core.resolve({ $ref: "responses.submit.stock_requests.0.stock_request_id" }, { responses: {} }), /dependency_missing/);
});

test("the 20ms dispatch guard is inclusive and rejects early as well as late wire emission", () => {
  assert.equal(core.dispatchGuard(100, 120).ok, true);
  assert.equal(core.dispatchGuard(100, 80).ok, true);
  assert.equal(core.dispatchGuard(100, 120.001).ok, false);
  assert.equal(core.dispatchGuard(100, 79.999).ok, false);
  assert.equal(core.dispatchGuard(100, 119, 2).ok, false);
  assert.equal(core.dispatchGuard(100, 118, 2).ok, true);
});

test("API observer preserves original request and Agent and verifies its preflight path", () => {
  const http = require("node:http");
  const { EventEmitter } = require("node:events");
  const { observeApiDispatch } = require("./replay-as.cjs");
  const original = http.request;
  const agent = {};
  const request = Object.assign(new EventEmitter(), { method: "GET", path: "/api/stock-requests/fresh", getHeader: () => "asdiag-unit-detail", socket: { localPort: 42, remotePort: 3100 } });
  http.request = options => { assert.equal(options.agent, agent); return request; };
  const events = [];
  const pending = [{ id: "detail", request_id: "asdiag-unit-detail", method: "GET", actual_path: request.path, deadline_ms: Number(process.hrtime.bigint()) / 1e6 }];
  const restore = observeApiDispatch(pending, (event, fields) => events.push({ event, ...fields }), () => {});
  try {
    assert.equal(http.request({ port: 3100, agent }), request);
    assert.equal(restore.observedCount(), 1);
    request.emit("finish");
    assert.equal(events.filter(row => row.event === "client.dispatch").length, 1);
    assert.equal(pending.length, 0);
  } finally { restore(); http.request = original; }
});

test("deadlines derive from body completion without shifting the observed offsets", () => {
  assert.equal(core.deadline(500, 4330.348), 4830.348);
  assert.throws(() => core.deadline(500, NaN), /invalid_deadline/);
});

test("a fast anchor cannot silently reorder the original overlap prefix", () => {
  assert.equal(core.prefixReady(["b196", "b201"], [{ id: "b196" }]), false);
  assert.equal(core.prefixReady(["b196", "b201"], [{ id: "b196" }, { id: "b201" }]), true);
  assert.equal(core.prefixReady(["b196", "b201"], [{ id: "b196" }, { id: "b201" }, { id: "b201" }]), false);
});

test("receipt preload buffers observations while preserving original request/emit and Agent behavior", () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), { EventEmitter } = require("node:events");
  const writes = [], timers = [];
  const stream = Object.assign(new EventEmitter(), { write: value => writes.push(value) });
  const request = Object.assign(new EventEmitter(), { method: "GET", path: "/api/io/drafts", getHeader: () => "asdiag-unit-a",
    socket: { localAddress: "127.0.0.1", localPort: 50000, remoteAddress: "127.0.0.1", remotePort: 8021 } });
  const agent = {};
  const fakeHttp = { Server: class {}, request: options => { assert.equal(options.agent, agent); return request; } };
  fakeHttp.Server.prototype.emit = function(name, ...args) { return { name, args }; };
  const fakeProcess = Object.assign(new EventEmitter(), { env: { IO_REPLAY_RECEIPTS: "memory", IO_RUN_ID: "unit" }, pid: 7, hrtime: { bigint: () => 123n } });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "replay-receipt.cjs"), "utf8"), {
    require: name => name === "node:http" ? fakeHttp : { createWriteStream: () => stream, appendFileSync: (_, text) => writes.push(text) },
    process: fakeProcess, Buffer, URL, Date, setInterval: fn => { timers.push(fn); return { unref() {} }; },
  });
  assert.equal(fakeHttp.request({ port: 8021, agent }), request);
  request.emit("socket", request.socket); request.emit("finish");
  assert.equal(writes.length, 0);
  const server = new fakeHttp.Server();
  const incoming = { method: "GET", url: "/api/io/drafts?private=hidden", headers: { "x-request-id": "asdiag-unit-a", "x-admin-pin": "PRIVATE-PIN" },
    socket: { localPort: 3100, remotePort: 50001 } };
  const response = Object.assign(new EventEmitter(), { statusCode: 200 });
  const returned = server.emit("request", incoming, response);
  assert.equal(returned.args[0], incoming);
  timers[0]();
  const logged = writes.join("");
  assert.equal(logged.includes("PRIVATE-PIN"), false);
  assert.equal(logged.includes("private=hidden"), false);
  const events = logged.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(events.find(row => row.event === "next.upstream.finish").remote[1], 8021);
  assert.equal(events.find(row => row.event === "next.receipt").request_id, "asdiag-unit-a");
});

test("an unresolved detail dependency stops immediately and never waits or retries", async () => {
  let calls = 0;
  const state = { responses: {} };
  const result = await core.issue({ id: "detail", path: ["/api/stock-requests/", { $ref: "responses.submit.stock_requests.0.stock_request_id" }] },
    100, state, () => 100, async () => { calls++; });
  assert.equal(result.status, "CONDITION_NOT_MET");
  assert.equal(result.reason, "dependency_missing");
  assert.equal(calls, 0);
});

test("drafts has no submit dependency and a failed transport is called exactly once", async () => {
  let calls = 0;
  const result = await core.issue({ id: "drafts", method: "GET", path: "/api/io/drafts" }, 100,
    { responses: {} }, () => 100, async () => { calls++; throw new Error("private memo must never reach the report"); });
  assert.equal(calls, 1);
  assert.equal(result.status, "REQUEST_FAILED");
  assert.equal(result.error.type, "Error");
  assert.equal(JSON.stringify(result).includes("private memo"), false);
});

test("late driver calls stop before any request", async () => {
  let calls = 0;
  const result = await core.issue({ id: "drafts", path: "/api/io/drafts" }, 100, {}, () => 121, async () => { calls++; });
  assert.equal(result.status, "CONDITION_NOT_MET");
  assert.equal(calls, 0);
});

test("normal responses with missing dispatch or Next receipt evidence are never qualified", () => {
  const expected = [{ id: "a", deadline_ms: 100 }];
  assert.equal(core.assess(expected, [], []).status, "CONDITION_NOT_MET");
  assert.equal(core.assess(expected, [{ id: "a", actual_ms: 100 }], []).status, "CONDITION_NOT_MET");
  assert.equal(core.assess(expected, [{ id: "a", actual_ms: 120.001 }], [{ id: "a", mono_ns: "110000000" }]).status, "CONDITION_NOT_MET");
  assert.equal(core.assess(expected, [{ id: "a", actual_ms: 100 }], [{ id: "a", mono_ns: "110000000" }]).status, "CONDITION_NOT_MET");
  assert.equal(core.assess(expected, [{ id: "a", actual_ms: 100 }], [{ id: "a", mono_ns: "110000000" }], [{ id: "a" }]).status, "UNREPRODUCED");
  assert.equal(core.assess(expected, [{ id: "a", actual_ms: 100 }], [{ id: "a", mono_ns: "121000000" }]).status, "CONDITION_NOT_MET");
});

test("upstream matching requires one complete socket lifetime and rejects ambiguous duplicates", () => {
  const issued = [{ id: "a", request_id: "asdiag-unit-a", method: "GET", actual_path: "/api/io/drafts", driver_call_ms: 100, body_complete_ms: 150 }];
  const row = { event: "next.upstream.finish", request_id: "asdiag-unit-a", method: "GET", path: "/api/io/drafts", mono_ns: "110000000", pid: 4,
    upstream_connection: 7, local: ["127.0.0.1", 50000], remote: ["127.0.0.1", 8021] };
  assert.equal(core.matchUpstreams(issued, [{ ...row, event: "next.upstream.socket", local: [null, null] }]).length, 0);
  assert.equal(core.matchUpstreams(issued, [row])[0].id, "a");
  assert.equal(core.matchUpstreams(issued, [row, { ...row, event: "next.upstream.response.end" }]).length, 1);
  assert.equal(core.matchUpstreams(issued, [row, { ...row, upstream_connection: 8 }]).length, 0);
  assert.equal(core.matchUpstreams(issued, [row, { ...row }]).length, 0);
  assert.equal(core.matchUpstreams(issued, [{ ...row, event: "next.upstream.error" }]).length, 1);
});

test("manifest admission rejects missing requests and changed target deadlines", () => {
  const guard = require("./replay-guard.cjs");
  const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
  const manifest = { version: 1, origin: "http://localhost:3100", backend_port: 8021, max_dispatch_error_ms: 20,
    source: { sha256: guard.EXPECTED_TRACE, extractor_sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname, "replay-extract.py"))).digest("hex") },
    requests: guard.EXPECTED_IDS.map(id => ({ id, offset_ms: { b212: 4330.348, b213: 4459.348, a16: 4576.348 }[id] })),
    excluded: [{ source: "1-trace.network:189" }], anchor: { id: "b196" } };
  assert.doesNotThrow(() => guard.validateManifest(manifest));
  assert.throws(() => guard.validateManifest({ ...manifest, requests: manifest.requests.slice(1) }), /request_set_mismatch/);
  const changed = structuredClone(manifest); changed.requests.find(row => row.id === "a16").offset_ms++;
  assert.throws(() => guard.validateManifest(changed), /deadline_mismatch/);
});

test("Next receipts match actual resolved path and occurrence once, never another detail ID", () => {
  const issued = [{ id: "detail", request_id: "asdiag-unit-detail", method: "GET", actual_path: "/api/stock-requests/fresh", driver_call_ms: 100, body_complete_ms: 150 }];
  assert.deepEqual(core.matchReceipts(issued, [{ method: "GET", path: "/api/stock-requests/stale", mono_ns: "110000000" }]), []);
  const receipt = { request_id: "asdiag-unit-detail", method: "GET", path: "/api/stock-requests/fresh", mono_ns: "110000000", pid: 3 };
  assert.equal(core.matchReceipts(issued, [receipt])[0].id, "detail");
  assert.equal(core.matchReceipts([...issued, { ...issued[0], id: "second" }], [receipt]).length, 1);
  assert.equal(core.matchReceipts(issued, [receipt, { ...receipt, mono_ns: "111000000" }]).length, 0);
});

test("ownership guard rejects other source, head, real database and upstream", () => {
  const guard = require("./replay-guard.cjs");
  assert.equal(guard.EXPECTED_SOURCE, "/home/hw/mes-flaky-input-transport-20261019-154319/source");
  const source = guard.EXPECTED_SOURCE;
  const marker = { source, head: guard.EXPECTED_HEAD, kind: "synthetic-direct-boundaries" };
  const environment = { DATABASE_URL: `sqlite:///${source}/backend/mes_e2e.db`, BACKEND_INTERNAL_URL: "http://127.0.0.1:8021" };
  assert.doesNotThrow(() => guard.validateMarker(marker, source, environment));
  assert.throws(() => guard.validateMarker({ ...marker, head: "other" }, source, environment));
  assert.throws(() => guard.validateMarker(marker, "/mnt/c/ERP", environment));
  assert.throws(() => guard.validateMarker(marker, source, { ...environment, DATABASE_URL: `sqlite:///${source}/backend/mes.db` }));
  assert.throws(() => guard.validateMarker(marker, source, { ...environment, BACKEND_INTERNAL_URL: "http://127.0.0.1:8011" }));
  const tcp = "header\n0: 0100007F:0C1C 00000000:0000 0A 0:0 0:0 0 1000 0 991\n1: 0100007F:1F55 00000000:0000 01 0:0 0:0 0 1000 0 992";
  assert.deepEqual(guard.listeningInodes(tcp), [{ port: 3100, inode: "991" }]);
});

test("failure response artifact preserves exact bytes while JSON exposes only its path/hash", () => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
  const { preserveFailureResponse } = require("./replay-as.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mes-as-body-unit-"));
  const bytes = Buffer.from("private-response-byte-test\n\x00", "utf8");
  const target = path.join(root, "failure-a16-response.body");
  try {
    const artifact = preserveFailureResponse(root, "a16", bytes);
    assert.deepEqual(fs.readFileSync(target), bytes);
    assert.equal(artifact.sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
    assert.equal(JSON.stringify(artifact).includes("private-response-byte-test"), false);
    assert.throws(() => preserveFailureResponse(root, "a16", bytes), /EEXIST/);
    assert.throws(() => preserveFailureResponse(root, "../escape", bytes), /invalid_failure_artifact_id/);
  } finally { if (fs.existsSync(target)) fs.unlinkSync(target); fs.rmdirSync(root); }
});

test("clock calibration reads page time through the same CDP session and records raw brackets", async () => {
  const { calibrateClock } = require("./replay-as.cjs");
  assert.equal(typeof calibrateClock, "function");
  const calls = [], records = [], ticks = [100, 102, 103, 105];
  const cdp = { send: async (method, params) => {
    calls.push({ method, params });
    if (method === "Performance.getMetrics") return { metrics: [{ name: "Timestamp", value: 0.1 }] };
    if (method === "Runtime.evaluate") return { result: { type: "number", value: 33 } };
    return {};
  } };
  const clocks = await calibrateClock(cdp, (event, fields) => records.push({ event, ...fields }), () => ticks.shift());
  assert.deepEqual(calls.map(row => row.method), ["Performance.enable", "Performance.getMetrics", "Runtime.evaluate"]);
  assert.deepEqual(calls[2].params, { expression: "performance.now()", returnByValue: true });
  assert.deepEqual(clocks, { cdpToDriverMs: 1, pageToDriverMs: 71, cdpBracketMs: 2, pageBracketMs: 2 });
  assert.equal(records[0].raw_timestamp_s, 0.1);
  assert.equal(records[1].raw_timestamp_ms, 33);
  assert.equal(records[1].driver_before_ms, 103);
  assert.equal(records[1].driver_after_ms, 105);
  assert.equal(records[1].limit_ms, 10);
});

test("clock calibration records an over-budget page sample before rejecting without retry", async () => {
  const { calibrateClock } = require("./replay-as.cjs");
  assert.equal(typeof calibrateClock, "function");
  const calls = [], records = [], ticks = [100, 102, 103, 113.001];
  const cdp = { send: async method => {
    calls.push(method);
    return method === "Performance.getMetrics" ? { metrics: [{ name: "Timestamp", value: 0.1 }] } : { result: { type: "number", value: 33 } };
  } };
  await assert.rejects(calibrateClock(cdp, (event, fields) => records.push({ event, ...fields }), () => ticks.shift()), /page_clock_uncertainty_before_segment/);
  assert.equal(calls.filter(method => method === "Runtime.evaluate").length, 1);
  assert.equal(records[1].raw_timestamp_ms, 33);
  assert.equal(records[1].driver_after_ms, 113.001);
  assert.equal(records[1].accepted, false);
  assert.equal(records[1].limit_ms, 10);
});

test("clock calibration preserves the ten millisecond CDP gate and logs failed first samples", async () => {
  const { calibrateClock } = require("./replay-as.cjs");
  assert.equal(typeof calibrateClock, "function");
  const records = [], calls = [], ticks = [100, 110.001];
  const cdp = { send: async method => { calls.push(method); return { metrics: [{ name: "Timestamp", value: 0.1 }] }; } };
  await assert.rejects(calibrateClock(cdp, (event, fields) => records.push({ event, ...fields }), () => ticks.shift()), /cdp_clock_uncertainty_before_segment/);
  assert.equal(calls.includes("Runtime.evaluate"), false);
  assert.equal(records[0].driver_before_ms, 100);
  assert.equal(records[0].driver_after_ms, 110.001);
  assert.equal(records[0].accepted, false);
  assert.equal(records[0].limit_ms, 10);
});

test("final qualification follows condition overrides while preserving first-failure qualification", () => {
  assert.equal(typeof core.finalizeAssessment, "function");
  const cases = [
    { observation: "UNREPRODUCED", conditionStopped: true, firstFailure: false, issued: 3, planned: 36, status: "CONDITION_NOT_MET", qualification: "CONDITION_NOT_MET" },
    { observation: "UNREPRODUCED", conditionStopped: true, firstFailure: true, issued: 3, planned: 36, status: "CONDITION_NOT_MET", qualification: "CONDITION_NOT_MET" },
    { observation: "CONDITION_NOT_MET", conditionStopped: false, firstFailure: true, issued: 3, planned: 36, status: "CONDITION_NOT_MET", qualification: "CONDITION_NOT_MET" },
    { observation: "UNREPRODUCED", conditionStopped: false, firstFailure: true, issued: 3, planned: 36, status: "STOPPED_AT_FIRST_FAILURE", qualification: "UNREPRODUCED" },
    { observation: "UNREPRODUCED", conditionStopped: false, firstFailure: false, issued: 36, planned: 36, status: "UNREPRODUCED", qualification: "UNREPRODUCED" },
    { observation: "UNREPRODUCED", conditionStopped: false, firstFailure: false, issued: 3, planned: 36, status: "CONDITION_NOT_MET", qualification: "CONDITION_NOT_MET" },
  ];
  for (const row of cases) {
    const observed = { status: row.observation, gaps: [] };
    const result = core.finalizeAssessment(observed, row);
    assert.equal(result.status, row.status);
    assert.equal(result.qualification, row.qualification);
    assert.equal(observed.status, row.observation);
  }
});
