'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

/** No default or aliases: prior SSE conditions cannot enter this experiment. */
function selectInputCase(id) {
  if (!/^q[23]-(fill|key)$/.test(id ?? '')) throw new Error('ONE_EXPLICIT_INPUT_TRANSPORT_CASE_REQUIRED');
  return { id, quantity: Number(id[1]), transport: id.slice(3) };
}

/** Synchronous bounded numeric-only observations; never changes an original return/error. */
function createTransportRecorder(capacity = 2048) {
  const ring = new Array(capacity), pending = new Map(), sessions = new Map();
  let selected = null, sequence = 0, errors = 0, serial = 0;
  const put = detail => { ring[sequence++ % capacity] = { sequence, time: performance.now(), wallTime: Date.now(), ...detail }; };
  const numeric = value => value === 2 || value === 3 || value === '2' || value === '3' ? Number(value) : null;
  const sessionToken = value => {
    const key = value ?? '';
    if (!sessions.has(key)) { if (sessions.size >= capacity) { errors++; return null; } sessions.set(key, sessions.size + 1); }
    return sessions.get(key);
  };
  return {
    arm(value) { if (selected) throw new Error('TRANSPORT_ALREADY_ARMED'); selected = selectInputCase(value.id); },
    disarm() { selected = null; },
    mark(kind, quantity) { if (selected && numeric(quantity) === selected.quantity) put({ kind, quantity: selected.quantity }); },
    send(message) {
      if (!selected) return;
      const command = message.method, params = message.params;
      const quantity = command === 'Input.insertText' ? numeric(params?.text)
        : command === 'Input.dispatchKeyEvent' && ['keyDown', 'keyUp'].includes(params?.type) ? numeric(params?.key) : null;
      const shortcut = selected.transport === 'key' && command === 'Input.dispatchKeyEvent' && params?.code === 'KeyA'
        && params.modifiers === 2 && ['rawKeyDown', 'keyDown'].includes(params.type);
      if (quantity !== selected.quantity && !shortcut) return;
      if (pending.size >= capacity) { errors++; return; }
      const ordinal = ++serial;
      pending.set((message.sessionId ?? '') + ':' + message.id, ordinal);
      put({ kind: 'wire:send', ordinal, command, quantity, session: sessionToken(message.sessionId),
        keyType: command === 'Input.dispatchKeyEvent' ? params.type : null, shortcut: shortcut ? 'Control+A' : null });
    },
    receive(message) {
      // Playwright already subscribes to these protocol events. History API emits a different method.
      if (selected && message.method === 'Page.frameNavigated' && message.params?.frame && !message.params.frame.parentId)
        put({ kind: 'document:navigation', session: sessionToken(message.sessionId) });
      const key = (message.sessionId ?? '') + ':' + message.id;
      if (!pending.has(key)) return;
      const ordinal = pending.get(key); pending.delete(key);
      put({ kind: 'wire:receive', ordinal, ok: !message.error,
        errorCode: Number.isInteger(message.error?.code) ? message.error.code : null });
    },
    export() {
      const dropped = Math.max(0, sequence - capacity);
      return { document: performance.timeOrigin, capacity, sequence, dropped, errors, pending: pending.size,
        events: Array.from({ length: Math.min(sequence, capacity) }, (_, index) => ring[(dropped + index) % capacity]) };
    },
  };
}

/** Patch only the loaded module in memory; anchors and the original hash remain evidence. */
function patchPlaywright(original) {
  let source = original;
  const anchors = [];
  const insert = (label, anchor, replacement) => {
    if (source.split(anchor).length !== 2) throw new Error('PLAYWRIGHT_ANCHOR_CHANGED:' + label);
    anchors.push({ label, sha256: sha(anchor) }); source = source.replace(anchor, replacement);
  };
  const hook = 'globalThis.__mesBomTransport';
  insert('fill:needsinput', '          if (result2 === "needsinput") {',
    `          if (result2 === "needsinput") {\n            ${hook}?.mark("fill:needsinput", value2);`);
  insert('keyboard:insertText', '      async insertText(progress2, text2) {\n        await this._raw.sendText(progress2, text2);',
    `      async insertText(progress2, text2) {\n        ${hook}?.mark("keyboard:insertText", text2);\n        await this._raw.sendText(progress2, text2);`);
  insert('raw:sendText', '      async sendText(progress2, text2) {\n        await progress2.race(this._client.send("Input.insertText", { text: text2 }));',
    `      async sendText(progress2, text2) {\n        ${hook}?.mark("raw:sendText", text2);\n        await progress2.race(this._client.send("Input.insertText", { text: text2 }));`);
  if (source.split('        const message = { id, method, params: params2 };').length !== 2) throw new Error('PLAYWRIGHT_ANCHOR_CHANGED:wire-message');
  // Run after the existing protocol logger, immediately before the original transport call.
  const send = '        this._transport.send(message);\n        return id;';
  insert('wire:send', send, `        ${hook}?.send(message);\n${send}`);
  insert('wire:receive', '      async _onMessage(message) {\n        this._protocolLogger("receive", message);\n        if (message.id === kBrowserCloseMessageId)',
    `      async _onMessage(message) {\n        ${hook}?.receive(message);\n        this._protocolLogger("receive", message);\n        if (message.id === kBrowserCloseMessageId)`);
  return { source, receipt: { originalSha256: sha(original), instrumentedSha256: sha(source), anchors,
    mode: 'in-memory-compile-only', originalFileWritten: false } };
}

