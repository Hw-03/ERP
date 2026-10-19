"use strict";

// Observer safety checks only. This harness neither runs React nor reproduces its events.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "bom/bom-diag-native.js"), "utf8");
const DISCARD_NOTE = "폐기 전 모든 입력";

function harness() {
  const listeners = new Map();
  const microtasks = [];
  let clock = 0;
  class Node {}
  class Element extends Node {
    constructor(tag, attributes = {}, state = {}) {
      super();
      Object.assign(this, { tagName: tag, isConnected: true, disabled: false, readOnly: false,
        selectionStart: 0, selectionEnd: 0, attributes, state });
      Object.defineProperty(this, "value", { get: () => state.value, set: () => { throw new Error("observer wrote value"); } });
      this._valueTracker = { getValue: () => state.tracker };
      this.__reactProps$test = state.props;
    }
    matches(selector) {
      return (selector === 'input[data-testid="shipping-bom-line-controls"]' && this.tagName === "INPUT" && this.attributes["data-testid"] === "shipping-bom-line-controls")
        || (selector === 'textarea[aria-label="요청 메모"]' && this.tagName === "TEXTAREA" && this.attributes["aria-label"] === "요청 메모");
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    closest() { return null; }
  }
  class Event {
    constructor(type, target, data) {
      Object.assign(this, { type, target, data, relatedTarget: null, inputType: "insertText",
        isTrusted: true, cancelable: true, defaultPrevented: false });
    }
    preventDefault() { throw new Error("observer cancelled event"); }
    stopPropagation() { throw new Error("observer stopped event"); }
  }
  const document = { activeElement: null, visibilityState: "visible", hasFocus: () => true, querySelectorAll: () => [] };
  const window = { __MES_BOM_DIAG_ENABLED__: true, fetch: () => Promise.resolve({ status: 200 }),
    addEventListener(type, handler, options) {
      assert.equal(options.passive, true);
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ handler, capture: options.capture === true });
    } };
  const context = vm.createContext({ window, document, Node, Element, Event, URL, Request: class {},
    location: { href: "http://127.0.0.1:3100/mes?tab=shipping" },
    performance: { timeOrigin: 1, now: () => ++clock }, queueMicrotask: (task) => microtasks.push(task) });
  vm.runInContext(source, context);
  return {
    window, Element, document,
    emit(target, data, between = () => {}) {
      document.activeElement = target;
      const event = new Event("input", target, data);
      for (const entry of listeners.get("input")) if (entry.capture) entry.handler(event);
      between();
      for (const entry of listeners.get("input")) if (!entry.capture) entry.handler(event);
      while (microtasks.length) microtasks.shift()();
    },
    snapshot: () => JSON.parse(JSON.stringify(window.__mesBomDiag.export())),
  };
}

test("request note distinguishes native value from tracker and current React props without retaining text", () => {
  const h = harness();
  const state = { value: DISCARD_NOTE, tracker: "", props: { value: "", onChange: () => { throw new Error("observer invoked React"); } } };
  const note = new h.Element("TEXTAREA", { "aria-label": "요청 메모" }, state);
  h.emit(note, DISCARD_NOTE, () => { state.value = ""; });
  const snapshot = h.snapshot();
  const capture = snapshot.events.find((event) => event.kind === "native:input:capture");
  const bubble = snapshot.events.find((event) => event.kind === "native:input:window-bubble");
  assert.equal(capture.target.requestNote, true);
  assert.equal(capture.target.value.length, DISCARD_NOTE.length);
  assert.equal(capture.target.value.matchesDiscard, true);
  assert.equal(capture.target.tracker.empty, true);
  assert.equal(capture.target.react.value.empty, true);
  assert.equal(capture.target.react.hasOnChange, true);
  assert.equal(capture.target.valueEqualsTracker, false);
  assert.equal(capture.target.valueEqualsReact, false);
  assert.equal(bubble.target.value.empty, true);
  assert.equal(capture.data.matchesDiscard, true);
  assert.equal(JSON.stringify(snapshot).includes(DISCARD_NOTE), false);
  assert.equal(state.tracker, "");
  assert.equal(state.props.value, "");
});

test("only the exact request note and BOM quantity can expose sanitized value observations", () => {
  const h = harness();
  for (const [tag, attributes] of [["INPUT", { type: "password" }], ["TEXTAREA", { "aria-label": "요청 메모 기타" }]]) {
    const node = new h.Element(tag, attributes, { get value() { throw new Error("private value read"); } });
    Object.defineProperty(node, "_valueTracker", { get: () => { throw new Error("private tracker read"); } });
    Object.defineProperty(node, "__reactProps$test", { get: () => { throw new Error("private props read"); } });
    h.emit(node, "PRIVATE-PIN-AND-NOTE");
  }
  const privateNote = new h.Element("TEXTAREA", { "aria-label": "요청 메모" }, {
    value: "PRIVATE-FREE-NOTE", tracker: "PRIVATE-FREE-NOTE", props: { value: "PRIVATE-FREE-NOTE", secret: "PRIVATE-PROP" },
  });
  h.emit(privateNote, "PRIVATE-FREE-NOTE");
  const serialized = JSON.stringify(h.snapshot());
  assert.equal(serialized.includes("PRIVATE"), false);
  const last = h.snapshot().events.at(-1).target;
  assert.equal(last.value.length, "PRIVATE-FREE-NOTE".length);
  assert.equal(last.value.matchesDiscard, false);
  assert.equal(last.valueEqualsTracker, true);
  assert.equal(last.valueEqualsReact, true);
});

test("quantity records numeric props and the recorder keeps a bounded memory ring", () => {
  const h = harness();
  const quantity = new h.Element("INPUT", { "data-testid": "shipping-bom-line-controls" }, {
    value: "2", tracker: "1", props: { value: 1, onChange: () => {} },
  });
  h.emit(quantity, "2");
  const target = h.snapshot().events.at(-1).target;
  assert.equal(target.value, 2);
  assert.equal(target.tracker, 1);
  assert.equal(target.react.value, 1);
  assert.equal(target.valueEqualsReact, false);
  quantity.__reactProps$test = { value: 2, onChange: () => {} };
  h.emit(quantity, "2");
  assert.equal(h.snapshot().events.at(-1).target.react.value, 2);
  assert.equal(h.snapshot().events.at(-1).target.valueEqualsReact, true);
  for (let index = 0; index < 2800; index += 1) h.emit(quantity, "2");
  const snapshot = h.snapshot();
  assert.equal(snapshot.events.length, snapshot.capacity);
  assert.ok(snapshot.dropped > 0);
  assert.equal(snapshot.events.at(-1).sequence, snapshot.sequence);
});
