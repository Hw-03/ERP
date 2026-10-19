"use strict";

// Diagnostic-only preload. No request/response headers, body, query or error message.
// It observes the installed Agent without changing pooling, timers or retries.
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { monitorEventLoopDelay, performance } = require("node:perf_hooks");
const output = process.env.IO_NODE_TRACE_FILE;
const targetPort = Number(process.env.IO_TRACE_TARGET_PORT || "8021");
const run = process.env.IO_RUN_ID || "unset";
const sockets = new WeakMap();
let sequence = 0;
let eventSequence = 0;
let buffer = [];
let stream;
let observerError = null;

function event(name, fields = {}) {
  buffer.push(JSON.stringify({ event: name, source: "node", run, pid: process.pid,
    event_seq: ++eventSequence, wall_ms: Date.now(),
    mono_ns: process.hrtime.bigint().toString(), ...fields }) + "\n");
}

function flush() {
  if (!buffer.length || observerError) return;
  const batch = buffer.join("");
  buffer = [];
  stream.write(batch);
}

function frames(error) {
  // The first stack line contains the message and may contain application data.
  return typeof error?.stack === "string"
    ? error.stack.split("\n").slice(1).filter(line => /^\s+at /.test(line)).slice(0, 24) : [];
}

function errorInfo(error) {
  return error ? { type: error.name, code: error.code, errno: error.errno,
    syscall: error.syscall, frames: frames(error) } : null;
}

function socketState(socket) {
  const saved = sockets.get(socket);
  if (!saved) return {};
  if (socket.localPort) saved.local = [socket.localAddress, socket.localPort];
  if (socket.remotePort) saved.remote = [socket.remoteAddress, socket.remotePort];
  return { connection: saved.id, local: saved.local, remote: saved.remote,
    last_request: saved.lastRequest, last_completed_request: saved.lastCompleteRequest,
    last_complete_mono_ns: saved.lastCompleteMono?.toString(),
    destroyed: socket.destroyed, readableEnded: socket.readableEnded,
    writableEnded: socket.writableEnded, bytesRead: socket.bytesRead,
    bytesWritten: socket.bytesWritten };
}

function observeSocket(socket) {
  if (sockets.has(socket)) return;
  sockets.set(socket, { id: ++sequence });
  const originalEmit = socket.emit;
  const originalDestroy = socket.destroy;
  socket.destroy = function observedDestroy(...args) {
    event("socket.destroy.called", { ...socketState(this), error: errorInfo(args[0]),
      callsite: frames(new Error()).slice(1, 8) });
    return Reflect.apply(originalDestroy, this, args);
  };
  socket.emit = function observedEmit(name, ...args) {
    if (["connect", "ready", "end", "close", "error", "timeout", "free"].includes(name)) {
      event("socket." + name, { ...socketState(this),
        error: name === "error" ? errorInfo(args[0]) : undefined,
        hadError: name === "close" ? args[0] : undefined });
    }
    return Reflect.apply(originalEmit, this, [name, ...args]);
  };
  event("socket.observed", socketState(socket));
}

function observeResponse(response, requestId, request, requestFields) {
  const originalEmit = response.emit;
  const info = () => ({ ...requestFields(), status: response.statusCode,
    complete: response.complete, aborted: response.aborted,
    readableEnded: response.readableEnded });
  event("response.headers", info());
  response.emit = function observedEmit(name, ...args) {
    if (name === "end" && request.socket && sockets.has(request.socket)) {
      const saved = sockets.get(request.socket);
      saved.lastCompleteRequest = requestId;
      saved.lastCompleteMono = process.hrtime.bigint();
    }
    if (["end", "close", "aborted", "error"].includes(name)) {
      event("response." + name, { ...info(),
        error: name === "error" ? errorInfo(args[0]) : undefined });
    }
    return Reflect.apply(originalEmit, this, [name, ...args]);
  };
}

