"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
let api = {};
try { api = require("./observation-next-probe.cjs"); } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error; }
function evidence() {
  const common = { run: "unit", pid: 30, method: "GET", path: "/api/observation-probe", request_id: "asdiag-unit-a", mono_ns: "110000000" };
  const tuple = { local: ["127.0.0.1", 50123], remote: ["127.0.0.1", 8021] };
  return { run: "unit", parentPid: 10, launcherPid: 20,
    request: { id: "a", request_id: common.request_id, method: "GET", actual_path: common.path, deadline_ms: 100, driver_call_ms: 100, body_complete_ms: 120 },
    dispatch: { id: "a", actual_ms: 101 }, receipts: [{ ...common, event: "next.receipt" }, { ...common, ...tuple, event: "next.upstream.finish", upstream_connection: 1 }],
    nodeRows: [{ event: "instrumentation.ready", run: "unit", pid: 30, ppid: 20, targetPort: 8021, mono_ns: "90000000" }, { ...common, ...tuple, event: "request.finish", request: 1, connection: 2 }],
    packets: [{ event: "tcp.packet", ...tuple, data_len: 100 }, { event: "tcp.packet", local: tuple.remote, remote: tuple.local, data_len: 100 }],
    channel: { run: "unit", failure: null }, guard: { stopped: null, issued_ids: ["a"], unissued_ids: [] } };
}
test("actual Next proof requires the worker child, both preloads and both packet directions", () => {
  assert.equal(typeof api.auditProbeEvidence, "function");
  const value = api.auditProbeEvidence(evidence());
  assert.equal(value.worker.pid, 30);
  assert.equal(value.packet_directions, 2);
  assert.equal(value.qualification, "UNREPRODUCED");
});
test("parent-only instrumentation and missing packet directions cannot qualify", () => {
  assert.equal(typeof api.auditProbeEvidence, "function");
  const missing = evidence(); missing.nodeRows[0].pid = 20;
  assert.throws(() => api.auditProbeEvidence(missing), /actual_worker_preloads_unproven/);
  const oneDirection = evidence(); oneDirection.packets.pop();
  assert.throws(() => api.auditProbeEvidence(oneDirection), /bidirectional_packet_evidence_missing/);
  const stopped = evidence(); stopped.guard.stopped = { reason: "observation_delivery_late" };
  assert.throws(() => api.auditProbeEvidence(stopped), /live_observation_failed/);
});
