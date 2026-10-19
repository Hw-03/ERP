"use strict";
// Parent-only, one-shot tool probe: blank document + private loopback echo server.
// No MES routes, fixtures, database, Agent, retries or application servers.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomUUID, createHash } = require("node:crypto");
const { prepareBrowserTransport } = require("./browser-transport.cjs");
const core = require("./replay-core.cjs");

/** @param {boolean} accepted @param {string} reason @returns {void} */
function requireProbe(accepted, reason) { if (!accepted) throw new Error(`probe_${reason}`); }

/** Audit action metadata separately from the protected raw HAR/resources.
 * @param {string} oldText @param {string} newText @param {string[]} canaries
 * @returns {object}
 */
function auditTraceSurface(oldText, newText, canaries) {
  requireProbe(!canaries.some(value => oldText.includes(value) || newText.includes(value)), "canary_in_context_trace");
  const rows = text => text.split("\n").filter(Boolean).map(JSON.parse);
  const before = rows(oldText), after = rows(newText);
  const oldBefore = before.filter(row => row.type === "before" && row.class === "Frame" && row.method === "evaluateExpression" && row.beforeSnapshot);
  const oldFrames = before.filter(row => row.type === "frame-snapshot" && oldBefore.some(call => row.snapshot?.snapshotName === call.beforeSnapshot));
  const newBefore = after.filter(row => row.type === "before");
  requireProbe(oldBefore.length === 1 && oldFrames.length >= 1, "old_snapshot_evidence_missing");
  requireProbe(newBefore.length === 0 && !after.some(row => row.beforeSnapshot), "new_context_action_or_snapshot");
  return { old_before_snapshots: oldBefore.length, old_before_frames: oldFrames.length, new_before_actions: newBefore.length,
    new_before_snapshots: 0, canary_trace_copies: 0 };
}

/** Read trace members in memory without extracting or printing their raw data.
 * @param {Function} ZipFile @param {string} file @returns {Promise<Map<string, Buffer>>}
 */
async function readTrace(ZipFile, file) {
  const archive = new ZipFile(file);
  try { return new Map(await Promise.all((await archive.entries()).map(async name => [name, await archive.read(name)]))); }
  finally { archive.close(); }
}

/** Verify one exact request and its complete status/body survived HAR capture.
 * @param {Map<string, Buffer>} entries @param {string} origin @param {object} expected @returns {object}
 */
function auditNetwork(entries, origin, expected) {
  const rows = entries.get("trace.network").toString("utf8").split("\n").filter(Boolean).map(JSON.parse);
  const snapshots = rows.filter(row => row.type === "resource-snapshot" && row.snapshot.request.url === origin + expected.target);
  requireProbe(snapshots.length === 1, "network_request_count");
  const { request, response } = snapshots[0].snapshot;
  const headers = Object.fromEntries(request.headers.map(row => [row.name.toLowerCase(), row.value]));
  const requestBody = request.postData ? request.postData._sha1 ? entries.get(`resources/${request.postData._sha1}`)?.toString("utf8") : request.postData.text : "";
  const responseBody = entries.get(`resources/${response.content._sha1}`);
  requireProbe(request.method === expected.method && headers["x-request-id"] === expected.requestId, "network_request_metadata");
  requireProbe(requestBody === expected.body && headers.cookie?.includes("transport_probe=cookie"), "network_request_body_or_cookie");
  if (expected.authorization) requireProbe(headers.authorization === expected.authorization, "network_authorization_missing");
  requireProbe(response.status === expected.status && responseBody?.equals(expected.responseBody), "network_response_incomplete");
  return { request_count: snapshots.length, status: response.status, response_bytes: responseBody.length, exact_request_body: true, exact_response_body: true };
}

/** Run once only when dispatched by the parent; errors never print payloads.
 * @param {{output: string, playwright?: string, chromium?: string, port?: string}} args @returns {Promise<void>}
 */
