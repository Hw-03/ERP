"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { auditTraceSurface, auditNetwork } = require("./browser-transport-probe.cjs");

test("HAR body resources take precedence over Playwright's empty postData text placeholder", () => {
  const body = '{"pin":"LOCAL-CANARY"}', responseBody = Buffer.from('{"ok":true}');
  const entries = new Map([
    ["trace.network", Buffer.from(JSON.stringify({ type: "resource-snapshot", snapshot: {
      request: { url: "http://127.0.0.1:3154/probe", method: "POST", headers: [{ name: "x-request-id", value: "probe" }, { name: "cookie", value: "transport_probe=cookie" }],
        postData: { text: "", _sha1: "request.json" } }, response: { status: 201, content: { _sha1: "response.json" } },
    } }))], ["resources/request.json", Buffer.from(body)], ["resources/response.json", responseBody],
  ]);
  const result = auditNetwork(entries, "http://127.0.0.1:3154", { target: "/probe", method: "POST", requestId: "probe", body, status: 201, responseBody });
  assert.equal(result.exact_request_body, true);
  assert.equal(JSON.stringify(result).includes("LOCAL-CANARY"), false);
});

test("probe admission requires old snapshot evidence and zero new context actions with canary exclusion", () => {
  const old = [{ type: "before", class: "Frame", method: "evaluateExpression", beforeSnapshot: "before@call@14" },
    { type: "frame-snapshot", snapshot: { snapshotName: "before@call@14" } }];
  assert.deepEqual(auditTraceSurface(JSON.stringify(old[0]) + "\n" + JSON.stringify(old[1]), "", ["PIN-CANARY", "BEARER-CANARY"]),
    { old_before_snapshots: 1, old_before_frames: 1, new_before_actions: 0, new_before_snapshots: 0, canary_trace_copies: 0 });
  for (const [before, after] of [["", ""], [JSON.stringify(old[0]), ""], [old.map(JSON.stringify).join("\n"), JSON.stringify({ type: "before" })],
    [old.map(JSON.stringify).join("\n"), "PIN-CANARY"]])
    assert.throws(() => auditTraceSurface(before, after, ["PIN-CANARY"]), error => /^probe_/.test(error.message) && !error.message.includes("PIN-CANARY"));
});
