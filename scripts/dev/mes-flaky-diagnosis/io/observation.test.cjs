"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
let api = {};
try { api = require("./observation-controller.cjs"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
let clientApi = {};
try { clientApi = require("./observation-client.cjs"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }

function fixture() {
  assert.equal(typeof api.createReceiptGuard, "function", "live receipt guard must exist before dispatch");
  let tick = 100000000n;
  const timers = new Map(), records = [], stops = [];
  let serial = 0;
  const guard = api.createReceiptGuard({ run: "unit", plannedIds: ["a", "b", "c"], nowNs: () => tick,
    setTimer: fn => { timers.set(++serial, fn); return serial; }, clearTimer: id => timers.delete(id),
    record: (event, fields) => records.push({ event, ...fields }), onStop: value => stops.push(value) });
  return { guard, records, stops, advance(ms, fire = true) { tick = BigInt(Math.round(ms * 1e6)); if (fire) for (const fn of [...timers.values()]) fn(); } };
}
const expected = id => ({ id, request_id: `asdiag-unit-${id}`, method: "GET", actual_path: "/api/unit", deadline_ms: 100 });
const receipt = (id, ms) => ({ run: "unit", event: "next.receipt", request_id: `asdiag-unit-${id}`, method: "GET", path: "/api/unit", mono_ns: String(BigInt(Math.round(ms * 1e6))) });

test("normal receipt is checked at original time and delivery time independently", () => {
  const f = fixture();
  assert.equal(f.guard.register(expected("a")), true);
  f.advance(110, false); f.guard.observe(receipt("a", 108));
  f.advance(121);
  assert.equal(f.guard.beforeDispatch(), true);
  assert.equal(f.guard.snapshot().stopped, null);
  assert.equal(f.guard.snapshot().receipts[0].consumer_received_mono_ns, "110000000");
  assert.equal(f.guard.snapshot().receipts[0].mono_ns, "108000000");
});

test("late observer delivery of an on-time event stops and preserves later observations", () => {
  const f = fixture(); f.guard.register(expected("a"));
  f.advance(125, false); f.guard.observe(receipt("a", 108));
  const state = f.guard.snapshot();
  assert.equal(state.stopped.reason, "observation_delivery_late");
  assert.equal(state.stopped.first_violation_mono_ns, "120000000");
  assert.equal(state.stopped.detection_mono_ns, "125000000");
  assert.equal(state.stopped.stop_mono_ns, "125000000");
  f.guard.observe(receipt("a", 108));
  assert.equal(f.guard.snapshot().later_events.length, 1);
  assert.equal(f.guard.snapshot().stopped.reason, state.stopped.reason);
});

test("true late event is distinct from late delivery and cannot resume", () => {
  const f = fixture(); f.guard.register(expected("a"));
  f.advance(125, false); f.guard.observe(receipt("a", 124));
  assert.equal(f.guard.snapshot().stopped.reason, "next_receipt_outside_20ms");
  assert.equal(f.guard.beforeDispatch(), false);
  assert.equal(f.guard.register(expected("b")), false);
});

test("missing receipt deadline timer stops before a later scheduled request", () => {
  const f = fixture(); f.guard.register(expected("a")); f.guard.markIssued("a"); f.advance(121);
  assert.equal(f.guard.snapshot().stopped.reason, "receipt_observation_unavailable");
  assert.equal(f.guard.beforeDispatch(), false);
  assert.deepEqual(f.guard.snapshot().unissued_ids, ["b", "c"]);
});

test("synchronous pre-dispatch gate catches expiry when event loop timer was stalled", () => {
  const f = fixture(); f.guard.register(expected("a")); f.advance(130, false);
  assert.equal(f.guard.beforeDispatch(), false);
  assert.equal(f.guard.snapshot().stopped.reason, "receipt_observation_unavailable");
  assert.equal(f.stops.length, 1);
});

test("stop blocks new dispatch while the already issued request settles normally", async () => {
  const f = fixture(); let finish;
  const inflight = new Promise(resolve => { finish = resolve; });
  const calls = [];
  if (f.guard.register(expected("a")) && f.guard.markIssued("a")) calls.push("a");
  f.advance(121);
  if (f.guard.register(expected("b"))) calls.push("b");
  finish({ status: "REQUEST_FAILED", error: { code: "ECONNRESET" } });
  assert.deepEqual(calls, ["a"]);
  assert.equal((await inflight).status, "REQUEST_FAILED");
  assert.deepEqual(f.guard.snapshot().issued_ids, ["a"]);
});

test("expectations registered before the transport boundary remain distinct from issued requests", () => {
  const f = fixture(); f.guard.register(expected("a"));
  assert.deepEqual(f.guard.snapshot().registered_ids, ["a"]);
  assert.deepEqual(f.guard.snapshot().issued_ids, []);
  assert.deepEqual(f.guard.snapshot().unissued_ids, ["a", "b", "c"]);
  f.advance(121, false);
  assert.equal(f.guard.markIssued("a"), false);
  assert.deepEqual(f.guard.snapshot().issued_ids, []);
});

test("closing the controller after capture explicitly tells a live producer to stop intentionally", { timeout: 3000 }, async t => {
  const f = await controllerFixture(t, ["next_receipt"]);
  const errors = [];
  const client = clientApi.createObservationClient({ socketPath: f.target, run: "unit", source: "next_receipt", pid: 333, onError: value => errors.push(value) });
  client.start(); await f.controller.waitForReady(500);
  await f.controller.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.snapshot().closed, true);
  assert.deepEqual(errors, []);
});

test("a failed observation still accepts a preservation phase and waits for final-drain goodbye ack", { timeout: 3000 }, async t => {
  const f = await controllerFixture(t);
  const socket = await rawProducer(f.target);
  socket.write(JSON.stringify(wire(2, "capture.ready")) + "\n");
  await f.controller.waitForReady(500);
  const observed = new Promise(resolve => f.controller.events.once("observation", resolve));
  socket.write(JSON.stringify(wire(3, "capture.statistics", { unknown_bpf_loss: true })) + "\n");
  // A health message with an unknown loss count must fail closed.
  await observed;
  assert.equal(f.controller.snapshot().failure?.reason, "observation_capture_loss_unknown");
  const phase = f.controller.phase("after_capture", "failed-preservation", 500);
  const phaseRow = JSON.parse(String(await new Promise(resolve => socket.once("data", resolve))).trim());
  assert.equal(phaseRow.phase, "after_capture");
  socket.write(JSON.stringify(wire(4, "observer.phase.ack", { phase: "after_capture", phase_id: "failed-preservation" })) + "\n");
  await phase;
  let closed = false;
  const closure = f.controller.close().then(() => { closed = true; });
  const goodbye = JSON.parse(String(await new Promise(resolve => socket.once("data", resolve))).trim());
  assert.equal(goodbye.event, "observer.goodbye");
  assert.equal(closed, false, "close must wait for the producer's final drain");
  socket.write(JSON.stringify(wire(5, "capture.statistics", { kernel_packet_drops: 0, userspace_record_loss: 0, bpf_event_loss: 0 })) + "\n");
  socket.write(JSON.stringify(wire(6, "observer.goodbye.ack")) + "\n");
  socket.end(); await closure;
  assert.equal(f.controller.snapshot().observations.at(-2).event, "capture.statistics");
  assert.equal(f.controller.snapshot().observations.at(-1).event, "observer.goodbye.ack");
  assert.equal(f.controller.isReady(), false);
});

test("early receipt, duplicate receipt and uncertainty retain the twenty millisecond budget", () => {
  for (const [ms, uncertainty, reason] of [[79, 0, "next_receipt_outside_20ms"], [119, 2, "next_receipt_outside_20ms"]]) {
    const f = fixture(); f.guard.register({ ...expected("a"), deadline_uncertainty_ms: uncertainty });
    f.advance(ms, false); f.guard.observe(receipt("a", ms));
    assert.equal(f.guard.snapshot().stopped.reason, reason);
  }
  const f = fixture(); f.guard.register(expected("a")); f.guard.observe(receipt("a", 100)); f.guard.observe(receipt("a", 100));
  assert.equal(f.guard.snapshot().stopped.reason, "next_receipt_duplicate");
});

let socketSerial = 0;
const rawSockets = new Map();
async function controllerFixture(t, requiredSources = ["packet"]) {
  assert.equal(typeof api.createObservationController, "function", "controller must provide explicit readiness");
  const target = process.platform === "win32" ? `\\\\.\\pipe\\mes-observation-unit-${process.pid}-${++socketSerial}` : path.join(os.tmpdir(), `mes-obs-${process.pid}-${++socketSerial}.sock`);
  const failures = [];
  const controller = api.createObservationController({ socketPath: target, run: "unit", requiredSources, onFailure: value => failures.push(value) });
  await controller.listen();
  t.after(async () => { for (const socket of rawSockets.get(target) ?? []) socket.destroy(); await controller.close(); rawSockets.delete(target); if (process.platform !== "win32" && fs.existsSync(target)) fs.unlinkSync(target); });
  return { controller, target, failures };
}
const wire = (seq, event, extra = {}) => ({ v: 1, run: "unit", source: "packet", pid: 71, seq, event, mono_ns: process.hrtime.bigint().toString(), ...extra });
async function rawProducer(target) {
  const socket = net.createConnection(target);
  if (!rawSockets.has(target)) rawSockets.set(target, []);
  rawSockets.get(target).push(socket);
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  socket.write(JSON.stringify(wire(1, "observer.hello")) + "\n");
  await new Promise(resolve => socket.once("data", resolve));
  return socket;
}

test("IPC requires ready plus a phase ack before admitting a segment", { timeout: 3000 }, async t => {
  const f = await controllerFixture(t);
  const socket = await rawProducer(f.target); t.after(() => socket.destroy());
  assert.equal(f.controller.isReady(), false);
  socket.write(JSON.stringify(wire(2, "capture.ready")) + "\n");
  await f.controller.waitForReady(500);
  const phase = f.controller.phase("segment", "unit-segment", 500);
  const message = JSON.parse(String(await new Promise(resolve => socket.once("data", resolve))).trim());
  assert.equal(message.event, "observer.phase");
  socket.write(JSON.stringify(wire(3, "observer.phase.ack", { phase: "segment", phase_id: "unit-segment" })) + "\n");
  await phase;
  assert.equal(f.failures.length, 0);
});

for (const [name, row, reason] of [
  ["wrong run", wire(2, "capture.ready", { run: "other" }), "observation_wrong_run"],
  ["missing run", wire(2, "capture.ready", { run: undefined }), "observation_wrong_run"],
  ["sequence duplicate", wire(1, "capture.ready"), "observation_sequence_duplicate"],
  ["sequence gap", wire(3, "capture.ready"), "observation_sequence_gap"],
  ["packet loss", wire(2, "capture.loss", { kernel_packet_drops: 1, userspace_record_loss: 0, bpf_event_loss: 0 }), "observation_capture_loss"],
  ["collector error", wire(2, "capture.error", { reason: "unit" }), "observation_capture_error"],
]) test(`IPC ${name} latches a stop`, { timeout: 3000 }, async t => {
  const f = await controllerFixture(t); const socket = await rawProducer(f.target); t.after(() => socket.destroy());
  const failure = new Promise(resolve => f.controller.events.once("failure", resolve));
  socket.write(JSON.stringify(row) + "\n");
  assert.equal((await failure).reason, reason);
});

test("disconnect and a producer-initiated goodbye before controller shutdown both stop", { timeout: 3000 }, async t => {
  const f = await controllerFixture(t); const socket = await rawProducer(f.target);
  const failure = new Promise(resolve => f.controller.events.once("failure", resolve)); socket.destroy();
  assert.equal((await failure).reason, "observation_disconnect");
  const g = await controllerFixture(t); const clean = await rawProducer(g.target);
  clean.write(JSON.stringify(wire(2, "observer.goodbye")) + "\n");
  await new Promise(resolve => clean.once("close", resolve));
  assert.equal(g.failures[0]?.reason, "observation_producer_stopped");
});

test("malformed and oversized frames stop without recording their raw contents", { timeout: 3000 }, async t => {
  for (const [payload, reason] of [["{private-payload}\n", "observation_malformed_frame"], ["x".repeat(65537), "observation_frame_overflow"]]) {
    const f = await controllerFixture(t); const socket = await rawProducer(f.target); t.after(() => socket.destroy());
    const failure = new Promise(resolve => f.controller.events.once("failure", resolve)); socket.write(payload);
    assert.equal((await failure).reason, reason);
    assert.equal(JSON.stringify(f.controller.snapshot()).includes("private-payload"), false);
  }
});

test("async producer sends metadata before evidence-file flush and acknowledges phases", { timeout: 3000 }, async t => {
  const f = await controllerFixture(t, ["next_receipt"]);
  assert.equal(typeof clientApi.createObservationClient, "function");
  const client = clientApi.createObservationClient({ socketPath: f.target, run: "unit", source: "next_receipt", pid: 99 });
  t.after(() => client.close());
  client.send("next.receipt", { request_id: "asdiag-unit-a", method: "GET", path: "/api/unit", mono_ns: "100000000" });
  await f.controller.waitForReady(500);
  await f.controller.phase("segment", "unit-phase", 500);
  const rows = f.controller.snapshot().observations;
  const observed = rows.find(row => row.event === "next.receipt");
  assert.ok(observed);
  assert.equal(observed.mono_ns, "100000000");
  assert.match(observed.consumer_received_mono_ns, /^\d+$/);
  assert.deepEqual(rows.map(row => row.seq), [1, 2, 3, 4]);
});

test("producer queue overflow is terminal and never leaks the rejected metadata", () => {
  assert.equal(typeof clientApi.createObservationClient, "function");
  const errors = [];
  const client = clientApi.createObservationClient({ socketPath: "unused", run: "unit", source: "next_receipt", onError: value => errors.push(value) });
  assert.equal(client.send("next.receipt", { path: "private-".repeat(10000) }), false);
  assert.equal(client.snapshot().failed, "observation_queue_overflow");
  assert.equal(client.send("next.receipt", { path: "/api/unit" }), false);
  assert.equal(errors.length, 1);
  assert.equal(JSON.stringify(errors).includes("private-"), false);
});

test("core issue checks the same synchronous latch immediately before transport", async () => {
  const core = require("./replay-core.cjs"); let calls = 0;
  const result = await core.issue({ id: "b", method: "GET", path: "/api/unit" }, 100, {}, () => 100,
    async () => { calls++; return { http_status: 200 }; }, () => false);
  assert.equal(calls, 0);
  assert.equal(result.status, "SKIPPED_AFTER_STOP");
});

test("first-stop phase is sent once without waiting for an in-flight operation to settle", async () => {
  const { createStopPhaseLatch } = require("./replay-as.cjs");
  assert.equal(typeof createStopPhaseLatch, "function");
  let acknowledge; const calls = [], records = [];
  const boundary = createStopPhaseLatch({ phase: (phase, phaseId) => { calls.push({ phase, phaseId }); return new Promise(resolve => { acknowledge = resolve; }); } }, (event, fields) => records.push({ event, ...fields }));
  boundary.notify(); boundary.notify();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].phase, "dispatch_stop");
  assert.equal(boundary.snapshot().status, "PENDING");
  acknowledge(); await boundary.settle();
  assert.equal(boundary.snapshot().status, "ACKNOWLEDGED");
  assert.equal(records.at(-1).event, "observer.stop_phase.ack");
});