async function main(args) {
  requireProbe(Boolean(args.output) && !fs.existsSync(args.output), "fresh_output_required");
  requireProbe(!process.env.DEBUG && !process.env.PWDEBUG, "debug_logging_disabled_required");
  fs.mkdirSync(args.output, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(args.output, "probe-started.json"), JSON.stringify({ started_ms: Date.now(), kind: "transport-tool-only", application_requests: 0 }) + "\n", { flag: "wx", mode: 0o600 });
  const pin = `PIN-${randomUUID()}`, bearer = `BEARER-${randomUUID()}`;
  const canaries = [pin, bearer];
  const received = [];
  const server = http.createServer(async (request, response) => {
    if (request.url === "/document") {
      response.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": "transport_probe=cookie; SameSite=Lax" });
      response.end("<!doctype html><title>Transport tool probe</title>"); return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString("utf8");
    const status = request.url.includes("status=503") ? 503 : request.method === "POST" ? 201 : 200;
    const responseBody = Buffer.from(request.url.includes("invalid=1") ? "invalid-json" : JSON.stringify({ echoed: body, bearer: request.headers.authorization ?? null }));
    received.push({ target: request.url, method: request.method, requestId: request.headers["x-request-id"], authorization: request.headers.authorization, body, status, responseBody });
    response.writeHead(status, { "Content-Type": "application/json", "X-Request-Id": request.headers["x-request-id"] ?? "" });
    response.end(responseBody);
  });
  let browser, context, transport;
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(Number(args.port ?? 0), "127.0.0.1", resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const playwright = require(args.playwright ?? path.resolve(__dirname, "../../../../frontend/node_modules/@playwright/test"));
    const corePath = require.resolve("playwright-core/lib/coreBundle", { paths: [path.dirname(require.resolve(args.playwright ?? path.resolve(__dirname, "../../../../frontend/node_modules/@playwright/test")))] });
    const { utils: { ZipFile } } = require(corePath);
    browser = await playwright.chromium.launch({ ...(args.chromium ? { executablePath: args.chromium } : {}) });
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin + "/document");
    const cdp = await context.newCDPSession(page);
    transport = await prepareBrowserTransport(cdp);
    let callCount = 0;
    const send = cdp.send.bind(cdp);
    cdp.send = async (method, params) => { if (method === "Runtime.callFunctionOn") callCount++; return send(method, params); };
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    await context.tracing.startChunk({ name: "old-evaluate" });
    await page.evaluate(async spec => {
      const response = await fetch(spec.path, { method: spec.method, credentials: "same-origin", headers: spec.headers });
      const bytes = await response.arrayBuffer();
      return { http_status: response.status, body_bytes: bytes.byteLength, body_complete_browser_ms: performance.now() };
    }, { path: "/probe/old", method: "GET", headers: { "x-request-id": "probe-old" } });
    await context.tracing.stopChunk({ path: path.join(args.output, "old-trace.zip") });
    await context.tracing.startChunk({ name: "new-cdp" });
    const results = [];
    for (const spec of [
      { id: "get", path: "/probe/new", method: "GET", headers: { "x-request-id": "probe-new" } },
      { id: "post", path: "/api/io/preview", method: "POST", headers: { "x-request-id": "probe-post", Authorization: `Bearer ${bearer}` }, data: { pin } },
      { id: "status", path: "/probe/status", query: { status: 503 }, method: "GET", headers: { "x-request-id": "probe-status" } },
      { id: "decode", path: "/api/io/preview", query: { invalid: 1 }, method: "POST", headers: { "x-request-id": "probe-decode" } },
      { id: "fetch", path: "http://127.0.0.1:1/blocked", method: "GET", headers: { "x-request-id": "probe-fetch" } },
    ]) {
      const before = callCount;
      const outcome = await core.issue(spec, 100, {}, () => 100, request => transport.fetch(request));
      requireProbe(callCount - before === 1, "cdp_call_count");
      const expected = spec.id === "decode" ? "CONDITION_NOT_MET" : spec.id === "fetch" ? "REQUEST_FAILED" : "RESPONSE";
      requireProbe(outcome.status === expected, "error_classification");
      if (spec.id === "post") requireProbe(outcome.data?.echoed === JSON.stringify({ pin }) && outcome.data.bearer === `Bearer ${bearer}`, "returned_data_missing");
      results.push({ id: spec.id, status: outcome.status, http_status: outcome.http_status, reason: outcome.reason, cdp_calls: 1 });
    }
    await context.tracing.stopChunk({ path: path.join(args.output, "new-trace.zip") });
    await context.tracing.stop();
    const oldEntries = await readTrace(ZipFile, path.join(args.output, "old-trace.zip"));
    const newEntries = await readTrace(ZipFile, path.join(args.output, "new-trace.zip"));
    const surface = auditTraceSurface(oldEntries.get("trace.trace").toString("utf8"), newEntries.get("trace.trace").toString("utf8"), canaries);
    const network = received.filter(row => row.requestId !== "probe-old").map(row => auditNetwork(newEntries, origin, row));
    requireProbe(network.length === 4 && received.length === 5, "http_call_count");
    const beforeChange = callCount;
    await page.goto(origin + "/document");
    const changed = await core.issue({ id: "changed", path: "/probe/never" }, 100, {}, () => 100, spec => transport.fetch(spec));
    requireProbe(changed.status === "CONDITION_NOT_MET" && changed.reason === "browser_document_changed" && callCount === beforeChange, "document_change_classification");
    transport.dispose();
    const protocolTransport = await prepareBrowserTransport(cdp);
    await cdp.detach();
    const protocol = await core.issue({ id: "protocol", path: "/probe/never" }, 100, {}, () => 100, spec => protocolTransport.fetch(spec));
    protocolTransport.dispose();
    requireProbe(protocol.status === "CONDITION_NOT_MET", "protocol_classification");
    const report = { status: "PASS", kind: "transport-tool-only", application_requests: 0, origin, ...surface, results, network,
      http_requests: received.length, document_change: changed.status, protocol_error: protocol.status,
      canary_json_copies: 0, canary_stdout_copies: 0, protected_network_raw: true,
      core_bundle_sha256: createHash("sha256").update(fs.readFileSync(corePath)).digest("hex") };
    const json = JSON.stringify(report);
    requireProbe(!canaries.some(value => json.includes(value)), "canary_in_report");
    fs.writeFileSync(path.join(args.output, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    for (const file of ["old-trace.zip", "new-trace.zip"]) fs.chmodSync(path.join(args.output, file), 0o600);
    const stdout = JSON.stringify({ status: report.status, kind: report.kind, application_requests: 0, output: args.output }) + "\n";
    requireProbe(!canaries.some(value => stdout.includes(value)), "canary_in_stdout");
    process.stdout.write(stdout);
  } finally {
    transport?.dispose();
    await context?.close();
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  main(args).catch(error => { process.stderr.write(JSON.stringify({ status: "TOOL_CONDITION_NOT_MET", reason: /^probe_[a-z_]+$/.test(error.message) ? error.message : "probe_tool_error_redacted", error: { type: error.name } }) + "\n"); process.exitCode = 2; });
}
module.exports = { auditTraceSurface, auditNetwork, main };
