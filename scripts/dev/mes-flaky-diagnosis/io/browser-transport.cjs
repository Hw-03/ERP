"use strict";

/** A failed diagnostic execution must never masquerade as an HTTP failure. */
class BrowserTransportConditionError extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason);
    this.name = "BrowserTransportConditionError";
    this.conditionReason = reason;
  }
}

// This fixed source contains no per-request data; arguments travel only over CDP.
const FETCH_FUNCTION = async function(spec) {
  const query = new URLSearchParams(spec.query ?? {}).toString();
  const target = spec.path + (query ? `?${query}` : "");
  const init = { method: spec.method, credentials: "same-origin", headers: {
    ...spec.headers, ...(spec.data === undefined ? {} : { "Content-Type": "application/json" }),
  }, ...(spec.data === undefined ? {} : { body: JSON.stringify(spec.data) }) };
  let response, bytes;
  try {
    response = await fetch(target, init);
    bytes = await response.arrayBuffer();
  } catch (error) {
    const type = ["Error", "TypeError", "AbortError", "NetworkError", "TimeoutError"].includes(error?.name) ? error.name : "Error";
    return { kind: "request_failed", error: { type } };
  }
  const body_complete_browser_ms = performance.now();
  return { kind: "response", value: { http_status: response.status, body_bytes: bytes.byteLength, body_complete_browser_ms,
    request_id_echo_matches: response.headers.get("X-Request-Id") === spec.headers["x-request-id"],
    ...((spec.path === "/api/io/preview" || spec.path === "/api/io/submit") && response.ok ?
      { data: JSON.parse(new TextDecoder().decode(bytes)) } : {}) } };
};

/**
 * Pin the existing blank document during preparation, before timed dispatch.
 * CDPSession is browser-attributed in Playwright; integration must verify that
 * send arguments/results stay out of context trace.trace while HAR stays on.
 * @param {{send(method: string, params?: object): Promise<object>, on(event: string, listener: Function): void, removeListener(event: string, listener: Function): void}} cdp
 * @returns {Promise<{fetch(request: object): Promise<object>, dispose(): void}>}
 */
async function prepareBrowserTransport(cdp) {
  let documentChanged = false;
  const invalidate = () => { documentChanged = true; };
  cdp.on("Runtime.executionContextsCleared", invalidate);
  const dispose = () => cdp.removeListener("Runtime.executionContextsCleared", invalidate);
  let evaluated;
  try {
    await cdp.send("Runtime.enable");
    evaluated = await cdp.send("Runtime.evaluate", { expression: "globalThis", returnByValue: false });
  } catch {
    dispose();
    throw new BrowserTransportConditionError("browser_cdp_preparation_failed");
  }
  if (documentChanged || evaluated?.exceptionDetails || evaluated?.result?.type !== "object" || typeof evaluated.result.objectId !== "string" || !evaluated.result.objectId) {
    dispose();
    throw new BrowserTransportConditionError(documentChanged ? "browser_document_changed" : "browser_global_object_unavailable");
  }
  const objectId = evaluated.result.objectId;
  return {
    /** @param {object} request @returns {Promise<object>} */
    async fetch(request) {
      if (documentChanged) throw new BrowserTransportConditionError("browser_document_changed");
      let evaluated;
      try {
        evaluated = await cdp.send("Runtime.callFunctionOn", { objectId, functionDeclaration: FETCH_FUNCTION.toString(),
          arguments: [{ value: request }], awaitPromise: true, returnByValue: true });
      } catch {
        throw new BrowserTransportConditionError(documentChanged ? "browser_document_changed" : "browser_cdp_call_failed");
      }
      if (documentChanged) throw new BrowserTransportConditionError("browser_document_changed");
      if (evaluated?.exceptionDetails) throw new BrowserTransportConditionError("browser_execution_exception");
      const envelope = evaluated?.result?.type === "object" && evaluated.result.value;
      if (envelope?.kind === "request_failed" && Object.keys(envelope).length === 2 && Object.keys(envelope.error ?? {}).length === 1 &&
          ["Error", "TypeError", "AbortError", "NetworkError", "TimeoutError"].includes(envelope.error.type)) {
        const error = new Error("browser_request_failed");
        error.name = envelope.error.type;
        throw error;
      }
      const value = envelope?.value;
      const dataExpected = ["/api/io/preview", "/api/io/submit"].includes(request.path) && value?.http_status >= 200 && value.http_status < 300;
      if (envelope?.kind !== "response" || Object.keys(envelope).length !== 2 || !value ||
          !Number.isInteger(value.http_status) || value.http_status < 100 || value.http_status > 599 ||
          !Number.isInteger(value.body_bytes) || value.body_bytes < 0 || !Number.isFinite(value.body_complete_browser_ms) || value.body_complete_browser_ms < 0 ||
          typeof value.request_id_echo_matches !== "boolean" || Object.hasOwn(value, "data") !== dataExpected ||
          Object.keys(value).some(key => !["http_status", "body_bytes", "body_complete_browser_ms", "request_id_echo_matches", "data"].includes(key)))
        throw new BrowserTransportConditionError("browser_result_schema_invalid");
      return value;
    },
    dispose,
  };
}

module.exports = { prepareBrowserTransport, BrowserTransportConditionError };