/** React development locations are derived from the installed source, never a production URL. */
function buildInputManifest(root) {
  const { buildManifest } = require('./bom-exact-cdp.cjs');
  const manifest = buildManifest(root);
  manifest.files = manifest.files.filter(row => row.file.endsWith('/DesktopShippingView.tsx'));
  const file = 'frontend/node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js';
  const raw = fs.readFileSync(path.join(root, file), 'utf8'), content = raw.replace(/\r\n/g, '\n');
  const entry = { file, rawSha256: sha(raw), sha256: sha(content), content, points: [] };
  const target = name => `${name} instanceof HTMLInputElement&&${name}.matches('input[data-testid="shipping-bom-line-controls"]')`;
  const add = (label, anchor, expression, guard, offset = 0) => {
    if (content.split(anchor).length !== 2) throw new Error('REACT_DEV_ANCHOR_CHANGED:' + label);
    const before = content.slice(0, content.indexOf(anchor) + offset);
    entry.points.push({ label, line: before.split('\n').length - 1, column: before.length - before.lastIndexOf('\n') - 1, expression, guard });
  };
  add('react:tracker-compare', '      node = value;\n      return node !== lastValue',
    '{quantity:value,trackerQuantity:lastValue,changed:value!==lastValue}', target('node'));
  add('react:change-queue', '    ) {\n      restoreTarget\n',
    '{quantity:target.value,queueLength:dispatchQueue.length,restoreQuantity:restoreTarget?.value}', target('target'), '    ) {\n      '.length);
  add('react:dispatch-queue', '    function processDispatchQueue(dispatchQueue, eventSystemFlags) {\n',
    '{quantity:dispatchQueue.find(x=>x.event?.target?.matches?.(\'input[data-testid="shipping-bom-line-controls"]\'))?.event?.target?.value,queueLength:dispatchQueue.length}',
    `dispatchQueue.some(x=>${target('x.event?.target')})`, '    function processDispatchQueue(dispatchQueue, eventSystemFlags) {\n'.length);
  add('react:restore-target', '    function restoreStateOfTarget(target) {\n',
    '{quantity:target.value,trackerQuantity:target._valueTracker?.getValue?.(),restoreQuantity:restoreTarget?.value,queueLength:restoreQueue?.length??0}', target('target'),
    '    function restoreStateOfTarget(target) {\n'.length);
  manifest.files.push(entry);
  manifest.inputTransport = { schema: 1, cases: ['q2-fill', 'q2-key', 'q3-key', 'q3-fill'], pauseAfterWrite: true,
    playwrightSha256: sha(fs.readFileSync(path.join(root, 'frontend/node_modules/playwright-core/lib/coreBundle.js'))) };
  return manifest;
}

