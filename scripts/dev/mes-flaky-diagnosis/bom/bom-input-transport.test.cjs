'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let tool = {};
try { tool = require('./bom-input-transport.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

test('input transport accepts only the four new explicit conditions', () => {
  assert.equal(typeof tool.selectInputCase, 'function', 'input case guard is required');
  assert.deepEqual(tool.selectInputCase('q2-fill'), { id: 'q2-fill', quantity: 2, transport: 'fill' });
  assert.equal(tool.selectInputCase('q3-key').transport, 'key');
  for (const value of [undefined, 'q2-inflight', 'q4-key']) assert.throws(() => tool.selectInputCase(value));
});

test('transport ring records numeric armed commands once and preserves values and errors', () => {
  assert.equal(typeof tool.createTransportRecorder, 'function', 'memory transport recorder is required');
  const recorder = tool.createTransportRecorder(32);
  recorder.send({ id: 1, method: 'Input.insertText', params: { text: '0000' } });
  assert.equal(recorder.export().events.length, 0);
  recorder.arm(tool.selectInputCase('q2-fill'));
  recorder.send({ id: 2, sessionId: 'private-session', method: 'Input.insertText', params: { text: '2' } });
  recorder.receive({ id: 2, sessionId: 'private-session', result: { PRIVATE: 'PRIVATE' } });
  recorder.send({ id: 3, method: 'Input.insertText', params: { text: 'PRIVATE' } });
  const snapshot = recorder.export();
  assert.equal(snapshot.events.filter(row => row.kind === 'wire:send').length, 1);
  assert.equal(snapshot.events.filter(row => row.kind === 'wire:receive').length, 1);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(snapshot).includes('private-session'), false);
});

test('actual patched transport calls the original once and preserves its primitive return or exact error', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../../../frontend/node_modules/playwright-core/lib/coreBundle.js'), 'utf8');
  const patched = tool.patchPlaywright(source).source;
  const start = patched.indexOf('      _rawSend(sessionId, method, params2) {');
  const end = patched.indexOf('      async _onMessage(message)', start);
  const recorder = tool.createTransportRecorder();
  recorder.arm(tool.selectInputCase('q2-fill'));
  const C = vm.runInNewContext('(class {' + patched.slice(start, end) + '})', { globalThis: { __mesBomTransport: recorder } });
  const instance = new C();
  instance._lastId = 0; instance._protocolLogger = () => {};
  let calls = 0;
  instance._transport = { send() { calls++; return 'original-ignored-return'; } };
  assert.equal(instance._rawSend('session', 'Input.insertText', { text: '2' }), 1);
  assert.equal(calls, 1);
  const failure = new Error('PRIVATE');
  instance._transport.send = () => { calls++; throw failure; };
  assert.throws(() => instance._rawSend('session', 'Input.insertText', { text: '2' }), error => error === failure);
  assert.equal(calls, 2);
});

test('key transport records the real Control+A shortcut and a single digit keydown/up pair', () => {
  const recorder = tool.createTransportRecorder();
  recorder.arm(tool.selectInputCase('q3-key'));
  recorder.send({ id: 1, method: 'Input.dispatchKeyEvent', params: { code: 'KeyA', key: 'a', type: 'rawKeyDown', modifiers: 2 } });
  for (const [index, type] of ['keyDown', 'keyUp'].entries()) recorder.send({ id: index + 2, method: 'Input.dispatchKeyEvent', params: { key: '3', type } });
  const events = recorder.export().events;
  assert.equal(events.length, 3);
  assert.equal(events[0].shortcut, 'Control+A');
  assert.deepEqual(events.slice(1).map(row => row.quantity), [3, 3]);
});

test('bounded transport loss and missing boundaries cannot be PASS', () => {
  assert.equal(typeof tool.assessInput, 'function', 'fail-closed assessment is required');
  const selected = tool.selectInputCase('q2-fill');
  assert.equal(tool.assessInput(selected, {}).outcome, 'OBSERVATION_INSUFFICIENT');
  const recorder = tool.createTransportRecorder(2);
  recorder.arm(selected);
  for (let index = 0; index < 3; index++) recorder.mark('fill:needsinput', 2);
  assert.equal(recorder.export().dropped, 1);
});

test('Playwright patch observes actual numeric fill and wire paths without changing original source bytes', () => {
  assert.equal(typeof tool.patchPlaywright, 'function', 'exact in-memory patch is required');
  const file = path.resolve(__dirname, '../../../../frontend/node_modules/playwright-core/lib/coreBundle.js');
  const source = fs.readFileSync(file, 'utf8');
  const patched = tool.patchPlaywright(source);
  assert.equal(patched.receipt.originalSha256, require('./bom-exact-cdp.cjs').sha(source));
  assert.equal(patched.receipt.anchors.length, 5);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  assert.throws(() => tool.patchPlaywright(source.replace('const message = { id, method, params: params2 };', 'const message = {};')), /ANCHOR/);
  new vm.Script(patched.source);
});

