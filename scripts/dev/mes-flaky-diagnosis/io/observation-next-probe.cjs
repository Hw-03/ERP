"use strict";
// Parent-dispatched tool probe: tiny real Next worker + fixed loopback response.
// It never imports MES pages, starts the product backend, or opens any database.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const core = require("./replay-core.cjs");
const { preparationWorkerEvidence, observationFence } = require("./replay-as.cjs");
const { createReceiptGuard, createObservationController } = require("./observation-controller.cjs");
const now = () => Number(process.hrtime.bigint()) / 1e6;
const check = (value, reason) => { if (!value) throw new Error(reason); };
const readRows = file => fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);

/** Require the actual child worker/socket and independent bidirectional headers. */
function auditProbeEvidence({ run, parentPid, launcherPid, request, dispatch, receipts, nodeRows, packets, channel, guard }) {
  check(channel.run === run && !channel.failure && !guard.stopped, "live_observation_failed");
  const auth = { request_id: request.request_id, method: request.method, path: request.actual_path,
    started_ms: request.driver_call_ms, completed_ms: request.body_complete_ms };
  const worker = preparationWorkerEvidence(receipts, nodeRows, auth);
  check(worker && worker.pid !== parentPid && worker.pid !== launcherPid, "actual_worker_preloads_unproven");
  const identity = nodeRows.find(row => row.event === "instrumentation.ready" && row.pid === worker.pid && row.run === run);
  check(identity?.ppid === launcherPid, "actual_worker_parent_unproven");
  const tuple = value => JSON.stringify(value);
  const forward = packets.filter(row => row.event === "tcp.packet" && row.data_len > 0 && tuple(row.local) === tuple(worker.local) && tuple(row.remote) === tuple(worker.remote));
  const reverse = packets.filter(row => row.event === "tcp.packet" && row.data_len > 0 && tuple(row.local) === tuple(worker.remote) && tuple(row.remote) === tuple(worker.local));
  check(forward.length && reverse.length, "bidirectional_packet_evidence_missing");
  const matched = core.matchReceipts([request], receipts.filter(row => row.event === "next.receipt"));
  const upstreams = core.matchUpstreams([request], receipts);
  const assessment = core.assess([request], [dispatch], matched, upstreams);
  check(assessment.status === "UNREPRODUCED", "request_timing_unqualified");
  return { worker, packet_directions: 2, forward_data_records: forward.length, reverse_data_records: reverse.length,
    qualification: assessment.status, matched_next_receipts: matched, matched_upstream_sockets: upstreams };
}

/** Wait for one explicit startup observation, without issuing readiness requests. */
function waitObservation(controller, predicate, label, timeoutMs = 5000) {
  const found = controller.snapshot().observations.find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); controller.events.removeListener("observation", observed); controller.events.removeListener("failure", failed); };
    const observed = row => { if (predicate(row)) { cleanup(); resolve(row); } };
    const failed = value => { cleanup(); reject(new Error(value.reason)); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(label)); }, timeoutMs);
    controller.events.on("observation", observed); controller.events.once("failure", failed);
  });
}

/** One ordinary Node request; retain status/byte count and its original handoff. */
function fixedRequest(requestId, onDispatch = () => {}) {
  return new Promise((resolve, reject) => {
    const request = http.request("http://127.0.0.1:3100/api/observation-probe", { method: "GET", headers: { "x-request-id": requestId } }, response => {
      let bodyBytes = 0;
      response.on("data", chunk => { bodyBytes += chunk.length; });
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode, body_bytes: bodyBytes, body_complete_ms: now(), request_id_echo_matches: response.headers["x-request-id"] === requestId }));
    });
    request.once("finish", () => { const socket = request.socket; onDispatch({ actual_ms: now(), local: [socket?.localAddress, socket?.localPort], remote: [socket?.remoteAddress, socket?.remotePort] }); });
    request.once("error", reject); request.end();
  });
}

/** Stop only this probe's child process group, after its evidence is preserved. */
async function stopOwned(child) {
  if (!child || !Number.isSafeInteger(child.pid) || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once("exit", resolve));
  try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") process.exitCode = 2; } }, 3000);
  await exited; clearTimeout(timer);
}