test("a first stop after channel shutdown is terminal before final evidence is written", { timeout: 3000 }, async t => {
  const { createStopPhaseLatch } = require("./replay-as.cjs");
  const f = await controllerFixture(t, []), records = [];
  await f.controller.close();
  const boundary = createStopPhaseLatch(f.controller, (event, fields) => records.push({ event, ...fields }));
  boundary.notify();
  assert.equal(boundary.snapshot().status, "NOT_APPLICABLE");
  assert.equal(boundary.snapshot().reason, "observation_channel_shutdown");
  assert.equal(records.at(-1).event, "observer.stop_phase.not_applicable");
  await boundary.settle();
  assert.equal(boundary.snapshot().status, "NOT_APPLICABLE");
});

test("receipt evidence queue overflow and synchronous write errors notify loss while original emit continues", () => {
  const vm = require("node:vm"), { EventEmitter } = require("node:events");
  for (const mode of ["queue", "write", "async_write"]) {
    const live = [], intervals = [];
    const stream = Object.assign(new EventEmitter(), { writableLength: 0, write: (_, callback) => {
      if (mode === "write") throw Object.assign(new Error(), { code: "ENOSPC" });
      if (mode === "async_write") callback(Object.assign(new Error(), { code: "ENOSPC" }));
    } });
    const fakeHttp = { Server: class {}, request: () => new EventEmitter() };
    fakeHttp.Server.prototype.emit = () => "original-result";
    const fakeProcess = Object.assign(new EventEmitter(), { env: { IO_REPLAY_RECEIPTS: "memory", IO_RUN_ID: "unit", IO_OBSERVATION_SOCKET: "fake" }, pid: 321, hrtime: process.hrtime });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "replay-receipt.cjs"), "utf8"), {
      require: name => name === "node:http" ? fakeHttp : name === "node:fs" ? { createWriteStream: () => stream, appendFileSync() {} } : { createObservationClient: () => ({ send: (event, fields) => live.push({ event, ...fields }), close() {} }) },
      process: fakeProcess, Buffer, URL, Date, setInterval: fn => { intervals.push(fn); return { unref() {} }; },
    });
    const incoming = { method: "GET", url: "/api/" + "x".repeat(mode === "queue" ? 65000 : 4), headers: { "x-request-id": "asdiag-unit-a" }, socket: { localPort: 3100 } };
    for (let i = 0; i < (mode === "queue" ? 20 : 1); i++) assert.equal(new fakeHttp.Server().emit("request", incoming, new EventEmitter()), "original-result");
    if (mode !== "queue") assert.doesNotThrow(() => intervals[0]());
    assert.ok(live.some(row => row.event === "capture.loss" && row.userspace_record_loss > 0), `${mode} must publish explicit evidence loss`);
    assert.ok(live.some(row => row.event === "capture.error"));
  }
});

