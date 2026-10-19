"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const vm = require("node:vm");
const { prepareBrowserTransport } = require("./browser-transport.cjs");
const core = require("./replay-core.cjs");

function session(overrides = {}) {
  const cdp = new EventEmitter();
  cdp.calls = [];
  cdp.send = async (method, params) => {
    cdp.calls.push({ method, params });
    if (overrides[method]) return overrides[method](params);
    if (method === "Runtime.evaluate") return { result: { type: "object", objectId: "prepared-global" } };
    return {};
  };
  return cdp;
}

const responseValue = { http_status: 200, body_bytes: 2, body_complete_browser_ms: 12, request_id_echo_matches: true };
const returned = value => ({ result: { type: "object", value } });
const response = value => returned({ kind: "response", value });

test("preparation pins globalThis once and dispatch awaits exactly one CDP function call", async () => {
  const cdp = session({ "Runtime.callFunctionOn": async () => response(responseValue) });
  const transport = await prepareBrowserTransport(cdp);
  const spec = { method: "GET", path: "/api/io/drafts", headers: { "x-request-id": "test" } };
  assert.deepEqual(await transport.fetch(spec), responseValue);
  assert.deepEqual(cdp.calls.map(row => row.method), ["Runtime.enable", "Runtime.evaluate", "Runtime.callFunctionOn"]);
  assert.deepEqual(cdp.calls[1].params, { expression: "globalThis", returnByValue: false });
  const params = cdp.calls[2].params;
  assert.equal(params.objectId, "prepared-global");
  assert.equal(params.awaitPromise, true);
  assert.equal(params.returnByValue, true);
  assert.deepEqual(params.arguments, [{ value: spec }]);
  assert.equal(params.functionDeclaration.includes("test"), false);
});

test("preparation rejects protocol, exception and missing global object without exposing payloads", async () => {
  for (const mode of ["protocol", "exception", "schema"]) {
    const cdp = session({ "Runtime.evaluate": async () => {
      if (mode === "protocol") throw new Error("PIN-CANARY");
      return mode === "exception" ? { exceptionDetails: { text: "PIN-CANARY" } } : { result: { type: "object" } };
    } });
    await assert.rejects(prepareBrowserTransport(cdp), error => error.name === "BrowserTransportConditionError" && !error.message.includes("PIN-CANARY"));
    assert.equal(cdp.calls.some(row => row.method === "Runtime.callFunctionOn"), false);
  }
});

test("CDP protocol, exception, result schema and document changes are terminal conditions with one call at most", async () => {
  for (const mode of ["protocol", "exception", "schema", "document", "during-call"]) {
    const cdp = session({ "Runtime.callFunctionOn": async () => {
      if (mode === "protocol") throw new Error("BEARER-CANARY");
      if (mode === "during-call") cdp.emit("Runtime.executionContextsCleared");
      return mode === "exception" ? { exceptionDetails: { text: "BEARER-CANARY" } } : mode === "schema" ? returned({ kind: "response", value: {} }) : response(responseValue);
    } });
    const transport = await prepareBrowserTransport(cdp);
    if (mode === "document") cdp.emit("Runtime.executionContextsCleared");
    const outcome = await core.issue({ id: "one", path: "/api/io/drafts" }, 100, {}, () => 100, spec => transport.fetch(spec));
    assert.equal(outcome.status, "CONDITION_NOT_MET", mode);
    assert.equal(cdp.calls.filter(row => row.method === "Runtime.callFunctionOn").length, mode === "document" ? 0 : 1);
    assert.equal(JSON.stringify(outcome).includes("CANARY"), false);
  }
});

test("only browser fetch and body-read errors become REQUEST_FAILED, never retried", async () => {
  for (const stage of ["fetch", "body"]) {
    let fetched = 0, bodies = 0;
    const cdp = session({ "Runtime.callFunctionOn": async params => {
      const fn = vm.runInNewContext(`(${params.functionDeclaration})`, {
        URLSearchParams, TextDecoder, performance: { now: () => 12 },
        fetch: async () => { fetched++; if (stage === "fetch") throw new TypeError("PIN-CANARY"); return { arrayBuffer: async () => { bodies++; throw new TypeError("BEARER-CANARY"); } }; },
      });
      return returned(await fn(params.arguments[0].value));
    } });
    const transport = await prepareBrowserTransport(cdp);
    const outcome = await core.issue({ id: "one", method: "GET", path: "/api/io/drafts", headers: {} }, 100, {}, () => 100, spec => transport.fetch(spec));
    assert.equal(outcome.status, "REQUEST_FAILED");
    assert.equal(outcome.error.type, "TypeError");
    assert.equal(fetched, 1);
    assert.equal(bodies, stage === "body" ? 1 : 0);
    assert.equal(JSON.stringify(outcome).includes("CANARY"), false);
  }
});

