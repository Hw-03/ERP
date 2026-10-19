'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'bom-diag-native.js'), 'utf8');
function harness() {
  const values = new WeakMap(), calls = [], listeners = [];
  class Node {}
  class Element extends Node {
    constructor(tag = 'INPUT') { super(); this.tagName = tag; this.isConnected = true; values.set(this, '1'); }
    matches(selector) { return this.tagName === 'INPUT' && selector.startsWith('input['); }
    closest(selector) { return selector === '[data-bom-line-child]' ? { getAttribute: () => 'PRIVATE-CHILD' } : null; }
    getAttribute() { return null; }
  }
  class HTMLInputElement extends Element {}
  class HTMLTextAreaElement extends Element { constructor() { super('TEXTAREA'); } }
  const failure = new Error('PRIVATE-NATIVE-ERROR'), result = Symbol('return');
  const descriptor = { configurable: true, enumerable: true, get() { return values.get(this); }, set(value) {
    calls.push(value); if (this.fail) throw failure; values.set(this, String(value)); return result;
  } };
  for (const kind of [HTMLInputElement, HTMLTextAreaElement]) Object.defineProperty(kind.prototype, 'value', descriptor);
  const window = { __MES_BOM_DIAG_ENABLED__: true, __MES_BOM_VALUE_TRAP__: true, __MES_BOM_PASSIVE__: true,
    fetch() { return Promise.resolve({ status: 200 }); }, addEventListener(type, callback, options) { listeners.push({ type, callback, options }); } };
  const document = { activeElement: null, visibilityState: 'visible', hasFocus: () => true, querySelectorAll: () => [] };
  let time = 0;
  vm.runInNewContext(source, { window, document, Node, Element, Event: class {}, HTMLInputElement, HTMLTextAreaElement,
    URL, Request: class {}, location: { href: 'http://localhost/mes?cookie=PRIVATE' },
    performance: { timeOrigin: 100, now: () => ++time }, queueMicrotask() {} },
  { filename: 'http://localhost/_next/static/chunks/passive.js?cookie=PRIVATE' });
  return { window, document, HTMLInputElement, HTMLTextAreaElement, descriptor, values, calls, result, failure,
    read: () => JSON.parse(JSON.stringify(window.__mesBomDiag.export())) };
}
test('passive reset latches the first stack across ring wrap and never pauses', () => {
  const h = harness(), input = new h.HTMLInputElement();
  input.value = '2'; input.value = '1';
  for (let i = 0; i < 8300; i++) h.window.__mesBomDiag.recordReact('commit', { step: 2 });
  input.value = '3'; input.value = '1';
  const row = h.read();
  assert.equal(row.mode, 'passive');
  assert.equal(row.incidents.length, 1);
  assert.equal(row.incidents[0].trigger.before.value, 2);
  assert.equal(row.writerTrap.subsequentResets, 1);
  assert.equal(row.writerTrap.diagnosticPauses, 0);
  assert.ok(row.incidents[0].trigger.stack.frames.length);
});
test('passive quantity-only forwarding preserves descriptors, conversion, return and exception', () => {
  const h = harness(), input = new h.HTMLInputElement(), memo = new h.HTMLTextAreaElement();
  const patched = Object.getOwnPropertyDescriptor(h.HTMLInputElement.prototype, 'value');
  assert.equal(patched.get, h.descriptor.get);
  assert.equal(patched.enumerable, true); assert.equal(patched.configurable, true);
  let conversions = 0;
  const value = { toString() { conversions++; return '2'; } };
  assert.equal(patched.set.call(input, value), h.result);
  assert.equal(conversions, 1); assert.equal(h.calls[0], value);
  input.fail = true;
  assert.throws(() => patched.set.call(input, '1'), error => error === h.failure);
  memo.value = 'PRIVATE-MEMO'; memo.value = '';
  const pin = new h.HTMLInputElement(); pin.matches = () => false; pin.value = '0000';
  assert.equal(h.read().incidents.length, 0);
  assert.doesNotMatch(JSON.stringify(h.read()), /PRIVATE|0000|cookie/);
});
