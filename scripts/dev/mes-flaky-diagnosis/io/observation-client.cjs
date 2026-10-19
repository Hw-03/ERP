"use strict";
const net = require("node:net");
const MAX_FRAME_BYTES = 65536;
const MAX_QUEUE_BYTES = 1024 * 1024;

/** Send bounded metadata asynchronously; a transport fault is permanent for a run. */
function createObservationClient({ socketPath, run, source, pid = process.pid, nowNs = () => process.hrtime.bigint(), onError = () => {}, onPhase = () => {}, connect = net.createConnection }) {
  if (!socketPath || !run) throw new Error("observation_socket_and_run_required");
  let socket, seq = 0, serverSeq = 0, ready = false, closed = false, failed = null, queue = [], queuedBytes = 0, buffer = Buffer.alloc(0);
  const fail = reason => { if (!failed && !closed) { failed = reason; onError({ reason }); } };
  const envelope = (event, fields) => ({ ...fields, v: 1, run, source, pid, seq: ++seq, event, mono_ns: fields.mono_ns ?? nowNs().toString() });
  const write = row => {
    const line = JSON.stringify(row) + "\n";
    if (Buffer.byteLength(line) > MAX_FRAME_BYTES || socket.writableLength + Buffer.byteLength(line) > MAX_QUEUE_BYTES) { fail("observation_queue_overflow"); return false; }
    socket.write(line); return true;
  };
  const sendReady = () => {
    write(envelope(source === "next_receipt" ? "next.ready" : source === "kernel" ? "kernel.ready" : "capture.ready", {}));
    const buffered = queue; queue = []; queuedBytes = 0;
    for (const row of buffered) { if (failed) break; write(envelope(row.event, row.fields)); }
  };
  const start = () => {
    if (socket || closed || failed) return;
    socket = connect(socketPath);
    socket.unref?.();
    socket.once("connect", () => write(envelope("observer.hello", {})));
    socket.on("error", () => fail("observation_socket_error"));
    socket.on("close", () => { if (!closed) fail("observation_disconnect"); });
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]); let end;
      while ((end = buffer.indexOf(10)) >= 0) {
        if (end > MAX_FRAME_BYTES) { fail("observation_frame_overflow"); return; }
        const frame = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
        let row; try { row = JSON.parse(frame.toString("utf8")); } catch { fail("observation_malformed_frame"); return; }
        if (row?.v !== 1 || row.run !== run || row.source !== "observer" || row.seq !== serverSeq + 1) { fail("observation_server_envelope_invalid"); return; }
        serverSeq = row.seq;
        if (row.event === "observer.ready" && !ready) { ready = true; sendReady(); }
        else if (row.event === "observer.phase" && ready) { onPhase(row); write(envelope("observer.phase.ack", { phase: row.phase, phase_id: row.phase_id })); }
        else if (row.event === "observer.goodbye") { write(envelope("observer.goodbye.ack", {})); closed = true; socket.end(); }
        else if (row.event === "observer.goodbye.ack") { closed = true; socket.end(); }
        else fail("observation_server_event_invalid");
      }
      if (buffer.length > MAX_FRAME_BYTES) fail("observation_frame_overflow");
    });
  };
  return {
    start,
    send(event, fields = {}) {
      if (failed || closed) return false;
      if (ready) return write(envelope(event, fields));
      const bytes = Buffer.byteLength(JSON.stringify({ event, fields }));
      if (bytes > MAX_FRAME_BYTES || queuedBytes + bytes > MAX_QUEUE_BYTES) { fail("observation_queue_overflow"); return false; }
      queue.push({ event, fields }); queuedBytes += bytes; start(); return true;
    },
    snapshot() { return { ready, failed, closed, queued_bytes: queuedBytes }; },
    close() { if (closed) return; if (ready && !failed) write(envelope("observer.goodbye", {})); closed = true; socket?.end(); },
  };
}
module.exports = { createObservationClient };