test("the original callback and CDP callback have deep-equal request/response semantics", async () => {
  const original = async spec => {
    const query = new URLSearchParams(spec.query ?? {}).toString();
    const target = spec.path + (query ? `?${query}` : "");
    const raw = await fetch(target, { method: spec.method, credentials: "same-origin", headers: {
      ...spec.headers, ...(spec.data === undefined ? {} : { "Content-Type": "application/json" }),
    }, ...(spec.data === undefined ? {} : { body: JSON.stringify(spec.data) }) });
    const bytes = await raw.arrayBuffer();
    const body_complete_browser_ms = performance.now();
    return { http_status: raw.status, body_bytes: bytes.byteLength, body_complete_browser_ms,
      request_id_echo_matches: raw.headers.get("X-Request-Id") === spec.headers["x-request-id"],
      ...((spec.path === "/api/io/preview" || spec.path === "/api/io/submit") && raw.ok ? { data: JSON.parse(new TextDecoder().decode(bytes)) } : {}) };
  };
  for (const spec of [
    { method: "GET", path: "/api/io/drafts", query: { text: "a b", limit: 100 }, headers: { "x-request-id": "semantic" } },
    { method: "POST", path: "/api/io/preview", headers: { "x-request-id": "semantic", Authorization: "Bearer PRIVATE" }, data: { bundles: [{ id: "fresh" }] } },
    { method: "POST", path: "/api/io/submit", headers: { "x-request-id": "semantic" }, data: { bundles: [{ signed: "fresh" }] } },
  ]) for (const status of [200, 201, 400, 503]) {
    const calls = [];
    const sandbox = { URLSearchParams, TextDecoder, performance: { now: () => 12 }, fetch: async (...args) => {
      calls.push(structuredClone(args));
      return { status, ok: status >= 200 && status < 300, headers: { get: () => "semantic" }, arrayBuffer: async () => new TextEncoder().encode('{"fresh":[1,"token"]}').buffer };
    } };
    const before = await vm.runInNewContext(`(${original.toString()})`, sandbox)(spec);
    const cdp = session({ "Runtime.callFunctionOn": async params => returned(await vm.runInNewContext(`(${params.functionDeclaration})`, sandbox)(params.arguments[0].value)) });
    const after = await (await prepareBrowserTransport(cdp)).fetch(spec);
    assert.deepEqual(structuredClone(after), structuredClone(before));
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls.length, 2);
  }
});

test("JSON decode exceptions remain tool conditions instead of false request failures", async () => {
  const cdp = session({ "Runtime.callFunctionOn": async params => {
    try {
      return returned(await vm.runInNewContext(`(${params.functionDeclaration})`, {
        URLSearchParams, TextDecoder, performance: { now: () => 12 }, fetch: async () => ({ status: 200, ok: true, headers: { get: () => "one" }, arrayBuffer: async () => new TextEncoder().encode("invalid-json").buffer }),
      })(params.arguments[0].value));
    } catch { return { exceptionDetails: { text: "private JSON value" } }; }
  } });
  const transport = await prepareBrowserTransport(cdp);
  const outcome = await core.issue({ id: "one", method: "POST", path: "/api/io/preview", headers: { "x-request-id": "one" } }, 100, {}, () => 100, spec => transport.fetch(spec));
  assert.equal(outcome.status, "CONDITION_NOT_MET");
});

test("malformed CDP packets are schema conditions and never ordinary TypeError request failures", async () => {
  for (const packet of [null, undefined, {}, { result: null }, { result: { type: "object", value: null } }, returned({ kind: "request_failed", error: "PRIVATE" })]) {
    const cdp = session({ "Runtime.callFunctionOn": async () => packet });
    const transport = await prepareBrowserTransport(cdp);
    const outcome = await core.issue({ id: "one", path: "/api/io/drafts" }, 100, {}, () => 100, spec => transport.fetch(spec));
    assert.equal(outcome.status, "CONDITION_NOT_MET");
  }
});
