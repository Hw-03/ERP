'use strict';
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const sha = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\r\n/g, '\n');

function selectCase(id) {
  if (!/^q[23]-(after-reload|inflight)$/.test(id ?? '')) throw new Error('one explicit MES_BOM_CASE is required');
  return { id, quantity: Number(id[1]), order: id.slice(3) };
}

function decodeMappings(map) {
  if (map._decoded) return map._decoded;
  if (map.version !== 3 || map.sections) throw new Error('UNSUPPORTED_SOURCE_MAP');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let source = 0, originalLine = 0, originalColumn = 0;
  const output = [];
  for (const [lineNumber, line] of map.mappings.split(';').entries()) {
    let columnNumber = 0;
    for (const segment of line.split(',')) {
      if (!segment) continue;
      const values = []; let value = 0, shift = 0;
      for (const char of segment) {
        const digit = chars.indexOf(char);
        if (digit < 0 || shift > 30) throw new Error('INVALID_SOURCE_MAP');
        value += (digit & 31) * 2 ** shift;
        if (digit & 32) shift += 5;
        else { values.push(value & 1 ? -(value >> 1) : value >> 1); value = 0; shift = 0; }
      }
      if (shift || ![1, 4, 5].includes(values.length)) throw new Error('INVALID_SOURCE_MAP');
      columnNumber += values[0];
      if (values.length > 1) {
        source += values[1]; originalLine += values[2]; originalColumn += values[3];
        output.push({ lineNumber, columnNumber, source, originalLine, originalColumn });
      }
    }
  }
  return output;
}

/** Indexed maps add a section's column offset only to its first generated line. */
function flattenMap(input) {
  if (!input.sections) return input;
  const output = { version: 3, sources: [], sourcesContent: [], mappings: '', _decoded: [] };
  const sourceKeys = new Map();
  function visit(map, lineOffset, columnOffset) {
    if (map.version !== 3) throw new Error('UNSUPPORTED_SOURCE_MAP');
    if (map.sections) {
      for (const section of map.sections) {
        if (!section.map || !Number.isInteger(section.offset?.line) || !Number.isInteger(section.offset?.column) || section.offset.line < 0 || section.offset.column < 0) throw new Error('UNSUPPORTED_INDEXED_SOURCE_MAP');
        visit(section.map, lineOffset + section.offset.line, section.offset.line === 0 ? columnOffset + section.offset.column : section.offset.column);
      }
      return;
    }
    const indices = map.sources.map((name, index) => {
      const source = (map.sourceRoot ?? '') + name;
      const key = source + '\0' + (map.sourcesContent?.[index] ?? '');
      if (!sourceKeys.has(key)) {
        sourceKeys.set(key, output.sources.length); output.sources.push(source); output.sourcesContent.push(map.sourcesContent?.[index] ?? null);
      }
      return sourceKeys.get(key);
    });
    for (const row of decodeMappings(map)) output._decoded.push({ ...row, source: indices[row.source], lineNumber: row.lineNumber + lineOffset, columnNumber: row.columnNumber + (row.lineNumber === 0 ? columnOffset : 0) });
  }
  visit(input, 0, 0);
  output._decoded.sort((a, b) => a.lineNumber - b.lineNumber || a.columnNumber - b.columnNumber);
  return output;
}

