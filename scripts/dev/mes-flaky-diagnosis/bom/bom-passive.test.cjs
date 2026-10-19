'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tool = require('./bom-input-transport.cjs');

function evidence() {
  return { mode: 'passive', transport: { errors: 0, dropped: 0, pending: 0, events: [
    { kind: 'fill:needsinput', quantity: 2, wallTime: 120 },
    { kind: 'keyboard:insertText', quantity: 2, wallTime: 121 },
    { kind: 'raw:sendText', quantity: 2, wallTime: 122 },
    { kind: 'wire:send', ordinal: 1, command: 'Input.insertText', quantity: 2, wallTime: 123 },
    { kind: 'wire:receive', ordinal: 1, ok: true, wallTime: 125 },
  ] }, native: { document: 100, errors: 0, dropped: 0, writerTrap: { installed: true, errors: 0 }, incidents: [], events: [
    { sequence: 1, time: 1, kind: 'recorder:ready' },
    { sequence: 2, time: 10, kind: 'native:focusin:capture', target: { uid: 7, child: 4, quantity: true, connected: true, value: 1 } },
  ] } };
}
test('healthy acknowledged input without native input/value change is failure evidence, not preparation failure', () => {
  assert.equal(tool.assessInput(tool.selectInputCase('q2-fill'), evidence()).outcome, 'INPUT_FAILURE_EVIDENCE');
});
test('unready, dropped, pending, unidentified, or document-gap evidence stays insufficient', () => {
  const cases = [row => { row.native.events.shift(); }, row => { row.native.dropped = 1; },
    row => { row.transport.pending = 1; }, row => { row.native.events.pop(); },
    row => { row.documentGaps = 1; }, row => { row.native.errors = 1; },
    row => { row.native.document = 200; }, row => { row.transport.events.at(-1).ordinal = 99; }];
  for (const change of cases) { const row = evidence(); change(row);
    assert.equal(tool.assessInput(tool.selectInputCase('q2-fill'), row).outcome, 'OBSERVATION_INSUFFICIENT'); }
});
test('the earlier exact mode also treats missing native/onChange evidence separately from collector loss', () => {
  const row = evidence(); delete row.mode;
  row.exact = { errors: 0, dropped: 0, events: [] };
  row.connection = { valid: true };
  assert.equal(tool.assessInput(tool.selectInputCase('q2-fill'), row).outcome, 'INPUT_FAILURE_EVIDENCE');
  row.native.dropped = 1;
  assert.equal(tool.assessInput(tool.selectInputCase('q2-fill'), row).outcome, 'OBSERVATION_INSUFFICIENT');
});
test('match selection uses start after input and child identity, preserving wrong quantity 1', () => {
  const row = evidence();
  row.native.events.push({ sequence: 3, time: 25.5, kind: 'native:input:window-bubble', target: { uid: 7, child: 4, value: 2 } },
    { sequence: 4, time: 20, kind: 'network:bom-match:request', bodyReadable: true, lines: [{ child: 4, quantity: 1 }] },
    { sequence: 5, time: 26, kind: 'network:bom-match:request', bodyReadable: true, lines: [{ child: 9, quantity: 2 }] },
    { sequence: 6, time: 27, kind: 'network:bom-match:request', bodyReadable: true, lines: [{ child: 4, quantity: 1 }] },
    { sequence: 7, time: 28, kind: 'network:bom-match:response', request: 6, status: 200 });
  const result = tool.assessInput(tool.selectInputCase('q2-fill'), row);
  assert.equal(result.match.quantity, 1);
  assert.equal(result.match.request, 6);
  assert.equal(result.outcome, 'INPUT_FAILURE_EVIDENCE');
});
test('clock-edge focus/input ambiguity never becomes missing-native failure evidence', () => {
  const row = evidence(); row.native.events[1].time = 23.5;
  const result = tool.assessInput(tool.selectInputCase('q2-fill'), row);
  assert.equal(result.outcome, 'OBSERVATION_INSUFFICIENT');
  assert.equal(result.reason, 'clock-ambiguous');
  const inputEdge = evidence();
  inputEdge.native.events.push({ time: 22.5, kind: 'native:input:window-bubble', target: { uid: 7, child: 4, value: 2 } });
  assert.equal(tool.assessInput(tool.selectInputCase('q2-fill'), inputEdge).outcome, 'OBSERVATION_INSUFFICIENT');
});
test('existing protocol hook counts true document replacement but excludes History API navigation', () => {
  const recorder = tool.createTransportRecorder(); recorder.arm(tool.selectInputCase('q2-fill'));
  recorder.receive({ sessionId: 'PRIVATE', method: 'Page.frameNavigated', params: { frame: { id: 'PRIVATE', url: 'PRIVATE' } } });
  recorder.receive({ sessionId: 'PRIVATE', method: 'Page.navigatedWithinDocument', params: { frameId: 'PRIVATE', url: 'PRIVATE' } });
  recorder.send({ sessionId: 'PRIVATE', id: 1, method: 'Input.insertText', params: { text: '2' } });
  recorder.receive({ sessionId: 'PRIVATE', id: 1 });
  assert.equal(typeof tool.passiveDocumentGaps, 'function');
  assert.equal(tool.passiveDocumentGaps(recorder.export(), [{ document: 100 }]), 0);
  recorder.receive({ sessionId: 'PRIVATE', method: 'Page.frameNavigated', params: { frame: { id: 'PRIVATE' } } });
  assert.equal(tool.passiveDocumentGaps(recorder.export(), [{ document: 200 }]), 1);
  assert.equal(tool.passiveDocumentGaps(recorder.export(), [{ document: 100 }, { document: 200 }]), 0);
  assert.doesNotMatch(JSON.stringify(recorder.export()), /PRIVATE/);
});
test('passive runtime import never loads CDP breakpoint helper', () => {
  const filename = path.join(__dirname, 'bom-input-transport.cjs');
  const loaded = [];
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require(name) { loaded.push(name); return require(name); }, module: { exports: {} } });
  assert.equal(loaded.includes('./bom-exact-cdp.cjs'), false);
});
test('passive source installs no debugger, state setter, focus or readiness operation', () => {
  const passive = path.join(__dirname, 'bom-passive-fixture.ts');
  assert.ok(fs.existsSync(passive), 'passive fixture is required');
  const source = fs.readFileSync(passive, 'utf8');
  assert.doesNotMatch(source, /attachInputTrace|attachExactTrace|\.focus\(|waitFor\(|\.fill\(|\.press\(|setDraftLines|PAUSE_ON_RESET__=true/);
});
