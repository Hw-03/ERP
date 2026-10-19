const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
let tools = {};
try { tools = require('./bom-exact-cdp.cjs'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }

test('only four predeclared cases are accepted, with no default', () => {
  assert.equal(typeof tools.selectCase, 'function', 'case guard is required');
  assert.deepEqual(tools.selectCase('q2-after-reload'), { id: 'q2-after-reload', quantity: 2, order: 'after-reload' });
  assert.equal(tools.selectCase('q3-inflight').quantity, 3);
  for (const invalid of [undefined, '', 'q4-inflight', 'q2-response-release']) assert.throws(() => tools.selectCase(invalid));
});

test('mapping refuses missing exact source content and absent anchor mappings', () => {
  assert.equal(typeof tools.resolvePoint, 'function', 'exact map resolver is required');
  const map = { version: 3, sources: ['webpack://x/./a.tsx'], sourcesContent: ['alpha\npoint();'], names: [], mappings: 'AAAA;AACA' };
  assert.deepEqual(tools.resolvePoint(map, 'a.tsx', 'alpha\npoint();', 1, 0), { lineNumber: 1, columnNumber: 0 });
  assert.throws(() => tools.resolvePoint(map, 'a.tsx', 'changed', 1, 0), /SOURCE_CONTENT_MISMATCH/);
  assert.throws(() => tools.resolvePoint(map, 'a.tsx', 'alpha\npoint();', 4, 0), /UNRESOLVED/);
});

test('multiline match trace anchors the executable statement before transformed imports', () => {
  const root = path.resolve(__dirname, '../../../..');
  const source = tools.buildManifest(root).files[0];
  for (const label of ['match:ensureReady']) {
    const point = source.points.find(value => value.label === label);
    assert.equal(source.content.split('\n')[point.line].slice(point.column).startsWith('const result = await api.matchShippingBom({'), true);
  }
  assert.equal(source.points.some(point => point.label === 'match:manual'), false);
  assert.deepEqual(source.exclusions, [{ label: 'match:manual', identifier: 'matchBom', references: 1, sourceLine: 1511, reason: 'declaration-has-no-consumer' }]);
});

test('preparation abort remains unexplained unless a later successful catalog replaces it', () => {
  assert.equal(typeof tools.auditPreparationAborts, 'function', 'preparation abort audit is required');
  const aborted = { ordinal: 1, loader: 'same', preparationAbort: true };
  assert.equal(tools.auditPreparationAborts([aborted], 'same')[0].covered, false);
  const successor = { ordinal: 2, loader: 'same', status: 200, done: 1200 };
  const covered = tools.auditPreparationAborts([aborted, successor], 'same')[0];
  assert.equal(covered.covered, true);
  assert.equal(covered.classification, 'preparation-abort-with-successor');
  assert.equal(covered.cause, 'unresolved');
});

test('indexed source maps compose nested line/column offsets exactly', () => {
  assert.equal(typeof tools.flattenMap, 'function', 'indexed source map support is required');
  const leaf = { version: 3, sources: ['/a.tsx'], sourcesContent: ['first\nsecond'], names: [], mappings: 'AAAA;AACA' };
  const indexed = { version: 3, sections: [{ offset: { line: 2, column: 5 }, map: { version: 3, sections: [{ offset: { line: 0, column: 7 }, map: leaf }] } }] };
  assert.deepEqual(tools.resolvePoint(indexed, 'a.tsx', 'first\nsecond', 0, 0), { lineNumber: 2, columnNumber: 12 });
  assert.deepEqual(tools.resolvePoint(indexed, 'a.tsx', 'first\nsecond', 1, 0), { lineNumber: 3, columnNumber: 0 });
});

test('condition is false even if recorder is absent, throws, or lexical variables are missing', () => {
  assert.equal(typeof tools.condition, 'function', 'non-pausing condition is required');
  const expression = tools.condition('render', '{ quantity: missingState.quantity }');
  assert.equal(vm.runInNewContext(expression, { window: {} }), false);
  assert.equal(vm.runInNewContext(expression, { window: { __mesBomExact: { record() { throw new Error('fail'); } } } }), false);
});

test('order miss is CONDITION_NOT_MET and cannot become PASS', () => {
  assert.equal(typeof tools.classify, 'function', 'order classifier is required');
  const base = { save: 10, start: 11, done: 20, fill: 12, blur: 9, next: 15, applied: 20, matchQuantity: 2, errors: 0, dropped: 0 };
  assert.equal(tools.classify(tools.selectCase('q2-inflight'), base), 'PASS');
  assert.equal(tools.classify(tools.selectCase('q2-inflight'), { ...base, done: 11.5 }), 'CONDITION_NOT_MET');
  assert.equal(tools.classify(tools.selectCase('q2-inflight'), { ...base, matchQuantity: 1 }), 'FAIL');
  assert.equal(tools.classify(tools.selectCase('q2-after-reload'), { ...base, fill: 8, next: 21 }), 'PASS');
  assert.equal(tools.classify(tools.selectCase('q2-after-reload'), { ...base, fill: 8, next: 19 }), 'CONDITION_NOT_MET');
  assert.equal(tools.classify(tools.selectCase('q2-after-reload'), { ...base, fill: 8, next: 21, blur: undefined }), 'CONDITION_NOT_MET');
});

test('labels resolving to one executable location share one non-pausing breakpoint', async () => {
  const handlers = new Map(), breakpoints = [];
  const map = { version: 3, sources: ['/app/one.tsx'], sourcesContent: ['point();'], names: [], mappings: 'AAAA' };
  const session = {
    on(name, callback) { handlers.set(name, callback); },
    async send(command, params) {
      if (command === 'Debugger.enable') handlers.get('Debugger.scriptParsed')({ scriptId: '1', url: 'webpack-internal:///app/one.tsx', hash: 'cdp', sourceMapURL: 'data:application/json;base64,' + Buffer.from(JSON.stringify(map)).toString('base64') });
      if (command === 'Debugger.getScriptSource') return { scriptSource: 'point();' };
      if (command === 'Debugger.getPossibleBreakpoints') return { locations: [{ scriptId: '1', lineNumber: 0, columnNumber: 0 }] };
      if (command === 'Debugger.setBreakpoint') {
        if (breakpoints.length) throw new Error('Breakpoint at specified location already exists');
        breakpoints.push(params); return { breakpointId: '1', actualLocation: params.location };
      }
      return {};
    },
    async detach() {},
  };
  const page = { context: () => ({ newCDPSession: async () => session }), addInitScript: async () => {}, url: () => 'http://localhost:3100/mes' };
  const trace = await tools.attachExactTrace(page, { files: [{ file: 'frontend/app/one.tsx', content: 'point();', points: [{ label: 'a', line: 0, column: 0, expression: '{}' }, { label: 'b', line: 0, column: 0, expression: '{}' }] }] });
  await trace.ready(['frontend/app/one.tsx']);
  assert.equal(breakpoints.length, 1);
  const seen = [];
  assert.equal(vm.runInNewContext(breakpoints[0].condition, { window: { __mesBomExact: { record(label) { seen.push(label); } } } }), false);
  assert.deepEqual(seen, ['a', 'b']);
  assert.equal(typeof trace.waitForCatalogAfter, 'function', 'CDP request event promise is required');
  const requestStarted = trace.waitForCatalogAfter(0);
  handlers.get('Network.requestWillBeSent')({ requestId: 'get1', loaderId: 'initial-document', wallTime: 10, timestamp: 9, request: { method: 'GET', url: 'http://localhost:3100/api/items?limit=2000' } });
  const catalog = await requestStarted;
  assert.equal(catalog.start, 10000);
  assert.equal(catalog.done, undefined, 'must resolve before response or completion');
  handlers.get('Network.requestWillBeSent')({ requestId: 'navigation', type: 'Document', loaderId: 'next-document', request: { method: 'GET', url: 'http://localhost:3100/mes' }, wallTime: 10.001, timestamp: 9.001 });
  handlers.get('Network.loadingFailed')({ requestId: 'get1', canceled: true, errorText: 'net::ERR_ABORTED' });
  assert.deepEqual(trace.evidence().errors, [], 'known preparation navigation cancellation must not contaminate case errors');
  trace.beginCase();
  handlers.get('Network.requestWillBeSent')({ requestId: 'get-case', loaderId: 'next-document', wallTime: 10.001, timestamp: 9.001, request: { method: 'GET', url: 'http://localhost:3100/api/items?limit=2000' } });
  handlers.get('Network.loadingFailed')({ requestId: 'get-case', canceled: true, errorText: 'net::ERR_ABORTED' });
  assert.deepEqual(trace.evidence().errors, ['CATALOG_NETWORK_FAILED'], 'case cancellation must remain invalid');
  const matchSettled = trace.waitForMatchAfter(10001);
  handlers.get('Network.requestWillBeSent')({ requestId: 'match1', wallTime: 10.002, timestamp: 9.002, request: { method: 'POST', url: 'http://localhost:3100/api/shipping/bom-match' } });
  handlers.get('Network.responseReceived')({ requestId: 'match1', response: { status: 200 } });
  handlers.get('Network.loadingFinished')({ requestId: 'match1', timestamp: 9.003 });
  assert.equal((await matchSettled).status, 200);
  await trace.close();
});

test('installer requires the exact owned source marker and rejects git checkouts', () => {
  const installer = require('./install-bom-concurrent.cjs');
  assert.equal(typeof installer.validateOwnership, 'function', 'owned export guard is required');
  assert.doesNotThrow(() => installer.validateOwnership('/owned/source', { source: '/owned/source' }, false));
  assert.throws(() => installer.validateOwnership('/owned/source', { source: '/other' }, false), /OWNED_SOURCE/);
  assert.throws(() => installer.validateOwnership('/owned/source', { source: '/owned/source' }, true), /GITLESS/);
  assert.throws(() => installer.validateOwnership('C:\\ERP', { source: 'C:\\ERP' }, false), /GITLESS/);
});

test('browser ring keeps only bounded numeric quantities and UUID item identities', () => {
  const window = { addEventListener() {} };
  vm.runInNewContext('(' + tools.browserRecorder.toString() + ')()', { window, performance: { now: () => 10, timeOrigin: 1000 } });
  const id = '11111111-1111-1111-1111-111111111111';
  window.__mesBomExact.record('safe', () => ({ quantity: '2', item: id, purchase_memo: 'PRIVATE', cookie: 'PRIVATE', lines: [{ child_item_id: id, quantity: 3, notes: 'PRIVATE' }] }));
  let snapshot = window.__mesBomExact.export();
  assert.equal(snapshot.events[0].quantity, 2);
  assert.equal(snapshot.events[0].lines[0].quantity, 3);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
  for (let index = 0; index < 8193; index++) window.__mesBomExact.record('safe', () => ({ quantity: index }));
  snapshot = window.__mesBomExact.export();
  assert.equal(snapshot.events.length, 8192);
  assert.equal(snapshot.dropped, 2);
  window.__mesBomExact.record('unreadable', () => { throw new Error('PRIVATE'); });
  snapshot = window.__mesBomExact.export();
  assert.equal(snapshot.errors, 1);
  assert.equal(JSON.stringify(snapshot).includes('PRIVATE'), false);
});

test('a missing runtime updater hit or native writer error invalidates evidence', () => {
  assert.equal(typeof tools.validity, 'function', 'actual-hit validity gate is required');
  const selected = tools.selectCase('q2-inflight');
  const exact = { document: 1000, errors: 0, dropped: 0, events: [
    { label: 'onChange:quantity', quantity: 2, readable: true },
    { label: 'updateDraftLine:call', patchQuantity: 2, readable: true },
    { label: 'updater:updateDraftLine', patchQuantity: 2, readable: true },
    { label: 'realtime:snapshot', source: 'sse', revision: 2, time: 19, readable: true },
    { label: 'realtime:publish', revision: 2, time: 20, readable: true },
  ] };
  const other = { errors: 0, dropped: 0, events: [{ label: 'memo:onChange', readable: true }] };
  const native = { dropped: 0, writerTrap: { installed: true, errors: 0, incidentOverflow: 0 } };
  assert.equal(tools.validity(selected, exact, other, native, native, 1010).valid, true);
  assert.equal(tools.validity(selected, { ...exact, events: exact.events.filter(event => !event.label.startsWith('updater:')) }, other, native, native, 1010).valid, false);
  assert.equal(tools.validity(selected, exact, other, { ...native, writerTrap: { ...native.writerTrap, errors: 1 } }, native, 1010).valid, false);
  assert.equal(tools.validity(selected, { ...exact, events: exact.events.map(event => event.source === 'sse' ? { ...event, source: 'get' } : event) }, other, native, native, 1010).valid, false);
});

for (const lineEnding of ['LF', 'CRLF']) test(`installer preserves original bytes with ${lineEnding} guard source`, () => {
  const root = fs.mkdtempSync(path.join(__dirname, '.bom-install-test-'));
  const repository = path.resolve(__dirname, '../../../..');
  const originals = [
    'frontend/app/mes/_components/DesktopShippingView.tsx',
    'frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemStockPurchaseFields.tsx',
    'frontend/lib/queries/realtime.tsx',
    'frontend/tests/e2e/shipping-additional-expectations.spec.ts',
    'scripts/dev/mes-flaky-diagnosis/items-preseed.spec.ts',
  ];
  try {
    for (const file of originals) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.copyFileSync(path.join(repository, file), path.join(root, file)); }
    const guardFile = path.join(root, 'scripts/dev/mes-flaky-diagnosis/items-preseed.spec.ts');
    const guardText = fs.readFileSync(guardFile, 'utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(guardFile, lineEnding === 'CRLF' ? guardText.replace(/\n/g, '\r\n') : guardText);
    const before = new Map(originals.map(file => [file, tools.sha(fs.readFileSync(path.join(root, file)))]));
    fs.writeFileSync(path.join(root, '.mes-flaky-export.json'), JSON.stringify({ source: fs.realpathSync(root), head: '63d4ed59acf223e6cad62b3a360d905825d92021', kind: 'synthetic-direct-boundaries' }));
    const receipt = require('./install-bom-concurrent.cjs').install(root);
    assert.equal(receipt.files.length, 4);
    for (const file of originals) assert.equal(tools.sha(fs.readFileSync(path.join(root, file))), before.get(file));
    const installedManifest = JSON.parse(fs.readFileSync(path.join(root, 'frontend/tests/e2e/_bom-concurrent-manifest.json'), 'utf8'));
    assert.equal(installedManifest.isolationGuardSourceSha256, before.get('scripts/dev/mes-flaky-diagnosis/items-preseed.spec.ts'));
    const generated = fs.readFileSync(path.join(root, 'frontend/tests/e2e/bom-concurrent.spec.ts'), 'utf8');
    assert.equal(generated.includes('/*__PARTS_FIXTURE__*/'), false);
    assert.equal(generated.includes('/*__ISOLATED_EXPORT_GUARD__*/'), false);
    assert.equal(generated.includes('marker.head !== manifest.exportIdentity?.head'), true);
    assert.equal(generated.includes('http://127.0.0.1:8021'), true);
  } finally {
    const resolved = fs.realpathSync(root);
    assert.equal(resolved.startsWith(fs.realpathSync(__dirname) + path.sep + '.bom-install-test-'), true);
    fs.rmSync(resolved, { recursive: true });
  }
});
