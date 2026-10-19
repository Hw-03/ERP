"use strict";
/**
 * One original AS HTTP segment, never a retry loop. Preparation uses fresh real
 * APIs; only the same-origin blank document is fulfilled locally. No API mocks.
 * Run on Linux beside the real Next3100/backend8021 with the receipt preload.
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomUUID, createHash } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const core = require("./replay-core.cjs");
const { prepareBrowserTransport } = require("./browser-transport.cjs");
const { guardOwnedEnvironment, validateManifest } = require("./replay-guard.cjs");
const { createReceiptGuard, createObservationController } = require("./observation-controller.cjs");
const now = () => Number(process.hrtime.bigint()) / 1e6;

/** Observe normal APIRequestContext socket handoff without replacing its Agent. */
function observeApiDispatch(pending, record, stop) {
  const original = http.request;
  let observed = 0;
  http.request = function observedRequest(...args) {
    const request = Reflect.apply(original, this, args);
    let port = args[0]?.port;
    if (typeof args[0] === "string" || args[0] instanceof URL) port = new URL(args[0]).port;
    if (Number(port) === 3100) observed++;
    const rid = request.getHeader?.("x-request-id");
    const index = Number(port) === 3100 ? pending.findIndex(row => row.request_id === rid && row.method === request.method && row.actual_path === request.path?.split("?")[0]) : -1;
    if (index >= 0) {
      const [entry] = pending.splice(index, 1);
      record("api.request.created", { id: entry.id, request_id: rid, actual_ms: now(), deadline_ms: entry.deadline_ms });
      request.once("finish", () => {
        const actual_ms = now();
        const socket = request.socket;
        record("client.dispatch", { id: entry.id, request_id: rid, client: "api", evidence: "http.ClientRequest.finish_OS_handoff",
          actual_ms, deadline_ms: entry.deadline_ms, clock_uncertainty_ms: entry.deadline_uncertainty_ms ?? 0, reusedSocket: request.reusedSocket,
          local: [socket?.localAddress, socket?.localPort], remote: [socket?.remoteAddress, socket?.remotePort] });
        if (!core.dispatchGuard(entry.deadline_ms, actual_ms, entry.deadline_uncertainty_ms ?? 0).ok) stop("wire_deadline_missed", entry.id);
      });
    }
    return request;
  };
  const restore = () => { http.request = original; };
  restore.observedCount = () => observed;
  return restore;
}

/** Real fixture creation follows the source fixture's fields, never original IDs. */
async function prepareFixtures(api, manifest, state) {
  const admin = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
  for (const spec of manifest.fixtures) {
    const suffix = randomUUID().slice(0, 8);
    const data = core.resolve(spec.data, state);
    if (spec.kind === "employee") Object.assign(data, { employee_code: `DIAG-AS-${suffix}`, name: `DIAG-AS-${spec.id}-${suffix}` });
    else data.item_name = `DIAG-AS-${spec.id}-${suffix}`;
    const response = await api.post(spec.path, { headers: admin, data, maxRetries: 0 });
    if (!response.ok()) throw new Error("fixture_create_failed");
    state.fixture[spec.id] = await response.json();
  }
  for (const spec of manifest.fixture_followups) {
    const actualPath = core.resolve(spec.path_segments, state).join("/");
    const data = core.resolve(spec.data, state);
    const headers = actualPath.endsWith("/appearance") ? { "X-MES-Employee-Code": Object.values(state.fixture).find(row => actualPath.includes(row.employee_id))?.employee_code } : admin;
    const response = await api.fetch(actualPath, { method: spec.method, headers, ...(spec.method === "GET" ? {} : { data }), maxRetries: 0 });
    if (!response.ok()) throw new Error("fixture_followup_failed");
    await response.body();
  }
}

/** This document fetch uses Chromium's own connection pool, cookie jar and fetch. */
async function browserFetch(transport, request) {
  return transport.fetch(request);
}

/** Preserve an observed anchor failure even though its timeline cannot qualify.
 * @param {object} outcome
 * @param {{record(event: string, fields: object): void, freezeFailure(outcome: object): void, stop(reason: string, id: string): void}} hooks
 * @returns {void}
 */