test('React points come from the installed development source and require exact target guards', () => {
  assert.equal(typeof tool.buildInputManifest, 'function', 'React development source manifest is required');
  const manifest = tool.buildInputManifest(path.resolve(__dirname, '../../../..'));
  const react = manifest.files.find(row => row.file.endsWith('react-dom-client.development.js'));
  assert.ok(react);
  assert.deepEqual(react.points.map(row => row.label), ['react:tracker-compare', 'react:change-queue', 'react:dispatch-queue', 'react:restore-target']);
  assert.equal(react.points.every(row => row.guard?.includes('shipping-bom-line-controls')), true);
  assert.equal(manifest.files.some(row => row.file.includes('production')), false);
});

test('guarded React breakpoint excludes other inputs and reports unavailable locals as unreadable', () => {
  const { condition, browserRecorder } = require('./bom-exact-cdp.cjs');
  const window = { addEventListener() {} };
  vm.runInNewContext('(' + browserRecorder.toString() + ')()', { window, performance: { now: () => 1, timeOrigin: 1 } });
  const code = condition('react:tracker-compare', '{quantity:2,trackerQuantity:1,changed:true}', 'target');
  vm.runInNewContext(code, { window, target: false });
  assert.equal(window.__mesBomExact.export().events.length, 0);
  vm.runInNewContext(code, { window, target: true });
  assert.equal(window.__mesBomExact.export().events[0].trackerQuantity, 1);
  vm.runInNewContext(code, { window });
  assert.equal(window.__mesBomExact.export().errors, 1);
});

test('a fully linked quantity is qualified once but a missing reply or pause fails closed', () => {
  const selected = tool.selectInputCase('q2-fill');
  const transport = { errors: 0, dropped: 0, pending: 0, events: [
    ...['fill:needsinput', 'keyboard:insertText', 'raw:sendText'].map(kind => ({ kind })),
    { kind: 'wire:send', ordinal: 1, command: 'Input.insertText', quantity: 2 },
    { kind: 'wire:receive', ordinal: 1, ok: true },
  ] };
  const labels = ['react:tracker-compare', 'react:change-queue', 'react:dispatch-queue', 'react:restore-target', 'onChange:quantity', 'updater:updateDraftLine'];
  const evidence = { transport, exact: { errors: 0, dropped: 0, events: labels.map(label => ({ label, readable: true, quantity: 2, patchQuantity: 2 })) },
    native: { dropped: 0, writerTrap: { installed: true, errors: 0, incidentOverflow: 0 }, events: [{ kind: 'native:input:window-bubble', target: { value: 2 } }] },
    match: { status: 200, bodyReadable: true }, matchQuantity: 2, nextStateQuantity: 2, connection: { valid: true }, pauses: [], observerErrors: [] };
  assert.equal(tool.assessInput(selected, evidence).outcome, 'PASS');
  assert.equal(tool.assessInput(selected, { ...evidence, matchQuantity: 1 }).outcome, 'FAIL');
  assert.equal(tool.assessInput(selected, { ...evidence, transport: { ...transport, pending: 1 } }).outcome, 'OBSERVATION_INSUFFICIENT');
  const pause = { diagnosticOnly: true, naturalTimingAfterPause: false, resumed: true, frames: [{ role: 'native-value-writer', primitives: { diagnostic: true, before: 2, after: 1 } }] };
  assert.equal(tool.assessInput(selected, { ...evidence, pauses: [pause] }).outcome, 'WRITER_CAPTURED');
  assert.equal(tool.assessInput(selected, { ...evidence, pauses: [pause], observerErrors: ['PAUSE_PRIMITIVES_UNREADABLE'] }).outcome, 'OBSERVATION_INSUFFICIENT');
  assert.equal(tool.assessInput(selected, { ...evidence, pauses: [{ ...pause, frames: [] }] }).outcome, 'CONDITION_NOT_MET');
});