function sourceIndex(map, file, expected) {
  const suffix = file.replace(/^frontend\//, '');
  const matches = map.sources.map((source, index) => ({ source: source.replace(/\\/g, '/').split('?')[0], index }))
    .filter(row => row.source === suffix || row.source.endsWith('/' + suffix));
  if (matches.length !== 1) throw new Error('SOURCE_UNRESOLVED: ' + file);
  const index = matches[0].index;
  if (typeof map.sourcesContent?.[index] !== 'string' || normalize(map.sourcesContent[index]) !== normalize(expected)) throw new Error('SOURCE_CONTENT_MISMATCH: ' + file);
  return index;
}

function resolvePoint(map, file, expected, line, column) {
  map = flattenMap(map);
  const source = sourceIndex(map, file, expected);
  const candidates = decodeMappings(map).filter(row => row.source === source && row.originalLine === line && row.originalColumn >= column)
    .sort((a, b) => a.originalColumn - b.originalColumn || a.lineNumber - b.lineNumber || a.columnNumber - b.columnNumber);
  if (!candidates.length) throw new Error('ANCHOR_UNRESOLVED: ' + file + ':' + (line + 1));
  return { lineNumber: candidates[0].lineNumber, columnNumber: candidates[0].columnNumber };
}

function condition(label, expression, guard) {
  const prefix = guard ? `if(${guard})` : '';
  const unreadable = guard ? `try{window.__mesBomExact?.record(${JSON.stringify(label)},()=>{throw 0;});}catch{}` : '';
  return `(()=>{try{${prefix}window.__mesBomExact?.record(${JSON.stringify(label)},()=>(${expression}));}catch{${unreadable}}return false;})()`;
}

function classify(selected, evidence) {
  const { save, start, done, fill, blur, next, applied, matchQuantity, errors, dropped } = evidence;
  if ([save, start, done, fill, next, applied].some(value => !Number.isFinite(value)) || errors || dropped) return 'CONDITION_NOT_MET';
  const met = selected.order === 'after-reload'
    ? Number.isFinite(blur) && fill <= blur && blur < save && save <= start && start <= done && done <= applied && applied < next
    : save <= start && start <= fill && fill < next && fill < done;
  if (!met) return 'CONDITION_NOT_MET';
  return matchQuantity === selected.quantity ? 'PASS' : 'FAIL';
}

function validity(selected, a, b, nativeA, nativeB, save) {
  const events = a?.events ?? [], other = b?.events ?? [];
  const hits = {
    onChange: events.some(event => event.label === 'onChange:quantity' && event.readable && event.quantity === selected.quantity),
    updateDraftLine: events.some(event => event.label === 'updateDraftLine:call' && event.readable && event.patchQuantity === selected.quantity),
    updater: events.some(event => event.label === 'updater:updateDraftLine' && event.readable && event.patchQuantity === selected.quantity),
    realtime: events.some(event => event.label === 'realtime:publish' && event.readable && a.document + event.time >= save
      && events.some(snapshot => snapshot.label === 'realtime:snapshot' && snapshot.source === 'sse' && snapshot.revision === event.revision && a.document + snapshot.time >= save && snapshot.time <= event.time)),
    memoUi: other.some(event => event.label === 'memo:onChange' && event.readable),
  };
  const errors = [a, b].reduce((total, value) => total + (value?.errors ?? 1), 0)
    + [nativeA, nativeB].reduce((total, value) => total + (value?.writerTrap?.errors ?? 1) + (value?.writerTrap?.installed ? 0 : 1), 0);
  const dropped = [a, b, nativeA, nativeB].reduce((total, value) => total + (value?.dropped ?? 1), 0)
    + [nativeA, nativeB].reduce((total, value) => total + (value?.writerTrap?.incidentOverflow ?? 1), 0);
  return { valid: !errors && !dropped && Object.values(hits).every(Boolean), errors, dropped, hits };
}

function auditPreparationAborts(network, currentLoader) {
  return network.filter(row => row.preparationAbort).map(row => {
    const successor = network.find(next => next.ordinal > row.ordinal && next.loader === row.loader && next.status === 200 && Number.isFinite(next.done));
    const previousDocument = Boolean(row.loader && currentLoader && row.loader !== currentLoader);
    return { ordinal: row.ordinal, covered: previousDocument || Boolean(successor), successor: successor?.ordinal ?? null,
      classification: previousDocument ? 'preparation-abort-before-current-document' : successor ? 'preparation-abort-with-successor' : 'uncovered-preparation-abort', cause: 'unresolved' };
  });
}

function browserRecorder() {
  const capacity = 8192, ring = new Array(capacity);
  const catalogs = new WeakMap(); let catalogSerial = 0;
  let sequence = 0, errors = 0;
  const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value
    : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
  const id = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  const lines = value => Array.isArray(value) ? value.slice(0, 64).map(line => ({ item: id(line.child_item_id), quantity: numeric(line.quantity) })) : null;
  window.__mesBomExact = {
    record(label, read) {
      let detail = { readable: false };
      try {
        const raw = read(); detail = { readable: true };
        for (const key of ['quantity', 'patchQuantity', 'step', 'generation', 'revision', 'count', 'trackerQuantity', 'restoreQuantity', 'queueLength']) if (key in raw) detail[key] = numeric(raw[key]);
        if ('changed' in raw) detail.changed = typeof raw.changed === 'boolean' ? raw.changed : null;
        for (const key of ['lines', 'previous', 'next']) if (key in raw) detail[key] = lines(raw[key]);
        if ('item' in raw) detail.item = id(raw.item);
        if ('source' in raw) detail.source = raw.source === 'sse' ? 'sse' : raw.source === 'get' ? 'get' : null;
        if (Array.isArray(raw.catalog)) {
          if (!catalogs.has(raw.catalog)) catalogs.set(raw.catalog, ++catalogSerial);
          detail.catalog = catalogs.get(raw.catalog);
        }
      } catch { errors += 1; }
      ring[sequence++ % capacity] = { sequence, time: performance.now(), label, ...detail };
    },
    export() {
      const dropped = Math.max(0, sequence - capacity);
      return { document: performance.timeOrigin, capacity, sequence, dropped, errors,
        events: Array.from({ length: Math.min(sequence, capacity) }, (_, index) => ring[(dropped + index) % capacity]) };
    },
  };
  window.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.matches('input[data-testid="shipping-bom-line-controls"]')) {
      window.__mesBomExact.record('action:input', () => ({ quantity: numeric(event.target.value) }));
    }
  }, { passive: true });
  window.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('[data-testid="shipping-wizard-next"]')) window.__mesBomExact.record('action:next', () => ({}));
    if (event.target instanceof Element && event.target.closest('button')?.textContent?.trim() === '저장') window.__mesBomExact.record('action:save', () => ({}));
  }, { capture: true, passive: true });
}