/** A post-write pause is diagnostic only. Never enumerate scopes or retain arbitrary objects. */
function createPauseCapture() {
  const pauses = [];
  let stopped = false;
  return {
    stopped: () => stopped,
    evidence: () => pauses,
    async onPaused(event, session, fail) {
      stopped = true;
      const row = { diagnosticOnly: true, naturalTimingAfterPause: false, frames: [], resumed: false };
      if (pauses.length) fail('REPEATED_DIAGNOSTIC_PAUSE');
      else pauses.push(row);
      try {
        const frames = event.callFrames ?? [];
        for (const [index, frame] of frames.entries()) {
          if (index !== 0 && !['restoreStateOfTarget', 'updateInput', 'updateValueIfChanged', 'createAndAccumulateChangeEvent', 'processDispatchQueue', 'batchedUpdates$1'].includes(frame.functionName)) continue;
          if (row.frames.length >= 8) { fail('PAUSE_FRAME_OVERFLOW'); break; }
          const expression = index === 0
            ? '({diagnostic:writerTrap.diagnosticPauses===1,before:before?.value,after:after?.value,tracker:before?.tracker})'
            : '(()=>{const n=v=>typeof v==="number"&&Number.isFinite(v)?v:typeof v==="string"&&/^[0-9]+$/.test(v)?Number(v):null;return {quantity:n(typeof target!=="undefined"?target?.value:null),propQuantity:n(typeof props!=="undefined"?props?.value:null),restoreQuantity:n(typeof restoreTarget!=="undefined"?restoreTarget?.value:null),queueLength:typeof restoreQueue!=="undefined"?restoreQueue?.length??0:null};})()';
          const result = await session.send('Debugger.evaluateOnCallFrame', { callFrameId: frame.callFrameId, expression, returnByValue: true, silent: true });
          if (result.exceptionDetails || !result.result?.value || index === 0 && result.result.value.diagnostic !== true) { fail('PAUSE_PRIMITIVES_UNREADABLE'); continue; }
          const primitives = {};
          for (const [key, value] of Object.entries(result.result.value)) if (['diagnostic', 'before', 'after', 'tracker', 'quantity', 'propQuantity', 'restoreQuantity', 'queueLength'].includes(key)
            && (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value))) primitives[key] = value;
          row.frames.push({ role: index === 0 ? 'native-value-writer' : frame.functionName, primitives });
        }
      } catch { fail('PAUSE_CAPTURE_FAILED'); }
      finally {
        try { await session.send('Debugger.resume'); row.resumed = true; }
        catch { fail('RESUME_FAILED'); }
      }
    },
  };
}

async function attachInputTrace(page, manifest, options = {}) {
  const { attachExactTrace } = require('./bom-exact-cdp.cjs');
  const pause = createPauseCapture();
  const trace = await attachExactTrace(page, manifest, { ...options, captureMatchBody: true, onPaused: pause.onPaused });
  return { ...trace, stopped: pause.stopped, pauses: pause.evidence };
}

/** Missing observer boundaries and any evidence loss remain unqualified. */
function assessInput(selected, evidence) {
  if (evidence.mode === 'passive') return assessPassiveInput(selected, evidence);
  const transport = evidence.transport, exact = evidence.exact, native = evidence.native;
  const te = transport?.events ?? [], ee = exact?.events ?? [], ne = native?.events ?? [];
  const hit = label => ee.some(row => row.label === label && row.readable);
  const command = selected.transport === 'fill' ? 'Input.insertText' : 'Input.dispatchKeyEvent';
  const sends = te.filter(row => row.kind === 'wire:send' && row.command === command && row.quantity === selected.quantity);
  const hits = {
    fill: selected.transport !== 'fill' || ['fill:needsinput', 'keyboard:insertText', 'raw:sendText'].every(kind => te.some(row => row.kind === kind)),
    wire: sends.length === (selected.transport === 'fill' ? 1 : 2) && sends.every(row => te.some(reply => reply.kind === 'wire:receive' && reply.ordinal === row.ordinal && reply.ok)),
    selectAll: selected.transport !== 'key' || te.some(row => row.kind === 'wire:send' && row.shortcut === 'Control+A'
      && te.some(reply => reply.kind === 'wire:receive' && reply.ordinal === row.ordinal && reply.ok)),
    native: ne.some(row => row.kind === 'native:input:window-bubble' && row.target?.value === selected.quantity),
    tracker: hit('react:tracker-compare'), changeQueue: hit('react:change-queue'), dispatchQueue: hit('react:dispatch-queue'), restore: hit('react:restore-target'),
    onChange: ee.some(row => row.label === 'onChange:quantity' && row.quantity === selected.quantity && row.readable),
    updater: ee.some(row => row.label === 'updater:updateDraftLine' && row.patchQuantity === selected.quantity && row.readable),
    match: Boolean(evidence.match && evidence.match.status === 200 && evidence.match.bodyReadable && !evidence.match.linesDropped),
    connected: evidence.connection?.valid === true,
    nextState: Number.isFinite(evidence.nextStateQuantity),
  };
  const loss = [transport, exact, native].some(value => !value || value.errors || value.dropped)
    || !native?.writerTrap?.installed || native.writerTrap.errors || native.writerTrap.incidentOverflow
    || transport.pending || evidence.observerErrors?.length;
  const pauses = evidence.pauses ?? [];
  const writer = pauses[0]?.frames?.find(row => row.role === 'native-value-writer')?.primitives;
  const captured = !loss && pauses.length === 1 && pauses[0].resumed === true && pauses[0].naturalTimingAfterPause === false
    && writer?.diagnostic === true && [2, 3].includes(writer.before) && writer.after === 1;
  const qualified = !loss && !pauses.length && Object.values(hits).every(Boolean);
  const inputMissing = !loss && hits.fill && hits.wire && hits.selectAll && hits.connected && (!hits.native || !hits.onChange);
  return { outcome: captured ? 'WRITER_CAPTURED' : loss ? 'OBSERVATION_INSUFFICIENT' : inputMissing ? 'INPUT_FAILURE_EVIDENCE' : !qualified ? 'CONDITION_NOT_MET'
    : evidence.matchQuantity === selected.quantity && evidence.nextStateQuantity === selected.quantity ? 'PASS' : 'FAIL',
    ...(inputMissing ? { causalLayer: 'unclassified' } : {}), hits, loss: Boolean(loss) };
}