function wrap(module, scheme) {
  const original = module.request;
  module.request = function observedRequest(...args) {
    const request = Reflect.apply(original, this, args);
    const first = args[0];
    const second = args[1] && typeof args[1] === "object" ? args[1] : {};
    let port;
    if (typeof first === "string" || first instanceof URL) {
      try { port = Number(new URL(String(first)).port || (scheme === "https" ? 443 : 80)); }
      catch { port = Number(second.port || 0); }
    } else {
      port = Number(first?.port || second.port || (scheme === "https" ? 443 : 80));
    }
    if (port !== targetPort) return request;
    const requestId = ++sequence;
    const path = String(request.path || "").split("?")[0];
    const fields = () => ({ request: requestId, method: request.method, path,
      ...(request.socket ? socketState(request.socket) : {}),
      reusedSocket: request.reusedSocket, destroyed: request.destroyed,
      writableFinished: request.writableFinished });
    const originalEmit = request.emit;
    const originalDestroy = request.destroy;
    request.destroy = function observedDestroy(...destroyArgs) {
      event("request.destroy.called", { ...fields(), error: errorInfo(destroyArgs[0]),
        callsite: frames(new Error()).slice(1, 8) });
      return Reflect.apply(originalDestroy, this, destroyArgs);
    };
    request.emit = function observedEmit(name, ...eventArgs) {
      if (name === "socket") {
        observeSocket(eventArgs[0]);
        sockets.get(eventArgs[0]).lastRequest = requestId;
      }
      if (name === "response") observeResponse(eventArgs[0], requestId, request, fields);
      if (["socket", "finish", "response", "error", "close", "abort", "timeout"].includes(name)) {
        event("request." + name, { ...fields(),
          error: name === "error" ? errorInfo(eventArgs[0]) : undefined });
      }
      return Reflect.apply(originalEmit, this, [name, ...eventArgs]);
    };
    event("request.created", fields());
    return request;
  };
}

function processIdentity() {
  let startTicks = null;
  let bootId = null;
  if (process.platform === "linux") {
    try {
      const stat = fs.readFileSync("/proc/self/stat", "utf8");
      startTicks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
      bootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    } catch { /* External PID watcher reports inaccessible procfs separately. */ }
  }
  return { ppid: process.ppid, node: process.version, platform: process.platform,
    start_ticks: startTicks, boot_id: bootId, uptime_s: process.uptime() };
}

if (output) {
  stream = fs.createWriteStream(output, { flags: "a" });
  stream.on("error", error => { observerError = errorInfo(error); });
  wrap(http, "http");
  wrap(https, "https");
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let utilization = performance.eventLoopUtilization();
  const period = 100_000_000n;
  let expected = process.hrtime.bigint() + period;
  const sampler = setInterval(() => {
    const now = process.hrtime.bigint();
    const lag = now - expected;
    if (lag >= 50_000_000n) event("loop.lag", {
      expected_mono_ns: expected.toString(), observed_mono_ns: now.toString(),
      lag_ms: Number(lag) / 1e6 });
    expected = now + period;
  }, 100);
  sampler.unref();
  const heartbeat = setInterval(() => {
    const next = performance.eventLoopUtilization();
    const delta = performance.eventLoopUtilization(next, utilization);
    utilization = next;
    const monoBefore = process.hrtime.bigint();
    const wallMs = Date.now();
    const monoAfter = process.hrtime.bigint();
    event("process.heartbeat", { uptime_s: process.uptime(), rss_bytes: process.memoryUsage().rss,
      clock: { mono_before_ns: monoBefore.toString(), mono_after_ns: monoAfter.toString(), wall_ms: wallMs },
      loop: { mean_ms: Number.isFinite(histogram.mean) ? histogram.mean / 1e6 : null,
        max_ms: histogram.max / 1e6, p99_ms: histogram.percentile(99) / 1e6,
        utilization: delta.utilization, active_ms: delta.active, idle_ms: delta.idle },
      observer_error: observerError });
    histogram.reset();
  }, 1000);
  heartbeat.unref();
  const writer = setInterval(flush, 250);
  writer.unref();
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    event("process.uncaught", { origin, error: errorInfo(error) });
  });
  process.once("beforeExit", code => { event("process.beforeExit", { code }); flush(); });
  process.on("exit", code => {
    event("process.exit", { code, uptime_s: process.uptime(), observer_error: observerError });
    // Only the final remaining batch uses a synchronous write. No signal handler is installed.
    if (buffer.length) fs.appendFileSync(output, buffer.join(""));
  });
  event("instrumentation.ready", { ...processIdentity(), targetPort, flush_ms: 250 });
}