test('first diagnostic writer pause reads only selected primitives, stops the case, and resumes', async () => {
  assert.equal(typeof tool.createPauseCapture, 'function', 'bounded diagnostic pause capture is required');
  const capture = tool.createPauseCapture();
  const commands = [];
  const session = { async send(method, params) {
    commands.push({ method, params });
    return method === 'Debugger.evaluateOnCallFrame' ? { result: { value: { diagnostic: true, before: 2, after: 1, tracker: 2 } } } : {};
  } };
  const errors = [];
  await capture.onPaused({ callFrames: [{ callFrameId: '1', functionName: 'set' }, { callFrameId: '2', functionName: 'restoreStateOfTarget' }] }, session, code => errors.push(code));
  assert.equal(capture.stopped(), true);
  assert.equal(capture.evidence()[0].naturalTimingAfterPause, false);
  assert.equal(capture.evidence()[0].resumed, true);
  assert.equal(commands.at(-1).method, 'Debugger.resume');
  assert.equal(commands.filter(row => row.method === 'Debugger.evaluateOnCallFrame').length, 2);
  assert.equal(JSON.stringify(commands).includes('getProperties'), false);
  assert.deepEqual(errors, []);
});

test('installer refuses every checkout and any source outside the newly approved synthetic root', () => {
  let installer = {};
  try { installer = require('./install-bom-input-transport.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  assert.equal(typeof installer.validateInputOwnership, 'function', 'new source-only installer guard is required');
  const root = '/home/hw/mes-flaky-input-transport-20261019-154319/source';
  const marker = { source: root, kind: 'synthetic-direct-boundaries', head: '63d4ed59acf223e6cad62b3a360d905825d92021' };
  assert.doesNotThrow(() => installer.validateInputOwnership(root, marker, false));
  assert.throws(() => installer.validateInputOwnership(root, marker, true), /GITLESS/);
  assert.throws(() => installer.validateInputOwnership('/home/hw/mes-flaky-boundaries-20261019-135838/source', { ...marker, source: '/home/hw/mes-flaky-boundaries-20261019-135838/source' }, false), /NEW_APPROVED/);
  assert.throws(() => installer.validateInputOwnership(root, { ...marker, head: '0000000000000000000000000000000000000000' }, false), /IDENTITY/);
});

test('quantity-only native mode ignores PIN events and pauses only at the first destructive numeric write', () => {
  const listeners = new Map();
  class Node {}
  class Element extends Node {
    constructor(quantity = false) { super(); this.quantity = quantity; this.tagName = 'INPUT'; this.isConnected = true; }
    matches(selector) { return this.quantity && selector.includes('shipping-bom-line-controls'); }
    closest(selector) { return selector === '[data-bom-line-child]' ? { getAttribute: () => '11111111-1111-1111-1111-111111111111' } : null; }
    getAttribute() { return '1'; }
  }
  class Input extends Element {}
  class Area extends Element {}
  for (const C of [Input, Area]) Object.defineProperty(C.prototype, 'value', { configurable: true, get() { return this._value ?? '1'; }, set(value) { this._value = String(value); } });
  class Event {}
  const pin = new Input(false), input = new Input(true);
  const window = { __MES_BOM_DIAG_ENABLED__: true, __MES_BOM_VALUE_TRAP__: true, __MES_BOM_QUANTITY_ONLY__: true,
    __MES_BOM_PAUSE_ON_RESET__: true, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); } };
  const document = { hasFocus: () => true, activeElement: pin, visibilityState: 'visible', querySelectorAll: () => [] };
  const source = fs.readFileSync(path.join(__dirname, 'bom-diag-native.js'), 'utf8');
  vm.runInNewContext(source, { window, document, Node, Element, HTMLInputElement: Input, HTMLTextAreaElement: Area, Event,
    performance: { now: () => 10, timeOrigin: 1000 }, queueMicrotask() {}, Error });
  for (const fn of listeners.get('input')) fn({ target: pin });
  assert.equal(window.__mesBomDiag.export().events.some(row => row.kind.startsWith('native:')), false);
  pin.value = 'PRIVATE';
  input.value = '2'; input.value = '1'; input.value = '3'; input.value = '1';
  const snapshot = window.__mesBomDiag.export();
  assert.equal(snapshot.writerTrap.errors, 0);
  assert.equal(snapshot.writerTrap.diagnosticPauses, 1);
  assert.equal(snapshot.incidents.length, 2);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
});

test('tool-only probe bundles installed development React with exact maps and no application API', async () => {
  const root = path.resolve(__dirname, '../../../..');
  const { buildProbe, ENTRY } = require('./bom-input-transport-probe.cjs');
  assert.equal(ENTRY.includes('/api/'), false);
  const built = await buildProbe(path.join(root, 'frontend'));
  const encoded = built.code.match(/sourceMappingURL=data:application\/json;base64,([^\n]+)/)[1];
  const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  const react = tool.buildInputManifest(root).files.find(row => row.file.endsWith('react-dom-client.development.js'));
  for (const point of react.points) assert.doesNotThrow(() => require('./bom-exact-cdp.cjs').resolvePoint(map, react.file, react.content, point.line, point.column));
});

