"use strict";

// Descriptor/retention contracts; actual React is exercised by the separate browser harness.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = fs.readFileSync(path.join(__dirname, "bom/bom-diag-native.js"), "utf8");

function harness(enabled = true, trap = true, filename = "http://localhost:3100/_next/static/chunks/observer.js") {
  const values = new WeakMap();
  const listeners = [];
  const calls = [];
  const microtasks = [];
  const result = Symbol("native-return");
  const invalidThis = new TypeError("native illegal invocation");
  let gets = 0;
  let tick = 0;
  class Node {}
  class Element extends Node {
    constructor(tag, target = true) {
      super();
      this.tagName = tag;
      this.target = target;
      this.isConnected = true;
      this.disabled = false;
      this.readOnly = false;
      values.set(this, "1");
    }
    matches(selector) {
      return this.target && ((this.tagName === "INPUT" && selector.startsWith("input["))
        || (this.tagName === "TEXTAREA" && selector.startsWith("textarea[")));
    }
    closest() { return null; }
    getAttribute() { return null; }
  }
  class HTMLInputElement extends Element { constructor(target = true) { super("INPUT", target); } }
  class HTMLTextAreaElement extends Element { constructor(target = true) { super("TEXTAREA", target); } }
  const native = {
    configurable: true, enumerable: true,
    get() { if (!values.has(this)) throw invalidThis; gets += 1; return values.get(this); },
    set(value) {
      if (!values.has(this)) throw invalidThis;
      calls.push({ receiver: this, value });
      if (this.failure) throw this.failure;
      values.set(this, String(value));
      return result;
    },
  };
  for (const type of [HTMLInputElement, HTMLTextAreaElement]) Object.defineProperty(type.prototype, "value", native);
  const document = { activeElement: null, visibilityState: "visible", hasFocus: () => true, querySelectorAll: () => [] };
  const window = {
    __MES_BOM_DIAG_ENABLED__: enabled, __MES_BOM_VALUE_TRAP__: trap,
    fetch: () => Promise.resolve({ status: 200 }),
    addEventListener(type, handler, options) { listeners.push({ type, handler, options }); },
  };
  const context = vm.createContext({ window, document, Node, Element, Event: class {}, HTMLInputElement, HTMLTextAreaElement,
    URL, Request: class {}, location: { href: "http://localhost:3100/mes" },
    performance: { timeOrigin: 7, now: () => ++tick }, queueMicrotask: (fn) => microtasks.push(fn) });
  vm.runInContext(source, context, { filename });
  return { HTMLInputElement, HTMLTextAreaElement, native, calls, result, invalidThis, values, window, document,
    getCount: () => gets, snapshot: () => JSON.parse(JSON.stringify(window.__mesBomDiag.export())) };
}

test("writer trap is opt-in and preserves native descriptor, argument conversion, return and exception", () => {
  for (const [enabled, trap] of [[false, true], [true, false]]) {
    const h = harness(enabled, trap);
    assert.equal(Object.getOwnPropertyDescriptor(h.HTMLInputElement.prototype, "value").set, h.native.set);
  }
  const h = harness();
  const descriptor = Object.getOwnPropertyDescriptor(h.HTMLInputElement.prototype, "value");
  assert.notEqual(descriptor.set, h.native.set);
  assert.equal(descriptor.get, h.native.get);
  assert.equal(descriptor.enumerable, h.native.enumerable);
  assert.equal(descriptor.configurable, h.native.configurable);
  const node = new h.HTMLInputElement();
  let conversions = 0;
  const value = { toString() { conversions += 1; return "2"; } };
  assert.equal(descriptor.set.call(node, value), h.result);
  assert.equal(conversions, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].value, value);
  assert.equal(h.calls[0].receiver, node);
  assert.throws(() => descriptor.set.call({}, "1"), (error) => error === h.invalidThis);
  node.failure = new Error("native failure");
  assert.throws(() => descriptor.set.call(node, "1"), (error) => error === node.failure);
});