/** Parent alone executes this Linux probe; all ports and children must be fresh. */
async function main(args) {
  check(process.platform === "linux", "linux_probe_required");
  check(args.output && path.isAbsolute(args.output) && !fs.existsSync(args.output), "fresh_output_required");
  check(args.frontend && args.python, "frontend_and_python_required");
  const frontend = path.resolve(args.frontend), modules = path.join(frontend, "node_modules");
  const nextPackage = JSON.parse(fs.readFileSync(path.join(modules, "next/package.json"), "utf8"));
  check(nextPackage.version === "16.3.4", "installed_next_version_mismatch");
  check(process.version === "v20.20.2", "node_version_mismatch");
  fs.mkdirSync(args.output, { mode: 0o700 });
  const run = `next-probe-${randomUUID()}`, target = path.join(args.output, "observation.sock");
  // Linux sockaddr_un has a small path limit; fail before launching any child.
  check(Buffer.byteLength(target) < 104, "observation_socket_path_too_long");
  const files = { receipt: path.join(args.output, "next-receipts.jsonl"), node: path.join(args.output, "next-node.jsonl"), packet: path.join(args.output, "packets.jsonl") };
  for (const file of Object.values(files)) fs.writeFileSync(file, "", { flag: "wx", mode: 0o600 });
  const fixture = path.join(args.output, "tiny-next"); fs.mkdirSync(fixture); fs.mkdirSync(path.join(fixture, "pages"));
  fs.symlinkSync(modules, path.join(fixture, "node_modules"), "dir");
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "mes-observation-tool-probe", private: true, version: "1.0.0" }) + "\n");
  fs.writeFileSync(path.join(fixture, "pages/index.js"), "export default function Probe(){return <main>Observation tool probe</main>}\n");
  fs.writeFileSync(path.join(fixture, "next.config.js"), "module.exports={async rewrites(){return [{source:'/api/:path*',destination:'http://127.0.0.1:8021/api/:path*'}]}};\n");
  const events = [], children = [], logs = [];
  const record = (event, fields = {}) => events.push({ event, mono_ns: process.hrtime.bigint().toString(), ...fields });
  const guard = createReceiptGuard({ run, plannedIds: ["normal"], record });
  const controller = createObservationController({ socketPath: target, run, requiredSources: ["next_receipt", "packet"],
    onEvent: (row, ns) => { record(row.event, row); guard.observe(row, ns); }, onFailure: value => guard.stop(value.reason, undefined, value.detection_mono_ns) });
  const sources = ["observation-next-probe.cjs", "observation-controller.cjs", "observation-client.cjs", "replay-as.cjs", "replay-core.cjs", "replay-preload.cjs", "replay-receipt.cjs", "next-preload.cjs", "capture-ipv4-tcp.py"];
  const sourceHashes = Object.fromEntries(sources.map(name => [name, createHash("sha256").update(fs.readFileSync(path.join(__dirname, name))).digest("hex")]));
  fs.writeFileSync(path.join(args.output, "source-hashes.json"), JSON.stringify(sourceHashes, null, 2) + "\n");
  let fixed, next, capture, snapshot, request, dispatch;
  const logChild = (kind, executable, argv, env) => {
    const child = spawn(executable, argv, { env, detached: true, stdio: ["ignore", "pipe", "pipe"] }); children.push(child);
    child.on("error", error => record("child.error", { kind, type: error.name, code: error.code }));
    for (const [stream, suffix] of [[child.stdout, "stdout"], [child.stderr, "stderr"]]) {
      const output = fs.createWriteStream(path.join(args.output, `${kind}.${suffix}.log`), { mode: 0o600 }); logs.push(output); stream.pipe(output);
    }
    record("child.started", { kind, pid: child.pid }); return child;
  };
  try {
    await controller.listen();
    fixed = http.createServer((incoming, response) => {
      check(incoming.method === "GET" && incoming.url === "/api/observation-probe", "unexpected_tool_request");
      incoming.resume();
      record("fixed_backend.receipt", { method: incoming.method, path: incoming.url, request_id: incoming.headers["x-request-id"], local: [incoming.socket.localAddress, incoming.socket.localPort], remote: [incoming.socket.remoteAddress, incoming.socket.remotePort] });
      response.writeHead(200, { "Content-Type": "application/json", "X-Request-Id": incoming.headers["x-request-id"] ?? "" }); response.end('{"ok":true}');
    });
    await new Promise((resolve, reject) => { fixed.once("error", reject); fixed.listen(8021, "127.0.0.1", resolve); });
    const env = { ...process.env, IO_RUN_ID: run, IO_OBSERVATION_SOCKET: target, IO_REPLAY_RECEIPTS: files.receipt, IO_NODE_TRACE_FILE: files.node,
      IO_TRACE_TARGET_PORT: "8021", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `--require=${JSON.stringify(path.join(__dirname, "replay-preload.cjs"))}` };
    const packetReady = waitObservation(controller, row => row.source === "packet" && row.event === "capture.ready", "packet_startup_timeout");
    capture = logChild("packet", args.python, [path.join(__dirname, "capture-ipv4-tcp.py"), "--output", files.packet, "--port", "8021", "--interface", "lo"], { ...env, NODE_OPTIONS: "" });
    await packetReady;
    next = logChild("next", process.execPath, [path.join(modules, "next/dist/bin/next"), "dev", fixture, "--webpack", "-H", "127.0.0.1", "-p", "3100"], env);
    await new Promise((resolve, reject) => {
      let text = "";
      const cleanup = () => { clearTimeout(timer); next.stdout.removeListener("data", data); next.removeListener("exit", exited); next.removeListener("error", errored); };
      const data = chunk => { text = (text + chunk).slice(-8192); if (/Ready in|ready - started server/i.test(text)) { cleanup(); resolve(); } };
      const exited = () => { cleanup(); reject(new Error("next_exited_before_ready")); };
      const errored = () => { cleanup(); reject(new Error("next_start_failed")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("next_startup_timeout")); }, 60000);
      next.stdout.on("data", data); next.once("exit", exited); next.once("error", errored);
    });
    const prefix = `asdiag-probe-${randomUUID().slice(0, 8)}`;
    const warm = await fixedRequest(`${prefix}-warm`); check(warm.status === 200 && warm.request_id_echo_matches, "warm_fixed_response_failed");
    await controller.waitForReady(3000);
    await controller.phase("preparation", `preparation-${randomUUID()}`);
    await controller.phase("observation_start", `observation-start-${randomUUID()}`);
    const tick = now(); request = { id: "normal", request_id: `${prefix}-normal`, method: "GET", actual_path: "/api/observation-probe", deadline_ms: tick, driver_call_ms: tick };
    check(controller.isReady() && guard.register(request) && guard.beforeDispatch() && guard.markIssued(request.id), "normal_request_blocked");
    const outcome = await fixedRequest(request.request_id, value => { dispatch = { id: request.id, ...value }; record("client.dispatch", dispatch); });
    request.body_complete_ms = outcome.body_complete_ms;
    record("request.outcome", { id: request.id, ...outcome }); check(outcome.status === 200 && outcome.request_id_echo_matches, "normal_fixed_response_failed");
    await controller.phase("dispatch_stop", `dispatch-stop-${randomUUID()}`);
    const nodeFence = await observationFence(files.node, rows => Boolean(preparationWorkerEvidence(controller.snapshot().observations, rows,
      { request_id: request.request_id, method: request.method, path: request.actual_path, started_ms: request.driver_call_ms, completed_ms: request.body_complete_ms })));
    check(nodeFence.complete, "actual_worker_node_file_flush_incomplete");
    const receiptFence = await observationFence(files.receipt, rows => rows.some(row => row.event === "next.receipt" && row.request_id === request.request_id) && rows.some(row => row.event === "next.upstream.finish" && row.request_id === request.request_id));
    check(receiptFence.complete, "actual_worker_receipt_file_flush_incomplete");
    await controller.phase("preservation", `preservation-${randomUUID()}`);
    await controller.phase("cleanup", `cleanup-${randomUUID()}`);
    await controller.close();
    const receipts = readRows(files.receipt), nodeRows = readRows(files.node), packets = readRows(files.packet);
    const proof = auditProbeEvidence({ run, parentPid: process.pid, launcherPid: next.pid, request, dispatch, receipts, nodeRows, packets, channel: controller.snapshot(), guard: guard.snapshot() });
    snapshot = { status: "PASS", kind: "actual-next-worker-observation-tool-only", run, node: process.version, next: nextPackage.version,
      application_requests: 0, database_accesses: 0, fixed_response_requests: 2, next_mode: "development-webpack", production_next_proven: false,
      ...proof, guard: guard.snapshot(), channel: controller.snapshot(), request, dispatch, children: children.map(child => ({ pid: child.pid })), source_hashes: sourceHashes,
      limitations: ["Fixed-response tool fixture only; no original AS replay or business API", "Packet mono_ns is userspace drain time; kernel_wall_ns is separate and is not a TCP event monotonic timestamp", "Next development webpack mode only; no production or CI failure attribution"] };
  } catch (error) {
    try { await controller.phase("preservation", `failed-preservation-${randomUUID()}`); } catch { /* Preserve the first failure. */ }
    await controller.close();
    snapshot = { status: "FAIL", kind: "actual-next-worker-observation-tool-only", run, reason: /^[a-z_]+$/.test(error.message) ? error.message : "tool_error_redacted", error: { type: error.name, code: error.code },
      application_requests: 0, database_accesses: 0, guard: guard.snapshot(), channel: controller.snapshot(), source_hashes: sourceHashes };
    process.exitCode = 2;
  } finally {
    guard.dispose(); await controller.close();
    // Capture acknowledgements and all raw metadata before terminating owned Next.
    fs.writeFileSync(path.join(args.output, "probe-events.jsonl"), events.map(row => JSON.stringify(row)).join("\n") + "\n");
    fs.writeFileSync(path.join(args.output, "result.json"), JSON.stringify(snapshot, null, 2) + "\n");
    for (const child of [capture, next]) await stopOwned(child);
    if (fixed) { fixed.closeAllConnections(); await new Promise(resolve => fixed.close(resolve)); }
    for (const log of logs) log.end();
  }
  process.stdout.write(JSON.stringify({ status: snapshot.status, output: args.output, reason: snapshot.reason }) + "\n");
}
if (require.main === module) {
  const args = {}, values = process.argv.slice(2);
  for (let i = 0; i < values.length; i += 2) args[values[i].replace(/^--/, "")] = values[i + 1];
  main(args).catch(error => { process.stderr.write(JSON.stringify({ status: "FAIL", type: error.name, reason: /^[a-z_]+$/.test(error.message) ? error.message : "tool_error_redacted" }) + "\n"); process.exitCode = 2; });
}
module.exports = { auditProbeEvidence, waitObservation, fixedRequest, stopOwned, main };