const fields = {
  render: '{lines:draftLines,step:requestWizardStep,catalog:items}',
  draft: '{lines:typeof draftLines==="undefined"?null:draftLines,step:typeof requestWizardStep==="undefined"?null:requestWizardStep}',
};

function buildManifest(root) {
  const files = [
    'frontend/app/mes/_components/DesktopShippingView.tsx',
    'frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemStockPurchaseFields.tsx',
    'frontend/lib/queries/realtime.tsx',
  ];
  const entries = files.map(file => { const raw = fs.readFileSync(path.join(root, file), 'utf8'); return { file, content: normalize(raw), rawSha256: sha(raw), sha256: sha(normalize(raw)), points: [] }; });
  function add(entry, label, anchor, expression, occurrence = 0, offset = 0) {
    let at = -1;
    for (let index = 0; index <= occurrence; index++) { at = entry.content.indexOf(anchor, at + 1); if (at < 0) throw new Error('SOURCE_ANCHOR_MISSING: ' + label); }
    at += offset;
    const before = entry.content.slice(0, at), line = before.split('\n').length - 1, column = before.length - before.lastIndexOf('\n') - 1;
    entry.points.push({ label, line, column, expression });
  }
  const shipping = entries[0];
  add(shipping, 'render:draft', 'const [matchResult, setMatchResult]', fields.render);
  const labels = ['returnHome', 'url:existing', 'url:new', 'clearDraft', 'loadRequest', 'default:empty', 'default:loaded', 'updateDraftLine', 'addDraftLine', 'removeDraftLine'];
  if ((shipping.content.match(/setDraftLines\(/g) || []).length !== labels.length) throw new Error('DRAFT_WRITER_INVENTORY_CHANGED');
  labels.forEach((label, index) => add(shipping, 'enqueue:' + label, 'setDraftLines(', fields.draft, index));
  add(shipping, 'updateDraftLine:call', 'setDraftLines((prev) => prev.map', '{patchQuantity:patch.quantity,lines:draftLines}');
  add(shipping, 'updater:updateDraftLine', 'prev.map((line) => (line.key === key', '{previous:prev,patchQuantity:patch.quantity}', 0);
  add(shipping, 'onChange:quantity', 'onUpdate(line.key, { quantity: toNumber(event.target.value) })', '{quantity:Number(event.target.value),item:line.child_item_id}');
  add(shipping, 'default:loaded', 'setDraftLines(lines);', '{next:lines,generation}');
  add(shipping, 'enqueue:catalogItems', 'setItems(nextItems);', '{count:nextItems.length,generation,lines:draftLines,catalog:nextItems}', 1);
  add(shipping, 'url:restore', 'const draftMatchesUrl =', fields.draft);
  add(shipping, 'match:request', 'api.matchShippingBom({ base_pf_item_id: basePfId, bom_lines: bomLines })', '{lines:bomLines,item:basePfId}');
  add(shipping, 'match:ensureReady', 'const result = await api.matchShippingBom({\n', '{lines:draftLines,item:basePfId}', 0);
  // prepare-02 CDP returned no executable locations for this unconsumed declaration.
  // A new consumer invalidates this exclusion instead of silently skipping a live path.
  const manualDeclaration = 'async function matchBom()';
  if ((shipping.content.match(/\bmatchBom\b/g) ?? []).length !== 1 || !shipping.content.includes(manualDeclaration)) throw new Error('UNUSED_MANUAL_MATCH_EXCLUSION_CHANGED');
  shipping.exclusions = [{ label: 'match:manual', identifier: 'matchBom', references: 1,
    sourceLine: shipping.content.slice(0, shipping.content.indexOf(manualDeclaration)).split('\n').length, reason: 'declaration-has-no-consumer' }];
  add(entries[1], 'memo:onChange', 'setForm((current) => ({ ...current, purchase_memo: value }));', '{}');
  add(entries[2], 'realtime:publish', 'if (!disposed) setRevision(nextRevision);', '{revision:nextRevision}');
  add(entries[2], 'realtime:snapshot', 'if (origin === "sse") sseEpoch += 1;', '{revision:snapshot.revision,source:origin}');
  return { schema: 1, files: entries };
}

/** CDP commands only inspect source and install always-false breakpoints. No Fetch domain. */
async function attachExactTrace(page, manifest, options = {}) {
  const session = await page.context().newCDPSession(page), scripts = new Map(), resolved = new Map();
  const errors = [], hashes = [], installed = [], pending = new Set(), resolutions = [];
  const network = [], catalog = new Map(), waiters = new Set(), matches = [], matchRequests = new Map(), matchWaiters = new Set();
  let clockOffset = null;
  let epoch = 0;
  let phase = 'preparation', documentLoader = null, resolutionDropped = 0;
  const fail = code => { if (errors.length < 32) errors.push(code); };
  const handle = async event => {
    const contextEpoch = epoch;
    if (!event.sourceMapURL || !event.url || !(event.url.includes('/_next/') || event.url.includes('webpack-internal:'))) return;
    try {
      let mapText;
      if (event.sourceMapURL.startsWith('data:')) {
        const comma = event.sourceMapURL.indexOf(',');
        mapText = /;base64,/.test(event.sourceMapURL) ? Buffer.from(event.sourceMapURL.slice(comma + 1), 'base64').toString('utf8') : decodeURIComponent(event.sourceMapURL.slice(comma + 1));
      } else {
        const url = new URL(event.sourceMapURL, event.url);
        if (url.origin !== new URL(page.url()).origin || !url.pathname.startsWith('/_next/')) return;
        const response = await page.request.get(url.href);
        if (!response.ok()) return;
        mapText = await response.text();
      }
      const map = flattenMap(JSON.parse(mapText));
      if (contextEpoch !== epoch) return;
      for (const entry of manifest.files) {
        const suffix = entry.file.replace(/^frontend\//, '');
        if (!map.sources?.some(value => value.split('?')[0].endsWith('/' + suffix))) continue;
        sourceIndex(map, entry.file, entry.content);
        if (resolved.has(entry.file)) { if (resolved.get(entry.file) !== event.scriptId) fail('DUPLICATE_SOURCE_SCRIPT:' + entry.file); continue; }
        const generated = await session.send('Debugger.getScriptSource', { scriptId: event.scriptId });
        if (contextEpoch !== epoch) return;
        const source = sourceIndex(map, entry.file, entry.content), rows = decodeMappings(map);
        const locations = [], grouped = new Map();
        for (const point of entry.points) {
          const mapped = resolvePoint(map, entry.file, entry.content, point.line, point.column);
          const possible = await session.send('Debugger.getPossibleBreakpoints', { start: { scriptId: event.scriptId, ...mapped }, end: { scriptId: event.scriptId, lineNumber: mapped.lineNumber + 1, columnNumber: 0 }, restrictToFunction: false });
          const mappedCandidates = possible.locations.map(location => {
            const preceding = rows.filter(row => row.lineNumber === location.lineNumber && row.columnNumber <= location.columnNumber).at(-1);
            return { line: location.lineNumber + 1, column: location.columnNumber, sameSource: preceding?.source === source, originalLine: preceding ? preceding.originalLine + 1 : null, originalColumn: preceding?.originalColumn ?? null };
          });
          if (resolutions.length < 256) resolutions.push({ file: entry.file, label: point.label, epoch: contextEpoch, originalLine: point.line + 1, originalColumn: point.column, mappedLine: mapped.lineNumber + 1, mappedColumn: mapped.columnNumber, candidates: mappedCandidates.slice(0, 32), candidatesDropped: Math.max(0, mappedCandidates.length - 32) });
          else { resolutionDropped += 1; fail('RESOLUTION_BUFFER_OVERFLOW'); }
          const candidate = possible.locations.find(location => {
            const preceding = rows.filter(row => row.lineNumber === location.lineNumber && row.columnNumber <= location.columnNumber).at(-1);
            return preceding?.source === source && preceding.originalLine === point.line;
          });
          if (!candidate) throw new Error('BREAKPOINT_LOCATION_UNRESOLVED:' + point.label);
          const key = candidate.lineNumber + ':' + candidate.columnNumber;
          if (!grouped.has(key)) grouped.set(key, { location: candidate, conditions: [] });
          grouped.get(key).conditions.push(condition(point.label, point.expression, point.guard));
          locations.push({ label: point.label, originalLine: point.line + 1, originalColumn: point.column, generatedLine: candidate.lineNumber + 1, generatedColumn: candidate.columnNumber });
        }
        for (const group of grouped.values()) {
          const result = await session.send('Debugger.setBreakpoint', { location: group.location, condition: group.conditions.map(value => '(' + value + ')').join('||') });
          installed.push(result.breakpointId);
          if (result.actualLocation.lineNumber !== group.location.lineNumber || result.actualLocation.columnNumber !== group.location.columnNumber) throw new Error('BREAKPOINT_MOVED');
        }
        resolved.set(entry.file, event.scriptId);
        hashes.push({ file: entry.file, sourceSha256: entry.sha256, rawSourceSha256: entry.rawSha256, sourceMapSha256: sha(mapText), bundleSha256: sha(generated.scriptSource), cdpHash: event.hash, locations, exclusions: entry.exclusions ?? [] });
      }
    } catch (error) { fail(String(error.message).split('\n')[0].slice(0, 180)); }
  };
  session.on('Debugger.scriptParsed', event => {
    scripts.set(event.scriptId, { url: event.url });
    const work = handle(event).finally(() => pending.delete(work)); pending.add(work);
  });
  session.on('Runtime.executionContextsCleared', () => { epoch += 1; resolved.clear(); });
  session.on('Network.requestWillBeSent', event => {
    clockOffset = event.wallTime * 1000 - event.timestamp * 1000;
    if (event.type === 'Document') documentLoader = event.loaderId;
    let url; try { url = new URL(event.request.url); } catch { return; }
    if (event.request.method === 'POST' && url.pathname === '/api/shipping/bom-match') {
      if (matches.length >= 256) { fail('MATCH_BUFFER_OVERFLOW'); return; }
      const row = { start: event.wallTime * 1000, ordinal: matches.length + 1, requestIdSha256: sha(event.requestId) };
      if (options.captureMatchBody) {
        row.bodyReadable = false;
        try {
          const body = JSON.parse(event.request.postData);
          if (Array.isArray(body.bom_lines)) {
            row.bodyReadable = true; row.linesDropped = Math.max(0, body.bom_lines.length - 64);
            row.lines = body.bom_lines.slice(0, 64).map(line => ({
              item: typeof line.child_item_id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(line.child_item_id) ? line.child_item_id : null,
              quantity: typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? line.quantity : null,
            }));
          }
        } catch {}
      }
      matches.push(row); matchRequests.set(event.requestId, row); return;
    }
    if (event.request.method !== 'GET' || url.pathname !== '/api/items' || url.search !== '?limit=2000') return;
    if (network.length >= 256) { fail('NETWORK_BUFFER_OVERFLOW'); return; }
    const row = { ordinal: network.length + 1, start: event.wallTime * 1000, loader: event.loaderId, phase };
    network.push(row); catalog.set(event.requestId, row);
    for (const waiter of waiters) if (row.ordinal > waiter.after) { clearTimeout(waiter.timer); waiters.delete(waiter); waiter.resolve(row); }
  });
  session.on('Network.responseReceived', event => { const row = catalog.get(event.requestId) ?? matchRequests.get(event.requestId); if (row) row.status = event.response.status; });
  session.on('Network.loadingFinished', event => {
    const row = catalog.get(event.requestId) ?? matchRequests.get(event.requestId);
    if (row) row.done = event.timestamp * 1000 + clockOffset;
    if (matchRequests.has(event.requestId)) for (const waiter of matchWaiters) if (row.start >= waiter.after) { clearTimeout(waiter.timer); matchWaiters.delete(waiter); waiter.resolve(row); }
  });
  session.on('Network.loadingFailed', event => {
    const row = catalog.get(event.requestId);
    if (!row) return;
    row.canceled = event.canceled === true;
    row.phaseAtFailure = phase; row.documentLoaderAtFailure = documentLoader;
    row.errorText = /^net::[A-Z_]+$/.test(event.errorText ?? '') ? event.errorText : null;
    row.errorTextSha256 = sha(event.errorText ?? '');
    if (phase === 'preparation' && row.phase === 'preparation' && event.canceled === true && event.errorText === 'net::ERR_ABORTED') row.preparationAbort = true;
    else fail('CATALOG_NETWORK_FAILED');
  });
  session.on('Debugger.paused', event => {
    if (options.onPaused) { void options.onPaused(event, session, fail); return; }
    fail('UNEXPECTED_DEBUGGER_PAUSE'); void session.send('Debugger.resume').catch(() => fail('RESUME_FAILED'));
  });
  await page.addInitScript({ content: '(' + browserRecorder.toString() + ')();' });
  await session.send('Runtime.enable');
  await session.send('Network.enable');
  await session.send('Debugger.enable');
  return {
    beginCase() {
      if (auditPreparationAborts(network, documentLoader).some(row => !row.covered)) throw new Error('UNCOVERED_PREPARATION_ABORT');
      phase = 'case';
    },
    waitForMatchAfter(after) {
      const settled = matches.filter(row => row.start >= after && Number.isFinite(row.done)).at(-1);
      if (settled) return Promise.resolve(settled);
      return new Promise((resolve, reject) => {
        const waiter = { after, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => { matchWaiters.delete(waiter); reject(new Error('CONDITION_NOT_MET: match after input did not settle')); }, 10_000);
        matchWaiters.add(waiter);
      });
    },
    waitForCatalogAfter(after) {
      if (network.length > after) return Promise.resolve(network[after]);
      return new Promise((resolve, reject) => {
        const waiter = { after, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => { waiters.delete(waiter); reject(new Error('CONDITION_NOT_MET: natural followup catalog request absent')); }, 10_000);
        waiters.add(waiter);
      });
    },
    async ready(files) {
      await Promise.all([...pending]);
      const missing = files.filter(file => !resolved.has(file));
      const preparationAborts = auditPreparationAborts(network, documentLoader);
      const latestCatalog = network.filter(row => row.loader === documentLoader).at(-1);
      const currentCatalogReady = options.requireCatalog === false || !documentLoader || latestCatalog?.status === 200 && Number.isFinite(latestCatalog?.done);
      if (errors.length || missing.length || preparationAborts.some(row => !row.covered) || !currentCatalogReady) throw new Error('EXACT_SOURCE_PREFLIGHT_REFUSED:' + JSON.stringify({ errors, missing, preparationAborts, currentCatalogReady }));
    },
    evidence() { return { hashes, errors: [...errors], network, preparationAborts: auditPreparationAborts(network, documentLoader), matches, resolutions, resolutionDropped, parsedScripts: scripts.size, installed: installed.length }; },
    async close() { for (const waiter of [...waiters, ...matchWaiters]) { clearTimeout(waiter.timer); waiter.reject(new Error('OBSERVER_CLOSED')); } waiters.clear(); matchWaiters.clear(); await Promise.all([...pending]); await session.detach(); },
  };
}

module.exports = { selectCase, resolvePoint, condition, classify, browserRecorder, buildManifest, attachExactTrace, sha, flattenMap, validity, auditPreparationAborts };