test("only destructive target writes retain a sanitized incident, including React own setter forwarding", () => {
  const h = harness();
  const node = new h.HTMLInputElement();
  let tracker = "1";
  const descriptor = Object.getOwnPropertyDescriptor(h.HTMLInputElement.prototype, "value");
  Object.defineProperty(node, "value", { get: descriptor.get, set(value) { tracker = String(value); return descriptor.set.call(this, value); } });
  node._valueTracker = { getValue: () => tracker };
  node.__reactProps$test = { value: 1, onChange: () => { throw Error("observer called handler"); } };
  node.value = "2";
  node.value = "2";
  assert.equal(h.snapshot().incidents.length, 0);
  node.value = "1";
  node.value = "3";
  node.value = "1";
  const snapshot = h.snapshot();
  assert.equal(snapshot.writerTrap.installed, true);
  assert.equal(snapshot.incidents.length, 2);
  const write = snapshot.incidents[0].trigger;
  assert.equal(write.before.value, 2);
  assert.equal(write.after.value, 1);
  assert.equal(write.before.tracker, 1);
  assert.equal(write.after.react.value, 1);
  assert.equal(tracker, "1");
  assert.ok(write.stack.frames.every((frame) => /^[-\w.]+\.js$/.test(frame.file)));
  assert.ok(!JSON.stringify(snapshot).includes("http://"));
});

test("private inputs are forwarded with zero observation reads and memo content is never retained", () => {
  const h = harness();
  for (const type of [h.HTMLInputElement, h.HTMLTextAreaElement]) {
    const node = new type(false);
    const before = h.getCount();
    Object.defineProperty(node, "_valueTracker", { get() { throw Error("private tracker read"); } });
    node.value = "PRIVATE-PIN-SENTINEL";
    assert.equal(h.getCount(), before);
  }
  const note = new h.HTMLTextAreaElement();
  note.value = "PRIVATE-MEMO-SENTINEL";
  note.value = "";
  const snapshot = h.snapshot();
  assert.equal(snapshot.incidents.length, 1);
  assert.equal(snapshot.incidents[0].trigger.before.value.length, "PRIVATE-MEMO-SENTINEL".length);
  assert.equal(snapshot.incidents[0].trigger.after.value.empty, true);
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE"));
});

test("native editing bypass creates no invented JS writer and recorder failure cannot replace native result", () => {
  const h = harness();
  const node = new h.HTMLInputElement();
  h.values.set(node, "2"); // native browser editing does not invoke the JavaScript setter.
  assert.equal(h.snapshot().incidents.length, 0);
  node.matches = () => { throw Error("instrumentation failure"); };
  const descriptor = Object.getOwnPropertyDescriptor(h.HTMLInputElement.prototype, "value");
  assert.equal(descriptor.set.call(node, "1"), h.result);
  assert.equal(h.values.get(node), "1");
  assert.ok(h.snapshot().writerTrap.errors > 0);
});

test("bounded incidents survive normal ring overflow and report subsequent incident loss", () => {
  const h = harness();
  const node = new h.HTMLInputElement();
  const record = h.window.__mesBomDiag.recordReact;
  for (let i = 0; i < 150; i += 1) record("commit", { step: 2 });
  node.value = "2";
  node.value = "1";
  for (let i = 0; i < 8300; i += 1) record("commit", { step: 2 });
  for (let i = 0; i < 9; i += 1) { node.value = "3"; node.value = "1"; }
  const snapshot = h.snapshot();
  assert.ok(snapshot.dropped > 0);
  assert.equal(snapshot.events.length, 8192);
  assert.equal(snapshot.incidents.length, 8);
  assert.equal(snapshot.writerTrap.incidentOverflow, 2);
  assert.equal(snapshot.incidents[0].before.length, 128);
  assert.equal(snapshot.incidents[0].after.length, 64);
  assert.equal(snapshot.incidents[0].trigger.before.value, 2);
});

test("encoded Next chunk frames survive while URL queries and raw stack text do not", () => {
  const h = harness(true, true, "http://localhost:3100/_next/static/chunks/%5Bturbopack%5D_%40swc.js?private=SENTINEL");
  const node = new h.HTMLInputElement();
  node.value = "3";
  node.value = "1";
  const snapshot = h.snapshot();
  assert.ok(snapshot.incidents[0].trigger.stack.frames.some(row => row.file === "%5Bturbopack%5D_%40swc.js"));
  assert.equal(JSON.stringify(snapshot).includes("SENTINEL"), false);
});
