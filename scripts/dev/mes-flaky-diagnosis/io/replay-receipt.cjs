"use strict";
// Diagnostic-only server receipt observer; no request/Agent/timeout modifications.
const http = require("node:http");
const fs = require("node:fs");
const output = process.env.IO_REPLAY_RECEIPTS;
if (output) {
  const run = process.env.IO_RUN_ID;
  if (process.env.IO_OBSERVATION_SOCKET && !run) throw new Error("observation_run_required");
  const stream = fs.createWriteStream(output, { flags: "a" });
  let observerError = null;
  const client = process.env.IO_OBSERVATION_SOCKET ? require("./observation-client.cjs").createObservationClient({
    socketPath: process.env.IO_OBSERVATION_SOCKET, run, source: "next_receipt", pid: process.pid,
    onError: error => { observerError = { type: "ObservationTransportError", reason: error.reason }; },
  }) : null;
  const MAX_FILE_QUEUE_BYTES = 1024 * 1024;
  let buffer = [], bufferedBytes = 0, fileFailed = false, droppedRecords = 0, writingRecords = 0;
  const fileFailure = (reason, error, lost) => {
    if (!fileFailed) {
      fileFailed = true; observerError = { reason, type: error?.name ?? "ObservationFileError", code: error?.code };
      client?.send("capture.error", { observer_error: observerError });
    }
    if (lost > 0) {
      droppedRecords += lost;
      client?.send("capture.loss", { reason, userspace_record_loss: lost, receipt_record_loss: lost,
        cumulative_receipt_record_loss: droppedRecords, kernel_packet_drops: 0, bpf_event_loss: 0 });
    }
  };
  stream.on("error", error => fileFailure("receipt_file_write_error", error, writingRecords));
  const flush = () => {
    if (!buffer.length) return;
    const batch = buffer, bytes = bufferedBytes;
    buffer = []; bufferedBytes = 0;
    if ((stream.writableLength ?? 0) + bytes > MAX_FILE_QUEUE_BYTES) { fileFailure("receipt_file_queue_overflow", null, batch.length); return; }
    writingRecords += batch.length;
    try { stream.write(batch.join(""), error => { writingRecords -= batch.length; if (error) fileFailure("receipt_file_write_error", error, batch.length); }); }
    catch (error) { writingRecords -= batch.length; fileFailure("receipt_file_write_error", error, batch.length); }
  };
  let sequence = 0;
  const enqueue = value => {
    // File record_seq is independent from IPC seq, which also counts handshakes.
    const row = { v: 1, record_seq: ++sequence, ...value };
    client?.send(row.event, row);
    const line = JSON.stringify(row) + "\n", bytes = Buffer.byteLength(line);
    if (fileFailed || bufferedBytes + bytes + (stream.writableLength ?? 0) > MAX_FILE_QUEUE_BYTES) {
      fileFailure("receipt_file_queue_overflow", null, 1); return;
    }
    buffer.push(line); bufferedBytes += bytes;
  };
  setInterval(flush, 250).unref();
  process.on("beforeExit", () => { flush(); client?.close(); });
  process.on("exit", () => {
    if (buffer.length) {
      try { fs.appendFileSync(output, buffer.join("")); }
      catch (error) { fileFailure("receipt_file_exit_write_error", error, buffer.length); }
    }
  });
  const socketIds = new WeakMap();
  let socketSequence = 0;
  const socketId = socket => {
    if (!socket) return null;
    if (!socketIds.has(socket)) socketIds.set(socket, ++socketSequence);
    return socketIds.get(socket);
  };
  const emit = http.Server.prototype.emit;
  const safeRequestId = value => typeof value === "string" && /^asdiag-[a-zA-Z0-9-]{1,55}$/.test(value) ? value : null;
  http.Server.prototype.emit = function observedServerEmit(name, ...args) {
    const [request, response] = args;
    if (name === "request" && request?.socket?.localPort === 3100 && request.url?.startsWith("/api/")) {
      const socket = request.socket;
      const fields = { run: process.env.IO_RUN_ID, source: "next_receipt", pid: process.pid,
        method: request.method, path: request.url.split("?")[0], request_id: safeRequestId(request.headers["x-request-id"]), inbound_connection: socketId(socket),
        local: [socket.localAddress, socket.localPort], remote: [socket.remoteAddress, socket.remotePort] };
      const write = (event, extra = {}) => enqueue({ event, ...fields,
        mono_ns: process.hrtime.bigint().toString(), wall_ms: Date.now(), observer_error: observerError, ...extra });
      write("next.receipt");
      response.once("finish", () => write("next.response.finish", { status: response.statusCode }));
    }
    return Reflect.apply(emit, this, [name, ...args]);
  };
  // Existing Next rewrite forwards this standard correlation header. Observe it
  // on the original upstream ClientRequest/socket without changing the request.
  const originalRequest = http.request;
  http.request = function observedUpstream(...args) {
    const request = Reflect.apply(originalRequest, this, args);
    let port = args[0]?.port;
    if (typeof args[0] === "string" || args[0] instanceof URL) port = new URL(args[0]).port;
    if (Number(port) !== 8021) return request;
    const write = (event, extra = {}) => {
      const request_id = safeRequestId(String(request.getHeader("x-request-id") ?? ""));
      if (!request_id) return;
      const socket = request.socket;
      enqueue({ event, source: "next_receipt", run: process.env.IO_RUN_ID, pid: process.pid,
        mono_ns: process.hrtime.bigint().toString(), wall_ms: Date.now(), request_id, method: request.method,
        path: request.path?.split("?")[0], upstream_connection: socketId(socket), reusedSocket: request.reusedSocket,
        local: [socket?.localAddress, socket?.localPort], remote: [socket?.remoteAddress, socket?.remotePort],
        observer_error: observerError, ...extra });
    };
    request.once("socket", () => write("next.upstream.socket"));
    request.once("finish", () => write("next.upstream.finish"));
    request.once("error", error => write("next.upstream.error", { error: { type: error.name, code: error.code, errno: error.errno, syscall: error.syscall } }));
    request.once("response", response => response.once("end", () => write("next.upstream.response.end", { status: response.statusCode, complete: response.complete })));
    return request;
  };
}