test("receipt preload notifies the socket immediately while its evidence file stays buffered", { timeout: 3000 }, async t => {
  const f = await controllerFixture(t, ["next_receipt"]);
  const vm = require("node:vm"), { EventEmitter } = require("node:events");
  const writes = [], intervals = [];
  const stream = Object.assign(new EventEmitter(), { write: value => writes.push(value) });
  const fakeHttp = { Server: class {}, request: () => new EventEmitter() };
  fakeHttp.Server.prototype.emit = function (event, ...args) { return { event, args }; };
  const fakeProcess = Object.assign(new EventEmitter(), { env: { IO_REPLAY_RECEIPTS: "memory", IO_RUN_ID: "unit", IO_OBSERVATION_SOCKET: f.target }, pid: 321, hrtime: process.hrtime });
  const context = { require: name => name === "node:http" ? fakeHttp : name === "node:fs" ? { createWriteStream: () => stream, appendFileSync: (_, value) => writes.push(value) } : require(name),
    process: fakeProcess, Buffer, URL, Date, setInterval: fn => { intervals.push(fn); return { unref() {} }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "replay-receipt.cjs"), "utf8"), context);
  const incoming = { method: "GET", url: "/api/unit?private=hidden", headers: { "x-request-id": "asdiag-unit-a", cookie: "private-cookie", "x-admin-pin": "private-pin" }, socket: { localPort: 3100, remotePort: 50123 } };
  const response = Object.assign(new EventEmitter(), { statusCode: 200 });
  const result = new fakeHttp.Server().emit("request", incoming, response);
  assert.equal(result.args[0], incoming);
  assert.equal(writes.length, 0);
  await f.controller.waitForReady(500);
  await f.controller.phase("segment", "preload-unit", 500);
  const observed = f.controller.snapshot().observations.find(row => row.event === "next.receipt");
  assert.ok(observed, "receipt must be delivered before the 250ms file flush");
  assert.equal(observed.request_id, "asdiag-unit-a");
  assert.equal(JSON.stringify(f.controller.snapshot()).includes("private-"), false);
  intervals[0]();
  assert.equal(writes.length, 1);
  t.after(() => fakeProcess.emit("beforeExit"));
});
