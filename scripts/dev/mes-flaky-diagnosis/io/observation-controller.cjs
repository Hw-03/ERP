"use strict";
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { dispatchGuard } = require("./replay-core.cjs");
const MAX_FRAME_BYTES = 65536;
const MAX_QUEUE_BYTES = 1024 * 1024;
const MAX_OBSERVATIONS = 100000;
const SOURCES = new Set(["next_receipt", "packet", "kernel"]);
const clock = () => process.hrtime.bigint();
const msToNs = value => BigInt(Math.round(value * 1e6));

/** Latch observation failure before another dispatch, including delayed timers. */
function createReceiptGuard({ run, plannedIds = [], nowNs = clock, setTimer = setTimeout, clearTimer = clearTimeout, record = () => {}, onStop = () => {} }) {
  if (!run) throw new Error("observation_run_required");
  const expected = new Map(), receipts = [], later = [];
  let stopped = null;
  const stop = (reason, id, violationNs = nowNs()) => {
    if (stopped) return stopped;
    const detected = nowNs().toString();
    stopped = { reason, id, first_violation_mono_ns: String(violationNs), detection_mono_ns: detected, stop_mono_ns: detected };
    for (const row of expected.values()) clearTimer(row.timer);
    record("observation.stop", stopped); onStop(stopped);
    return stopped;
  };
  const expire = () => {
    if (stopped) return false;
    const tick = nowNs();
    for (const row of expected.values()) if (!row.received && tick > row.latestNs) {
      stop("receipt_observation_unavailable", row.id, row.latestNs); return false;
    }
    return true;
  };
  const arm = row => {
    row.timer = setTimer(() => { if (expire() && !row.received) arm(row); }, Math.max(1, Math.ceil(Number(row.latestNs - nowNs()) / 1e6)));
    row.timer?.unref?.();
  };
  return {
    beforeDispatch: expire,
    register(metadata) {
      if (!expire()) return false;
      if (!metadata.request_id || expected.has(metadata.request_id)) { stop("receipt_expectation_duplicate", metadata.id); return false; }
      const row = { ...metadata, latestNs: msToNs(metadata.deadline_ms + 20 - (metadata.deadline_uncertainty_ms ?? 0)), received: false, issued: false };
      expected.set(row.request_id, row); arm(row);
      record("observation.expected", { id: row.id, request_id: row.request_id, deadline_ms: row.deadline_ms, latest_mono_ns: String(row.latestNs) });
      return true;
    },
    markIssued(id) {
      if (!expire()) return false;
      const row = [...expected.values()].find(value => value.id === id);
      if (!row || row.issued) { stop("receipt_issue_registration_invalid", id); return false; }
      row.issued = true; row.issued_mono_ns = nowNs().toString();
      return true;
    },
    observe(event, receivedNs = nowNs()) {
      if (event.event !== "next.receipt") return;
      if (stopped) { if (later.length < MAX_OBSERVATIONS) later.push({ ...event, consumer_received_mono_ns: String(receivedNs) }); return; }
      const row = expected.get(event.request_id);
      if (!row) return; // Preparation and independent requests are not segment requests.
      const value = { ...event, id: row.id, consumer_received_mono_ns: String(receivedNs) };
      receipts.push(value);
      if (event.run !== run) { stop("observation_wrong_run", row.id); return; }
      if (row.received) { stop("next_receipt_duplicate", row.id); return; }
      if (event.method !== row.method || event.path !== row.actual_path || !/^\d+$/.test(event.mono_ns ?? "")) { stop("next_receipt_metadata_mismatch", row.id); return; }
      row.received = true; clearTimer(row.timer);
      const eventNs = BigInt(event.mono_ns);
      if (!dispatchGuard(row.deadline_ms, Number(eventNs) / 1e6, row.deadline_uncertainty_ms ?? 0).ok)
        stop("next_receipt_outside_20ms", row.id, eventNs);
      else if (receivedNs > row.latestNs) stop("observation_delivery_late", row.id, row.latestNs);
      else record("observation.receipt.accepted", value);
    },
    stop,
    snapshot() { const rows = [...expected.values()]; return { stopped, registered_ids: rows.map(row => row.id), issued_ids: rows.filter(row => row.issued).map(row => row.id), unissued_ids: plannedIds.filter(id => !rows.some(row => row.id === id && row.issued)), receipts: [...receipts], later_events: [...later] }; },
    dispose() { for (const row of expected.values()) clearTimer(row.timer); },
  };
}

