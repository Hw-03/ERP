/* Opt-in, quantity-only, fixed-memory recorder. No layout reads or synchronous I/O. */
(() => {
  "use strict";
  if (window.__MES_BOM_DIAG_ENABLED__ !== true || window.__mesBomDiag) return;
  const SELECTOR = 'input[data-testid="shipping-bom-line-controls"]';
  const CAPACITY = 8192;
  const ring = new Array(CAPACITY);
  const nodes = new WeakMap();
  const nativeEvents = new WeakMap();
  const instances = new WeakMap();
  const lines = new Map();
  const children = new Map();
  let nodeSerial = 0;
  let eventSerial = 0;
  let instanceSerial = 0;
  let sequence = 0;
  let currentStep = null;

  const numeric = (value) => {
    if (value === "") return "";
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value)) {
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }
    return null;
  };
  const token = (map, value) => {
    if (typeof value !== "string" || !value) return null;
    if (!map.has(value)) {
      if (map.size >= CAPACITY) return null;
      map.set(value, map.size + 1);
    }
    return map.get(value);
  };
  const nodeId = (node) => {
    if (!(node instanceof Node)) return null;
    if (!nodes.has(node)) nodes.set(node, ++nodeSerial);
    return nodes.get(node);
  };
  const eventId = (event) => {
    if (!(event instanceof Event)) return null;
    if (!nativeEvents.has(event)) nativeEvents.set(event, ++eventSerial);
    return nativeEvents.get(event);
  };
  const describe = (node) => {
    if (!(node instanceof Element)) return { uid: nodeId(node), tag: null, quantity: false };
    const quantity = node.matches(SELECTOR);
    const description = { uid: nodeId(node), tag: node.tagName, quantity, connected: node.isConnected };
    // Do not read or retain PIN, employee lookup, notes, invoice or general input values.
    if (quantity) {
      Object.assign(description, {
        child: token(children, node.closest("[data-bom-line-child]")?.getAttribute("data-bom-line-child")),
        value: numeric(node.value), valueAttribute: numeric(node.getAttribute("value")),
        tracker: numeric(node._valueTracker?.getValue?.()),
        disabled: node.disabled, readOnly: node.readOnly,
        inertAncestor: Boolean(node.closest("[inert]")), hiddenAncestor: Boolean(node.closest("[hidden]")),
        selectionStart: node.selectionStart, selectionEnd: node.selectionEnd,
      });
    }
    return description;
  };
  const quantities = () => [...document.querySelectorAll(SELECTOR)].map(describe);
  const lineSnapshots = (value) => Array.isArray(value) ? value.map((line) => ({
    key: token(lines, line.key), child: token(children, line.child_item_id),
    stage: line.parent_stage === "PA" ? "PA" : line.parent_stage === "PF" ? "PF" : null,
    quantity: numeric(line.quantity), included: typeof line.included === "boolean" ? line.included : null,
    origin: line.origin === "DEFAULT" ? "DEFAULT" : line.origin === "CUSTOM" ? "CUSTOM" : null,
  })) : null;
  const record = (kind, detail = {}) => {
    const item = {
      sequence: ++sequence, time: performance.now(), kind,
      step: currentStep, documentFocused: document.hasFocus(), visibility: document.visibilityState,
      active: describe(document.activeElement), ...detail,
    };
    ring[(sequence - 1) % CAPACITY] = item;
    return sequence;
  };
  const exportSnapshot = () => {
    const count = Math.min(sequence, CAPACITY);
    const start = Math.max(0, sequence - CAPACITY);
    return {
      document: performance.timeOrigin, sequence, capacity: CAPACITY, dropped: start,
      events: Array.from({ length: count }, (_, index) => ring[(start + index) % CAPACITY]),
    };
  };
  const validLabels = new Set(["onChange", "updateDraftLine:call", "draft:set:call", "draft:set:apply", "commit"]);
  const validSources = new Set([
    "returnHome", "url:existing-request", "url:new-draft", "clearDraft", "loadRequestIntoDraft",
    "loadDefaultBom:empty", "loadDefaultBom:loaded", "updateDraftLine", "addDraftLine", "removeDraftLine",
  ]);
  window.__mesBomDiag = {
    version: 2,
    export: exportSnapshot,
    recordReact: (label, payload) => {
      if (!validLabels.has(label)) return sequence;
      if (typeof payload.step === "number") currentStep = payload.step;
      const detail = {};
      for (const key of ["write", "step", "generation", "patchQuantity", "inputQuantity", "previousPropQuantity"]) {
        if (key in payload) detail[key] = numeric(payload[key]);
      }
      if ("patchIncluded" in payload) detail.patchIncluded = typeof payload.patchIncluded === "boolean" ? payload.patchIncluded : null;
      if ("functional" in payload) detail.functional = payload.functional === true;
      if ("source" in payload) detail.source = validSources.has(payload.source) ? payload.source : "unknown";
      if (payload.instance && typeof payload.instance === "object") {
        if (!instances.has(payload.instance)) instances.set(payload.instance, ++instanceSerial);
        detail.instance = instances.get(payload.instance);
      }
      if (typeof payload.reactVersion === "string" && /^19\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(payload.reactVersion)) {
        detail.reactVersion = payload.reactVersion;
      }
      if ("key" in payload) detail.key = token(lines, payload.key);
      if ("child" in payload) detail.child = token(children, payload.child);
      if ("target" in payload) detail.target = describe(payload.target);
      if ("nativeEvent" in payload) detail.event = eventId(payload.nativeEvent);
      for (const key of ["lines", "previous", "next"]) if (key in payload) detail[key] = lineSnapshots(payload[key]);
      if (label === "commit") detail.dom = quantities();
      return record("react:" + label, detail);
    },
  };

  for (const type of ["focusin", "focusout", "beforeinput", "input", "change"]) {
    const details = (event) => {
      const isQuantity = event.target instanceof Element && event.target.matches(SELECTOR);
      return {
        event: eventId(event), target: describe(event.target), related: describe(event.relatedTarget),
        trusted: event.isTrusted, defaultPrevented: event.defaultPrevented, cancelable: event.cancelable,
        inputType: isQuantity && typeof event.inputType === "string" ? event.inputType : null,
        data: isQuantity ? numeric(event.data) : null,
      };
    };
    window.addEventListener(type, (event) => {
      record("native:" + type + ":capture", details(event));
      // A capture-queued microtask may run at a listener boundary before dispatch ends.
      // It is an extra sample, not proof of final cancellation. Prefer window-bubble
      // when it exists; absent bubble can also mean propagation was stopped.
      queueMicrotask(() => record("native:" + type + ":after-dispatch", details(event)));
    }, { capture: true, passive: true });
    window.addEventListener(type, (event) => {
      record("native:" + type + ":window-bubble", details(event));
    }, { passive: true });
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const [input, init] = args;
    const candidate = typeof input === "string" ? input : input instanceof URL ? input.href
      : input instanceof Request ? input.url : null;
    const url = candidate?.includes("/api/shipping/bom-match") ? new URL(candidate, location.href) : null;
    let request = null;
    if (url?.pathname === "/api/shipping/bom-match" && (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() === "POST") {
      if (typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body);
          request = record("network:bom-match:request", {
            base: token(children, body.base_pf_item_id), lines: lineSnapshots(body.bom_lines),
            bodyReadable: true,
          });
        } catch {
          request = record("network:bom-match:request", { bodyReadable: false });
        }
      } else request = record("network:bom-match:request", { bodyReadable: false });
    }
    const pending = Reflect.apply(originalFetch, this, args);
    if (request !== null) {
      // Observe settlement without replacing the original Promise returned to the app.
      pending.then(
        (response) => record("network:bom-match:response", { request, status: response.status }),
        () => record("network:bom-match:rejected", { request }),
      );
    }
    return pending;
  };
  let flushedSequence = -1;
  const flush = () => {
    if (flushedSequence === sequence || typeof window.__mesBomDiagFlush !== "function") return;
    flushedSequence = sequence;
    // Memory transfer at document exit only. No await, filesystem, console or storage write.
    void window.__mesBomDiagFlush(exportSnapshot()).catch(() => undefined);
  };
  window.addEventListener("beforeunload", flush, { capture: true, passive: true });
  window.addEventListener("pagehide", flush, { capture: true, passive: true });
  record("recorder:ready");
})();