/** Passive evidence qualifies input absence only with an acknowledged command and its focused target. */
function assessPassiveInput(selected, evidence) {
  const transport = evidence.transport, native = evidence.native;
  const te = transport?.events ?? [], ne = native?.events ?? [];
  const sends = te.filter(row => row.kind === 'wire:send' && row.command === 'Input.insertText' && row.quantity === selected.quantity);
  const send = sends[0];
  const at = row => native.document + row.time;
  const focused = ne.filter(row => row.kind === 'native:focusin:capture' && row.target?.quantity
    && at(row) <= send?.wallTime + 1).at(-1);
  const target = focused?.target;
  const clockAmbiguous = !!send && (!!focused && Math.abs(at(focused) - send.wallTime) <= 1
    || ne.some(row => row.kind === 'native:input:window-bubble' && row.target?.uid === target?.uid
      && Math.abs(at(row) - send.wallTime) <= 1));
  const ready = ne.find(row => row.kind === 'recorder:ready');
  const loss = !transport || !native || transport.errors || transport.dropped || transport.pending
    || native.errors || native.dropped || !native.writerTrap?.installed || native.writerTrap.errors
    || native.writerTrap.incidentOverflow || evidence.documentGaps || evidence.observerErrors?.length
    || !ready || !send || !Number.isFinite(send.wallTime) || at(ready) > send.wallTime
    || clockAmbiguous
    || !target?.uid || !target.child || !target.connected || sends.length !== 1
    || !te.some(row => row.kind === 'wire:receive' && row.ordinal === send.ordinal && row.ok);
  const sameTarget = row => row.target?.uid === target?.uid && row.target?.child === target?.child;
  const input = ne.find(row => row.kind === 'native:input:window-bubble' && sameTarget(row) && at(row) >= send.wallTime);
  // Exclude an older/default request by its actual start, never by the expected quantity.
  const request = ne.find(row => row.kind === 'network:bom-match:request' && row.bodyReadable
    && at(row) >= (input ? at(input) : send?.wallTime) && row.lines?.some(line => line.child === target?.child));
  const response = request && ne.find(row => row.kind === 'network:bom-match:response' && row.request === request.sequence);
  const match = request ? { request: request.sequence, quantity: request.lines.find(line => line.child === target.child).quantity,
    status: response?.status ?? null } : null;
  const reset = native?.incidents?.find(row => row.trigger?.before?.uid === target?.uid
    && row.trigger.before.value === selected.quantity && row.trigger.after?.value === 1);
  const hits = { ready: !!ready, wire: !!send, target: !!target, native: !!input,
    dom: input?.target.value === selected.quantity, match: match?.status === 200 };
  return { outcome: loss ? 'OBSERVATION_INSUFFICIENT' : reset ? 'WRITER_CAPTURED'
    : request?.linesDropped ? 'OBSERVATION_INSUFFICIENT'
    : !input || input.target.value !== selected.quantity || match && match.quantity !== selected.quantity ? 'INPUT_FAILURE_EVIDENCE'
    : match?.status === 200 ? 'PASS' : 'OBSERVATION_INSUFFICIENT', causalLayer: 'unclassified',
    ...(clockAmbiguous ? { reason: 'clock-ambiguous' } : {}), hits, match, loss: Boolean(loss) };
}

/** Main-frame new-document events, unlike History API navigation, need a retained document ring. */
function passiveDocumentGaps(transport, documents, evicted = 0) {
  const session = transport.events.find(row => row.kind === 'wire:send' && row.command === 'Input.insertText')?.session;
  const replacements = transport.events.filter(row => row.kind === 'document:navigation' && row.session === session).length;
  return Math.max(evicted, replacements - new Set(documents.map(row => row.document)).size);
}

module.exports = { selectInputCase, createTransportRecorder, patchPlaywright, buildInputManifest, assessInput, passiveDocumentGaps, createPauseCapture, attachInputTrace };