test('tool-only data document can explicitly omit catalog while normal business guard stays enabled', async () => {
  const handlers = new Map();
  const session = { on(name, callback) { handlers.set(name, callback); }, async send() { return {}; }, async detach() {} };
  const page = { context: () => ({ newCDPSession: async () => session }), addInitScript: async () => {} };
  const trace = await require('./bom-exact-cdp.cjs').attachExactTrace(page, { files: [] }, { requireCatalog: false });
  handlers.get('Network.requestWillBeSent')({ type: 'Document', loaderId: 'blank', wallTime: 1, timestamp: 1, request: { method: 'GET', url: 'data:text/html,blank' } });
  await trace.ready([]);
  await trace.close();
  const ordinary = await require('./bom-exact-cdp.cjs').attachExactTrace(page, { files: [] });
  handlers.get('Network.requestWillBeSent')({ type: 'Document', loaderId: 'app', wallTime: 1, timestamp: 1, request: { method: 'GET', url: 'http://localhost:3100/mes' } });
  await assert.rejects(() => ordinary.ready([]), /PREFLIGHT_REFUSED/);
  await ordinary.close();
});

test('CDP match body keeps only UUID numeric primitives for the request after native input', async () => {
  const handlers = new Map();
  const session = { on(name, callback) { handlers.set(name, callback); }, async send() { return {}; }, async detach() {} };
  const page = { context: () => ({ newCDPSession: async () => session }), addInitScript: async () => {} };
  const trace = await require('./bom-exact-cdp.cjs').attachExactTrace(page, { files: [] }, { captureMatchBody: true });
  const id = '11111111-1111-1111-1111-111111111111';
  handlers.get('Network.requestWillBeSent')({ requestId: 'match', wallTime: 2, timestamp: 2, request: { method: 'POST', url: 'http://localhost:3100/api/shipping/bom-match', postData: JSON.stringify({ bom_lines: [{ child_item_id: id, quantity: 2, memo: 'PRIVATE' }], pin: 'PRIVATE' }) } });
  const match = trace.evidence().matches[0];
  assert.equal(match.bodyReadable, true);
  assert.deepEqual(match.lines, [{ item: id, quantity: 2 }]);
  assert.equal(JSON.stringify(match).includes('PRIVATE'), false);
  await trace.close();
});

test('preflight refuses missing failure boundary or snapshot dependency before fixture actions', () => {
  const installer = require('./install-bom-input-transport.cjs');
  assert.equal(typeof installer.preflightInputDependencies, 'function', 'installed helper dependency check is required');
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'bom-input-preflight-'));
  const required = [
    'frontend/tests/e2e/_bom-input-transport.cjs', 'frontend/tests/e2e/_bom-exact-cdp.cjs',
    'frontend/tests/e2e/_bom-diag-native.js', 'frontend/tests/e2e/_bom-input-transport-manifest.json',
    'frontend/tests/e2e/_common-expectations.ts', 'frontend/tests/e2e/_failure-boundary.ts',
    'scripts/dev/mes-flaky-diagnosis/snapshot-db.py',
  ];
  try {
    for (const file of required) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), file.endsWith('_failure-boundary.ts') ? fs.readFileSync(path.join(__dirname, '../failure-boundary.ts')) : 'fixture'); }
    const before = new Map(required.map(file => [file, fs.readFileSync(path.join(root, file))]));
    assert.equal(installer.preflightInputDependencies(root).length, required.length);
    for (const file of required) assert.deepEqual(fs.readFileSync(path.join(root, file)), before.get(file));
    fs.unlinkSync(path.join(root, 'frontend/tests/e2e/_failure-boundary.ts'));
    assert.throws(() => installer.preflightInputDependencies(root), /INPUT_DEPENDENCY_MISSING:frontend\/tests\/e2e\/_failure-boundary.ts/);
    fs.writeFileSync(path.join(root, 'frontend/tests/e2e/_failure-boundary.ts'), before.get('frontend/tests/e2e/_failure-boundary.ts'));
    fs.unlinkSync(path.join(root, 'scripts/dev/mes-flaky-diagnosis/snapshot-db.py'));
    assert.throws(() => installer.preflightInputDependencies(root), /INPUT_DEPENDENCY_MISSING:scripts\/dev\/mes-flaky-diagnosis\/snapshot-db.py/);
  } finally {
    const resolved = fs.realpathSync(root), temp = fs.realpathSync(require('node:os').tmpdir());
    assert.equal(path.dirname(resolved), temp); assert.equal(path.basename(resolved).startsWith('bom-input-preflight-'), true);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