/** Own one bounded NDJSON channel; producer clocks remain separate from delivery. */
function createObservationController({ socketPath, run, requiredSources = ["next_receipt", "packet"], nowNs = clock, onEvent = () => {}, onFailure = () => {}, shutdownTimeoutMs = 1000 }) {
  if (!run) throw new Error("observation_run_required");
  if (!socketPath) throw new Error("observation_socket_required");
  const events = new EventEmitter(), connections = new Set(), observations = [], failures = [], phases = new Map();
  let closing = false, failure = null, closePromise;
  const fail = (reason, fields = {}) => {
    const value = { reason, detection_mono_ns: nowNs().toString(), ...fields };
    if (failures.length < MAX_OBSERVATIONS) failures.push(value);
    if (!failure) { failure = value; onFailure(value); events.emit("failure", value); }
  };
  const producersReady = () => requiredSources.every(source => [...connections].some(row => row.source === source && row.ready && !row.socket.destroyed));
  const isReady = () => !closing && !failure && producersReady();
  const send = (connection, event, fields = {}) => {
    const line = JSON.stringify({ v: 1, run, source: "observer", pid: process.pid, seq: ++connection.outSeq, event, mono_ns: nowNs().toString(), ...fields }) + "\n";
    if (Buffer.byteLength(line) > MAX_FRAME_BYTES || connection.socket.writableLength + Buffer.byteLength(line) > MAX_QUEUE_BYTES) { fail("observation_queue_overflow"); return false; }
    connection.socket.write(line); return true;
  };
  const server = net.createServer(socket => {
    const connection = { socket, seq: 0, outSeq: 0, source: null, pid: null, ready: false, intentional: false, buffer: Buffer.alloc(0) };
    connections.add(connection);
    socket.on("error", error => { if (!closing && !connection.intentional) fail("observation_socket_error", { code: error.code }); });
    socket.on("close", () => {
      connections.delete(connection);
      if (connection.shutdownResolve) {
        if (!connection.goodbyeAck) fail("observation_shutdown_ack_missing", { source: connection.source });
        clearTimeout(connection.shutdownTimer); connection.shutdownResolve(); connection.shutdownResolve = null;
      }
      if (!closing && !connection.intentional) fail("observation_disconnect", { source: connection.source, producer_pid: connection.pid });
    });
    const accept = row => {
      if (row.run !== run) { fail("observation_wrong_run"); return; }
      if (row.v !== 1 || !SOURCES.has(row.source) || !Number.isSafeInteger(row.pid) || row.pid <= 0 || !Number.isSafeInteger(row.seq) || row.seq < 1 || typeof row.event !== "string" || !/^\d+$/.test(row.mono_ns ?? "")) { fail("observation_malformed_envelope"); return; }
      if (row.seq <= connection.seq) { fail("observation_sequence_duplicate"); return; }
      if (row.seq !== connection.seq + 1) { fail("observation_sequence_gap"); return; }
      if (connection.source && (row.source !== connection.source || row.pid !== connection.pid)) { fail("observation_producer_changed"); return; }
      if (!connection.source) {
        if (row.event !== "observer.hello") { fail("observation_hello_required"); return; }
        if ([...connections].some(other => other !== connection && other.source === row.source && other.pid === row.pid)) { fail("observation_producer_duplicate"); return; }
        connection.source = row.source; connection.pid = row.pid;
      }
      connection.seq = row.seq;
      const receivedNs = nowNs();
      const value = { ...row, consumer_received_mono_ns: receivedNs.toString() };
      if (observations.length >= MAX_OBSERVATIONS) { fail("observation_queue_overflow"); return; }
      observations.push(value); onEvent(value, receivedNs); events.emit("observation", value);
      if (row.event === "observer.hello") { send(connection, "observer.ready"); return; }
      if (row.event === "observer.goodbye") {
        if (!closing) fail("observation_producer_stopped", { source: row.source });
        connection.intentional = true; send(connection, "observer.goodbye.ack"); socket.end(); return;
      }
      if (row.event === "observer.goodbye.ack") {
        if (!closing || !connection.shutdownResolve) { fail("observation_goodbye_ack_unexpected"); return; }
        connection.goodbyeAck = true; clearTimeout(connection.shutdownTimer);
        connection.shutdownResolve(); connection.shutdownResolve = null; socket.end(); return;
      }
      if (row.event === "next.ready" || row.event === "capture.ready" || row.event === "kernel.ready") { connection.ready = true; if (isReady()) events.emit("ready"); }
      if (row.event === "observer.phase.ack") {
        const phase = phases.get(row.phase_id);
        if (!phase || phase.phase !== row.phase || !phase.pending.has(connection)) { fail("observation_phase_ack_mismatch"); return; }
        phase.pending.delete(connection);
        if (!phase.pending.size) { clearTimeout(phase.timer); phases.delete(row.phase_id); phase.resolve(); }
      }
      if (row.observer_error || row.event === "capture.error" || row.event === "kernel.error") fail("observation_capture_error", { source: row.source });
      const loss = row.loss ?? row;
      if (row.unknown_bpf_loss === true || loss.unknown_bpf_loss === true) fail("observation_capture_loss_unknown", { source: row.source, unknown_bpf_loss: true });
      if (row.event === "capture.loss" || row.event === "kernel.loss" || ["kernel_packet_drops", "userspace_record_loss", "bpf_event_loss", "interval_kernel_packet_drops", "cumulative_kernel_packet_drops"].some(key => Number(loss[key] ?? 0) > 0)) fail("observation_capture_loss", { source: row.source,
        kernel_packet_drops: loss.kernel_packet_drops ?? 0, userspace_record_loss: loss.userspace_record_loss ?? 0, bpf_event_loss: loss.bpf_event_loss ?? 0 });
    };
    socket.on("data", chunk => {
      connection.buffer = Buffer.concat([connection.buffer, chunk]);
      let end;
      while ((end = connection.buffer.indexOf(10)) >= 0) {
        if (end > MAX_FRAME_BYTES) { fail("observation_frame_overflow"); socket.destroy(); return; }
        const frame = connection.buffer.subarray(0, end); connection.buffer = connection.buffer.subarray(end + 1);
        let row; try { row = JSON.parse(frame.toString("utf8")); } catch { fail("observation_malformed_frame"); return; }
        if (!row || typeof row !== "object" || Array.isArray(row)) { fail("observation_malformed_envelope"); return; }
        accept(row);
      }
      if (connection.buffer.length > MAX_FRAME_BYTES) { fail("observation_frame_overflow"); socket.destroy(); }
    });
  });
  server.on("error", error => fail("observation_server_error", { code: error.code }));
  return {
    events, isReady,
    listen() { return new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, () => { server.removeListener("error", reject); resolve(); }); }); },
    waitForReady(timeoutMs = 1000) {
      if (isReady()) return Promise.resolve();
      if (failure) return Promise.reject(new Error(failure.reason));
      return new Promise((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); events.removeListener("ready", ready); events.removeListener("failure", failed); };
        const ready = () => { cleanup(); resolve(); };
        const failed = value => { cleanup(); reject(new Error(value.reason)); };
        const timer = setTimeout(() => { cleanup(); fail("observation_readiness_timeout"); reject(new Error("observation_readiness_timeout")); }, timeoutMs);
        events.once("ready", ready); events.once("failure", failed);
      });
    },
    phase(phase, phaseId, timeoutMs = 1000) {
      const preserving = ["before_capture", "after_capture", "dispatch_stop", "preservation", "cleanup"].includes(phase);
      if (closing || (!preserving && (!producersReady() || failure))) return Promise.reject(new Error("observation_not_ready"));
      if (preserving && !producersReady()) fail("observation_preservation_incomplete");
      if (phases.has(phaseId)) return Promise.reject(new Error("observation_phase_duplicate"));
      return new Promise((resolve, reject) => {
        const pending = new Set([...connections].filter(row => row.ready));
        if (!pending.size) { resolve(); return; }
        const timer = setTimeout(() => { phases.delete(phaseId); fail("observation_phase_ack_timeout"); reject(new Error("observation_phase_ack_timeout")); }, timeoutMs);
        phases.set(phaseId, { phase, pending, timer, resolve, reject });
        for (const connection of pending) send(connection, "observer.phase", { phase, phase_id: phaseId });
      });
    },
    snapshot() { return { run, ready: isReady(), closing, failure, failures: [...failures], observations: [...observations], producers: [...connections].map(({ source, pid, seq, ready }) => ({ source, pid, seq, ready })) }; },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      for (const phase of phases.values()) { clearTimeout(phase.timer); phase.reject(new Error("observation_closed")); }
      phases.clear();
      const shutdowns = [];
      for (const connection of connections) {
        if (connection.intentional || connection.socket.destroyed) continue;
        connection.intentional = true;
        shutdowns.push(new Promise(resolve => { connection.shutdownResolve = resolve; }));
        connection.shutdownTimer = setTimeout(() => {
          fail("observation_shutdown_ack_timeout", { source: connection.source });
          connection.socket.destroy();
        }, shutdownTimeoutMs);
        send(connection, "observer.goodbye", { reason: "intentional_observer_close" });
      }
      const serverClosed = new Promise(resolve => { if (!server.listening) resolve(); else server.close(resolve); });
      closePromise = Promise.all(shutdowns).then(() => serverClosed);
      return closePromise;
    },
  };
}
module.exports = { createReceiptGuard, createObservationController, MAX_FRAME_BYTES, MAX_QUEUE_BYTES };