function settleAnchor(outcome, { record, freezeFailure, stop }) {
  record("request.outcome", outcome);
  if (outcome.status === "REQUEST_FAILED" || outcome.http_status >= 400) freezeFailure(outcome);
  if (outcome.status !== "RESPONSE" || outcome.http_status !== 200) stop("anchor_not_complete_200", outcome.id);
}

/** Keep failed API bodies in a local artifact; expose only path/hash in JSON. */
function preserveFailureResponse(output, id, bytes) {
  if (!/^[ab]\d+$/.test(id)) throw new Error("invalid_failure_artifact_id");
  const target = path.join(output, `failure-${id}-response.body`);
  fs.writeFileSync(target, bytes, { flag: "wx" });
  return { path: target, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

/** All evidence is captured with both clients alive; failures stay explicit. */
async function captureBoundary(context, page, source, output) {
  const captures = {}, errors = [];
  for (const [kind, capture] of [
    ["screenshot", async () => { const target = path.join(output, "before-cleanup.png"); await page.screenshot({ path: target }); return { path: target }; }],
    ["trace", async () => { const target = path.join(output, "before-cleanup-trace.zip"); await context.tracing.stopChunk({ path: target }); return { path: target }; }],
    ["database", async () => {
      const target = path.join(output, "before-cleanup.db");
      const result = await promisify(execFile)(process.env.MES_DIAG_PYTHON ?? "python", [path.join(source, "scripts/dev/mes-flaky-diagnosis/snapshot-db.py"),
        "--source", source, "--output", target], { env: { ...process.env, MES_DIAG_OUTPUT: output } });
      return JSON.parse(result.stdout);
    }],
  ]) {
    try { captures[kind] = await capture(); }
    catch (error) { errors.push({ kind, error: { type: error.name, code: error.code } }); }
  }
  return { captures, capture_errors: errors };
}

/** Await a buffered observer fence, never delay/retry a scheduled business call. */
async function observationFence(file, ready) {
  return new Promise(resolve => {
    let watcher;
    const finish = result => { clearTimeout(timer); watcher?.close(); resolve(result); };
    const read = () => {
      try {
        const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
        if (ready(rows)) finish({ complete: true, rows });
      } catch { finish({ complete: false, rows: [] }); }
    };
    const timer = setTimeout(() => finish({ complete: false, rows: [] }), 1000);
    watcher = fs.watch(file, read);
    read();
  });
}

/**
 * Prove both preloads ran in the auth request's actual Next worker/socket.
 * @param {object[]} receipts
 * @param {object[]} nodeRows
 * @param {{request_id: string, method: string, path: string, started_ms: number, completed_ms: number}} auth
 * @returns {object|null}
 */
function preparationWorkerEvidence(receipts, nodeRows, auth) {
  const matches = row => row.request_id === auth.request_id && row.method === auth.method && row.path === auth.path &&
    Number(row.mono_ns) / 1e6 >= auth.started_ms && Number(row.mono_ns) / 1e6 <= auth.completed_ms;
  const inbound = receipts.filter(row => row.event === "next.receipt" && matches(row));
  const upstream = receipts.filter(row => row.event === "next.upstream.finish" && matches(row));
  if (inbound.length !== 1 || upstream.length !== 1 || inbound[0].pid !== upstream[0].pid || inbound[0].run !== upstream[0].run) return null;
  const wire = upstream[0];
  if (receipts.some(row => row.pid === wire.pid && row.observer_error) || nodeRows.some(row => row.pid === wire.pid && row.observer_error)) return null;
  const ready = nodeRows.filter(row => row.event === "instrumentation.ready" && row.pid === wire.pid && row.run === wire.run &&
    row.targetPort === 8021 && Number(row.mono_ns) <= Number(wire.mono_ns));
  const finished = nodeRows.filter(row => row.event === "request.finish" && row.pid === wire.pid && row.run === wire.run &&
    row.method === auth.method && row.path === auth.path && Number(row.mono_ns) / 1e6 >= auth.started_ms && Number(row.mono_ns) / 1e6 <= auth.completed_ms &&
    typeof row.local?.[0] === "string" && row.local[1] > 0 && row.remote?.[1] === 8021 &&
    JSON.stringify(row.local) === JSON.stringify(wire.local) && JSON.stringify(row.remote) === JSON.stringify(wire.remote));
  if (ready.length !== 1 || finished.length !== 1) return null;
  return { pid: wire.pid, run: wire.run, node_request: finished[0].request, node_connection: finished[0].connection, local: wire.local, remote: wire.remote };
}

/**
 * Read both browser clocks on the same CDP session; log samples before gating.
 * @param {{send(method: string, params?: object): Promise<object>}} cdp
 * @param {(event: string, fields: object) => void} record
 * @param {() => number} clock
 * @returns {Promise<{cdpToDriverMs: number, pageToDriverMs: number, cdpBracketMs: number, pageBracketMs: number}>}
 */
async function calibrateClock(cdp, record, clock = now) {
  const limitMs = 10;
  await cdp.send("Performance.enable");
  const cdpBefore = clock();
  const metrics = await cdp.send("Performance.getMetrics");
  const cdpAfter = clock();
  const cdpTimestamp = metrics.metrics.find(row => row.name === "Timestamp")?.value;
  const cdpBracketMs = cdpAfter - cdpBefore;
  const cdpAccepted = Number.isFinite(cdpTimestamp) && cdpBracketMs >= 0 && cdpBracketMs <= limitMs;
  record("clock.cdp.sample", { method: "Performance.getMetrics", driver_before_ms: cdpBefore, driver_after_ms: cdpAfter,
    raw_timestamp_s: cdpTimestamp ?? null, bracket_ms: cdpBracketMs, limit_ms: limitMs, accepted: cdpAccepted });
  if (!cdpAccepted) throw new Error("cdp_clock_uncertainty_before_segment");
  const cdpToDriverMs = (cdpBefore + cdpAfter) / 2 - cdpTimestamp * 1000;
  const pageBefore = clock();
  const evaluated = await cdp.send("Runtime.evaluate", { expression: "performance.now()", returnByValue: true });
  const pageAfter = clock();
  const pageTimestamp = evaluated.result?.value;
  const pageBracketMs = pageAfter - pageBefore;
  const pageAccepted = evaluated.result?.type === "number" && !evaluated.exceptionDetails && Number.isFinite(pageTimestamp) &&
    pageBracketMs >= 0 && pageBracketMs <= limitMs;
  record("clock.page.sample", { method: "Runtime.evaluate", expression: "performance.now()", driver_before_ms: pageBefore, driver_after_ms: pageAfter,
    raw_timestamp_ms: pageTimestamp ?? null, returned_type: evaluated.result?.type ?? null, exception_present: Boolean(evaluated.exceptionDetails),
    bracket_ms: pageBracketMs, limit_ms: limitMs, accepted: Boolean(pageAccepted) });
  if (!pageAccepted) throw new Error("page_clock_uncertainty_before_segment");
  return { cdpToDriverMs, pageToDriverMs: (pageBefore + pageAfter) / 2 - pageTimestamp, cdpBracketMs, pageBracketMs };
}

/** Request the first stop boundary immediately without delaying any schedule. */
function createStopPhaseLatch(observation, record) {
  let pending = null, result = null;
  return {
    notify() {
      if (pending) return pending;
      if (observation.snapshot?.()?.closing) {
        result = { status: "NOT_APPLICABLE", phase: "dispatch_stop", reason: "observation_channel_shutdown" };
        record("observer.stop_phase.not_applicable", result);
        pending = Promise.resolve(); return pending;
      }
      const phaseId = `dispatch-stop-${randomUUID()}`;
      result = { status: "PENDING", phase: "dispatch_stop", phase_id: phaseId };
      record("observer.stop_phase.requested", result);
      pending = observation.phase("dispatch_stop", phaseId).then(() => {
        result = { ...result, status: "ACKNOWLEDGED" }; record("observer.stop_phase.ack", result);
      }, error => {
        result = { ...result, status: "FAILED", reason: /^[a-z_]+$/.test(error.message) ? error.message : "observer_phase_error" };
        record("observer.stop_phase.failed", result);
      });
      return pending;
    },
    settle() { return pending ?? Promise.resolve(); },
    snapshot() { return result; },
  };
}

async function main(args) {
  if (process.platform !== "linux") throw new Error("linux_clock_domain_required");
  const ownership = guardOwnedEnvironment();
  const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  validateManifest(manifest);
  if (!process.env.IO_RUN_ID) throw new Error("observation_run_required");
  if (!process.env.IO_OBSERVATION_SOCKET) throw new Error("observation_socket_required");
  if (!args.receipts || !fs.existsSync(args.receipts)) throw new Error("next_receipt_observer_required_before_preparation");
  fs.mkdirSync(args.output, { recursive: true });
  const marker = path.join(args.output, "segment-started.json");
  if (fs.existsSync(marker)) throw new Error("single_segment_already_started");
  const events = [];
  const record = (event, values = {}) => { events.push({ event, source: "replay_driver", mono_ns: process.hrtime.bigint().toString(), wall_ms: Date.now(), ...values }); };
  let stopped = null, firstFailure = null;
  const stopHistory = [];
  const stop = (reason, id, kind = "condition", details = {}) => {
    const detected = process.hrtime.bigint().toString();
    const value = { reason, id, kind, first_violation_mono_ns: details.first_violation_mono_ns ?? detected,
      detection_mono_ns: details.detection_mono_ns ?? detected, stop_mono_ns: details.stop_mono_ns ?? detected };
    stopHistory.push(value);
    if (!stopped) {
      stopped = value; record(kind === "condition" ? "segment.condition_not_met" : "segment.stop_after_failure", stopped);
      if (started) stopPhases.notify();
    } else record("segment.later_stop", value);
  };
  const receiptGuard = createReceiptGuard({ run: process.env.IO_RUN_ID, plannedIds: manifest.requests.map(row => row.id), record,
    onStop: value => stop(value.reason, value.id, "condition", value) });
  const live = createObservationController({ socketPath: process.env.IO_OBSERVATION_SOCKET, run: process.env.IO_RUN_ID,
    requiredSources: ["next_receipt", "packet", "kernel"],
    onEvent: (row, receivedNs) => { record(row.event, row); receiptGuard.observe(row, receivedNs); },
    onFailure: value => receiptGuard.stop(value.reason, undefined, value.detection_mono_ns) });
  const stopPhases = createStopPhaseLatch(live, record);
  const beforeDispatch = () => {
    if (stopped) return false;
    if (!live.isReady()) { receiptGuard.stop("observation_not_ready"); return false; }
    return receiptGuard.beforeDispatch();
  };
  const preservationPhase = async phase => {
    try { await live.phase(phase, `${phase}-${randomUUID()}`); }
    catch { stop("observer_preservation_phase_failed"); }
  };
  const freezeFailure = outcome => {
    if (firstFailure) return;
    firstFailure = { ...outcome, observed_mono_ns: process.hrtime.bigint().toString(), observed_wall_ms: Date.now(),
      original_response_evidence: outcome.failure_response_artifact?.path ?? (outcome.client === "browser" ? "before-cleanup-trace.zip" : null),
      socket_evidence: "Next upstream/kernel observers; original CI attribution remains separate" };
    record("first.failure", firstFailure);
    stop("first_request_failure", outcome.id, "observed_failure");
  };
  const apiPending = [], browserPending = [], issued = [], outcomes = [];
  const restoreApiObserver = observeApiDispatch(apiPending, record, stop);
  const { chromium, request, devices } = require(args.playwright ?? path.resolve(__dirname, "../../../../frontend/node_modules/@playwright/test"));
  let api, browser, context, page, browserTransport;
  let started = false, captured = null;
  const state = { fixture: {}, responses: {}, auth: {}, fresh: { client_request_id: randomUUID(), audit_session: randomUUID(),
    terminal_id: randomUUID(), memo: `DIAG-AS synthetic ${randomUUID()}`, trace_prefix: `asdiag-${randomUUID().slice(0, 8)}` } };
  try {
    record("preparation.ownership.verified", ownership);
    await live.listen();
    record("preparation.observation_socket.listening", { run: process.env.IO_RUN_ID, required_sources: ["next_receipt", "packet", "kernel"] });
    if (!process.env.IO_NODE_TRACE_FILE || !fs.existsSync(process.env.IO_NODE_TRACE_FILE)) throw new Error("node_trace_observer_required_before_preparation");
    api = await request.newContext({ baseURL: manifest.origin, userAgent: devices["Desktop Chrome"].userAgent });
    browser = await chromium.launch({ executablePath: process.env.MES_DIAG_CHROMIUM });
    context = await browser.newContext({ ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
    page = await context.newPage();
    const documentUrl = manifest.origin + "/__mes-as-replay-document";
    await page.route(documentUrl, route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>AS request diagnostic</title>" }));
    await page.goto(documentUrl);
    await prepareFixtures(api, manifest, state);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    let authWireCount = 0;
    const authPath = `/api/employees/${state.fixture.requester.employee_id}/verify-pin`;
    const authWire = event => { if (new URL(event.request.url).pathname === authPath) authWireCount++; };
    cdp.on("Network.requestWillBeSent", authWire);
    const authStartedMs = now();
    // Real PIN exchange supplies the browser cookie and operator-session bearer.
    const authResult = await page.evaluate(async input => {
      const response = await fetch(`/api/employees/${input.employeeId}/verify-pin`, { method: "POST", headers: { "Content-Type": "application/json", "x-request-id": input.requestId },
        body: JSON.stringify({ pin: input.pin, tab_id: input.tab }) });
      if (!response.ok) throw new Error("synthetic_actor_auth_failed");
      return { data: await response.json(), request_id_echo_matches: response.headers.get("X-Request-Id") === input.requestId };
    }, { employeeId: state.fixture.requester.employee_id, pin: process.env.E2E_ADMIN_PIN ?? "0000", tab: randomUUID(), requestId: `${state.fresh.trace_prefix}-preparation` });
    state.auth = authResult.data;
    const authCompletedMs = now();
    if (!authResult.request_id_echo_matches) throw new Error("request_id_passthrough_not_verified_before_segment");
    cdp.removeListener("Network.requestWillBeSent", authWire);
    if (authWireCount !== 1 || restoreApiObserver.observedCount() === 0) throw new Error("client_dispatch_observer_not_verified_before_segment");
    const authObservation = await observationFence(args.receipts, rows => rows.some(row => row.event === "next.receipt" && row.request_id === `${state.fresh.trace_prefix}-preparation`) &&
      core.matchUpstreams([{ request_id: `${state.fresh.trace_prefix}-preparation`, method: "POST", actual_path: authPath, driver_call_ms: authStartedMs }], rows).length === 1);
    if (!authObservation.complete || !authObservation.rows.some(row => row.event === "next.receipt" && row.method === "POST" && row.path === authPath && Number(row.mono_ns) / 1e6 >= authStartedMs && !row.observer_error))
      throw new Error("next_receipt_observer_not_verified_before_segment");
    const authMetadata = { request_id: `${state.fresh.trace_prefix}-preparation`, method: "POST", path: authPath, started_ms: authStartedMs, completed_ms: authCompletedMs };
    const nodeObservation = await observationFence(process.env.IO_NODE_TRACE_FILE, rows => Boolean(preparationWorkerEvidence(authObservation.rows, rows, authMetadata)));
    const workerEvidence = nodeObservation.complete && preparationWorkerEvidence(authObservation.rows, nodeObservation.rows, authMetadata);
    if (!workerEvidence) throw new Error("actual_next_worker_instrumentation_not_verified_before_segment");
    await live.waitForReady();
    if (!live.snapshot().producers.some(row => row.source === "next_receipt" && row.pid === workerEvidence.pid && row.ready))
      throw new Error("actual_next_worker_realtime_not_ready");
    record("preparation.observers.verified", { browser_auth_dispatches: authWireCount, api_target_observed: restoreApiObserver.observedCount(), actual_worker: workerEvidence });
    browserTransport = await prepareBrowserTransport(cdp);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    await context.tracing.startChunk({ name: "as-http-segment" });
    const { cdpToDriverMs, pageToDriverMs, cdpBracketMs, pageBracketMs } = await calibrateClock(cdp, record);
    record("clock.calibration", { cdp_to_driver_ms: cdpToDriverMs, cdp_bracket_ms: cdpBracketMs,
      page_to_driver_ms: pageToDriverMs, page_bracket_ms: pageBracketMs });
    cdp.on("Network.requestWillBeSent", event => {
      const parsed = new URL(event.request.url);
      if (parsed.origin !== manifest.origin || !parsed.pathname.startsWith("/api/")) return;
      const requestId = Object.entries(event.request.headers).find(([key]) => key.toLowerCase() === "x-request-id")?.[1];
      const index = browserPending.findIndex(entry => entry.request_id === requestId && entry.method === event.request.method && entry.actual_path === parsed.pathname);
      if (index < 0) { stop("unmatched_browser_dispatch"); return; }
      const [entry] = browserPending.splice(index, 1);
      const actual_ms = event.timestamp * 1000 + cdpToDriverMs;
      const clock_uncertainty_ms = cdpBracketMs / 2 + (entry.deadline_uncertainty_ms ?? 0);
      record("client.dispatch", { id: entry.id, request_id: requestId, client: "browser", evidence: "CDP.Network.requestWillBeSent", actual_ms, clock_uncertainty_ms,
        cdp_timestamp_s: event.timestamp, cdp_wall_s: event.wallTime, cdp_request_id: event.requestId, deadline_ms: entry.deadline_ms });
      if (!core.dispatchGuard(entry.deadline_ms, actual_ms, clock_uncertainty_ms).ok) stop("wire_deadline_missed", entry.id);
    });
    const transport = async (spec, timing) => {
      if (!beforeDispatch()) return { skipped: true };
      const actual_path = Array.isArray(spec.path) ? spec.path.join("") : spec.path;
      const request_id = `${state.fresh.trace_prefix}-${spec.id}`;
      const headers = { ...spec.headers, "x-request-id": request_id };
      const metadata = { id: spec.id, request_id, method: spec.method, actual_path, ...timing,
        deadline_uncertainty_ms: spec.phase === "after_anchor_body" ? pageBracketMs / 2 : 0 };
      if (!receiptGuard.register(metadata)) return { skipped: true };
      let response;
      if (spec.client === "browser") {
        if (!beforeDispatch() || !receiptGuard.markIssued(spec.id)) return { skipped: true };
        issued.push(metadata);
        browserPending.push(metadata);
        record("driver.call", { ...metadata, client: spec.client });
        response = await browserFetch(browserTransport, { ...spec, headers, path: actual_path });
        response.body_complete_ms = response.body_complete_browser_ms + pageToDriverMs;
      } else {
        const query = new URLSearchParams(spec.query ?? {}).toString();
        if (!beforeDispatch() || !receiptGuard.markIssued(spec.id)) return { skipped: true };
        issued.push(metadata);
        apiPending.push(metadata);
        record("driver.call", { ...metadata, client: spec.client });
        const raw = await api.fetch(actual_path + (query ? `?${query}` : ""), {
          method: spec.method, headers, ...(spec.data === undefined ? {} : { data: spec.data }), maxRetries: 0,
        });
        const bytes = await raw.body();
        response = { http_status: raw.status(), body_bytes: bytes.length, body_complete_ms: now(), request_id_echo_matches: raw.headers()["x-request-id"] === request_id };
        if (response.http_status >= 400) {
          try { response.failure_response_artifact = preserveFailureResponse(args.output, spec.id, bytes); }
          catch (error) { response.failure_capture_error = { type: error.name, code: error.code }; stop("failure_response_capture_failed", spec.id); }
        }
      }
      metadata.body_complete_ms = response.body_complete_ms;
      if (response.data) state.responses[spec.id] = response.data;
      const { data, ...safe } = response;
      record("response.body.complete", { id: spec.id, ...safe });
      if (response.http_status >= 400) freezeFailure({ id: spec.id, client: spec.client, ...safe });
      if (response.http_status < 400 && !response.request_id_echo_matches) stop("successful_response_request_id_echo_missing", spec.id);
      if (!events.some(row => row.event === "client.dispatch" && row.id === spec.id)) stop("dispatch_evidence_missing", spec.id);
      return safe;
    };
    const scheduled = [];
    const schedule = (spec, deadlineMs) => {
      const result = new Promise(resolve => {
        setTimeout(async () => {
          if (!beforeDispatch()) { resolve({ id: spec.id, status: "SKIPPED_AFTER_STOP" }); return; }
          if (spec.phase === "after_anchor_body" && !core.prefixReady(manifest.requests.filter(row => row.phase === "anchor_overlap").map(row => row.id),
              events.filter(row => row.event === "client.dispatch"))) {
            const outcome = { id: spec.id, status: "CONDITION_NOT_MET", reason: "anchor_overlap_not_dispatched_before_post_anchor", deadline_ms: deadlineMs, driver_call_ms: now() };
            outcomes.push(outcome); record("request.outcome", outcome); stop(outcome.reason, spec.id); resolve(outcome); return;
          }
          const outcome = await core.issue(spec, deadlineMs, state, now, transport, beforeDispatch);
          outcomes.push(outcome);
          if (outcome.status === "CONDITION_NOT_MET") stop(outcome.reason, spec.id);
          if (outcome.status === "REQUEST_FAILED") freezeFailure(outcome);
          record("request.outcome", outcome);
          resolve(outcome);
        }, Math.max(0, deadlineMs - now()));
      });
      scheduled.push(result);
      return result;
    };
    const anchor = manifest.requests.find(row => row.id === manifest.anchor.id);
    if (!anchor) throw new Error("anchor_missing_from_manifest");
    await live.phase("segment", `segment-${randomUUID()}`);
    if (!beforeDispatch()) throw new Error("observation_failed_before_segment");
    const startMs = now();
    // Atomic single-run marker is written before the first business request.
    fs.writeFileSync(marker, JSON.stringify({ wall_ms: Date.now(), mono_ms: startMs, max_dispatch_error_ms: 20 }) + "\n", { flag: "wx" });
    started = true;
    record("segment.started", { max_dispatch_error_ms: 20, differences: manifest.differences });
    for (const spec of manifest.requests.filter(row => row.phase === "anchor_overlap" && row.id !== anchor.id)) schedule(spec, startMs + spec.offset_from_start_ms);
    const anchorResult = await core.issue(anchor, startMs, state, now, transport, beforeDispatch);
    outcomes.push(anchorResult);
    settleAnchor({ ...anchorResult, client: anchor.client }, { record, freezeFailure, stop });
    if (!stopped) for (const spec of manifest.requests.filter(row => row.phase === "after_anchor_body")) schedule(spec, core.deadline(anchorResult.body_complete_ms, spec.offset_ms));
    // Already-dispatched operations settle normally; nothing is aborted at a miss.
    await Promise.all(scheduled);
    await stopPhases.settle();
    // Phase fences inspect collector health between segments, never between calls.
    await preservationPhase("before_capture");
    captured = await captureBoundary(context, page, ownership.source, args.output);
    if (captured.capture_errors.length) stop("before_cleanup_capture_failed");
    await preservationPhase("after_capture");
    await stopPhases.settle();
    await live.close(); // Final collector drain and acknowledgements precede qualification.
    const fence = await observationFence(args.receipts, rows => core.matchReceipts(issued, rows.filter(row => row.event === "next.receipt")).length === issued.length &&
      core.matchUpstreams(issued, rows).length === issued.length);
    if (!fence.complete) stop("observer_flush_or_socket_evidence_incomplete");
    const receiptText = fs.readFileSync(args.receipts, "utf8");
    const receipts = [], observations = [];
    for (const line of receiptText.split("\n").filter(Boolean)) {
      try { const row = JSON.parse(line); observations.push(row); if (row.observer_error) stop("next_receipt_observer_error"); if (row.event === "next.receipt") receipts.push(row); }
      catch { stop("receipt_file_incomplete"); }
    }
    const matched = core.matchReceipts(issued, receipts);
    const upstreams = core.matchUpstreams(issued, observations);
    const expected = issued.map(row => ({ id: row.id, deadline_ms: row.deadline_ms, deadline_uncertainty_ms: row.deadline_uncertainty_ms }));
    const assessment = core.finalizeAssessment(core.assess(expected, events.filter(row => row.event === "client.dispatch"), matched, upstreams),
      { conditionStopped: stopHistory.some(row => row.kind === "condition"), firstFailure: Boolean(firstFailure), issued: issued.length, planned: manifest.requests.length });
    const qualification = assessment.qualification;
    const failures = outcomes.filter(row => row.status === "REQUEST_FAILED" || row.http_status >= 400);
    record("before.cleanup", { browser_context_alive: !page.isClosed(), api_context_disposed: false,
      issued: issued.length, planned: manifest.requests.length, stopped, status: assessment.status });
    fs.writeFileSync(path.join(args.output, "replay-events.jsonl"), events.map(row => JSON.stringify(row)).join("\n") + "\n");
    fs.writeFileSync(path.join(args.output, "before-cleanup.json"), JSON.stringify({ ...assessment, qualification, first_failure: firstFailure,
      segment_completion: firstFailure ? "STOPPED_AT_FIRST_FAILURE" : issued.length === manifest.requests.length ? "COMPLETE" : "INCOMPLETE",
      stopped, stop_history: stopHistory, live_observation: { stop_phase: stopPhases.snapshot(), receipt_guard: receiptGuard.snapshot(), channel: live.snapshot() },
      issued, unissued_request_ids: manifest.requests.filter(row => !issued.some(value => value.id === row.id)).map(row => row.id),
      planned_request_ids: manifest.requests.map(row => row.id), outcomes, matched_next_receipts: matched, matched_upstream_sockets: upstreams,
      synthetic_fixture: Object.fromEntries(Object.entries(state.fixture).map(([key, value]) => [key, { employee_id: value.employee_id, item_id: value.item_id }])),
      client_request_id: state.fresh.client_request_id, ...captured, browser_context_alive: !page.isClosed(), api_context_disposed: false,
      differences: manifest.differences, original_ci_attribution: "Separate socket 4-tuple/lifetime/read ECONNRESET errno -104 evidence is required; teardown resets do not qualify." }, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ status: assessment.status, requests: issued.length, failures: failures.length, output: args.output }) + "\n");
    process.exitCode = assessment.status === "CONDITION_NOT_MET" ? 2 : 0;
  } catch (error) {
    record(started ? "segment.tool_error" : "preparation.tool_error", { error: { type: error.name, code: error.code } });
    if (started && !captured) captured = await captureBoundary(context, page, ownership.source, args.output);
    await live.close();
    const snapshot = { status: started ? "CONDITION_NOT_MET" : "PREPARATION_FAILED",
      error: { type: error.name, code: error.code }, reason: /^[a-z_]+$/.test(error.message) ? error.message : "tool_error_message_redacted",
      browser_context_alive: page ? !page.isClosed() : false, api_context_disposed: !api, first_failure: firstFailure,
      stopped, stop_history: stopHistory, live_observation: { stop_phase: stopPhases.snapshot(), receipt_guard: receiptGuard.snapshot(), channel: live.snapshot() }, ...captured, events };
    fs.writeFileSync(path.join(args.output, "tool-error.json"), JSON.stringify(snapshot, null, 2) + "\n");
    if (started) fs.writeFileSync(path.join(args.output, "before-cleanup.json"), JSON.stringify(snapshot, null, 2) + "\n");
    process.exitCode = 2;
  } finally {
    // Teardown happens strictly after the before-cleanup snapshot; fixtures remain
    // for the parent to inspect. No cancellation, approval or server control here.
    receiptGuard.dispose();
    await live.close();
    browserTransport?.dispose();
    await context?.close();
    await browser?.close();
    await api?.dispose();
    restoreApiObserver();
  }
}

if (require.main === module) {
  const values = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < values.length; i += 2) args[values[i].replace(/^--/, "")] = values[i + 1];
  if (!args.manifest || !args.output) {
    process.stderr.write("usage: node replay-as.cjs --manifest FILE --output DIR --receipts NEXT_JSONL [--playwright MODULE]\n");
    process.exitCode = 2;
  } else main(args).catch(error => { process.stderr.write(`${error.name}: ${/^[a-z_]+$/.test(error.message) ? error.message : "tool_error_redacted"}\n`); process.exitCode = 2; });
}
module.exports = { prepareFixtures, browserFetch, settleAnchor, observeApiDispatch, preserveFailureResponse, captureBoundary, observationFence, preparationWorkerEvidence, calibrateClock, createStopPhaseLatch, main };
