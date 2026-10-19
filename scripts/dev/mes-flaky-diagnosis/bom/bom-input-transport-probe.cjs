'use strict';
// Parent-only tool fidelity probe. No MES page, application request, login or database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const { buildInputManifest, attachInputTrace, selectInputCase } = require('./bom-input-transport.cjs');
const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
const changes = [];
let current = 1, submitted = null;
function App() {
  const [quantity, setQuantity] = React.useState(1);
  current = quantity;
  return React.createElement(React.Fragment, null,
    React.createElement('input', {type:'number', 'data-testid':'shipping-bom-line-controls', value:quantity,
      onChange:event=>{const value=Number(event.target.value);changes.push(value);setQuantity(value);}}),
    React.createElement('button', {'data-testid':'shipping-wizard-next',onClick:()=>{submitted=quantity;}}, 'Next'));
}
createRoot(document.getElementById('root')).render(React.createElement(App));
window.__inputProbe = {version:React.version, read:()=>({current,submitted,changes:[...changes]})};
`;

async function buildProbe(frontend, passive = false) {
  const esbuild = require(path.join(frontend, 'node_modules/esbuild'));
  const entry = passive ? ENTRY.replace("React.createElement(React.Fragment, null,", "React.createElement('div', {'data-bom-line-child':'tool-probe-child'},") : ENTRY;
  const built = await esbuild.build({ stdin: { contents: entry, resolveDir: frontend, loader: 'js', sourcefile: 'input-transport-probe.js' },
    write: false, bundle: true, platform: 'browser', format: 'iife', sourcemap: 'external', outfile: 'probe.js',
    alias: { react: path.join(frontend, 'node_modules/next/dist/compiled/react'), 'react-dom': path.join(frontend, 'node_modules/next/dist/compiled/react-dom') },
    define: { 'process.env.NODE_ENV': '"development"' } });
  const code = built.outputFiles.find(row => row.path.endsWith('/probe.js') || row.path.endsWith('\\probe.js')).text;
  const rawMap = built.outputFiles.find(row => row.path.endsWith('.map')).text;
  const map = JSON.parse(rawMap);
  // A harmless URI prefix makes the emitted source names explicit for the existing exact resolver.
  map.sources = map.sources.map(source => '/probe/' + source.replace(/\\/g, '/'));
  const mapText = JSON.stringify(map);
  return { code: code + '\n//# sourceMappingURL=data:application/json;base64,' + Buffer.from(mapText).toString('base64')
    + '\n//# sourceURL=http://localhost:3100/_next/static/chunks/input-transport-probe.js',
    receipt: { entrySha256: sha(entry), bundleSha256: sha(code), emittedMapSha256: sha(rawMap), observedMapSha256: sha(mapText) } };
}

/** Same real React input/next operation in separate on/off processes; no server or application fixture. */
async function runPassiveProbe(frontendArg, outputArg, mode) {
  if (!['passive-on', 'passive-off'].includes(mode)) throw new Error('EXPLICIT_PASSIVE_PROBE_MODE_REQUIRED');
  const frontend = fs.realpathSync(frontendArg), root = path.dirname(frontend), output = path.resolve(outputArg);
  require('./install-bom-passive.cjs').validatePassiveOwnership(root,
    JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8')), fs.existsSync(path.join(root, '.git')));
  if (fs.existsSync(output)) throw new Error('REFUSE_PRIOR_PROBE_RECEIPT');
  const observe = mode === 'passive-on';
  if (observe !== Boolean(globalThis.__mesBomTransport)) throw new Error('PASSIVE_SEPARATE_PROCESS_REQUIRED');
  const built = await buildProbe(frontend, true);
  const record = { schema: 1, mode, applicationRequests: 0, inputCalls: 1, extraFocusCalls: 0,
    breakpointSessions: 0, build: built.receipt, outcome: 'TOOL_CONDITION_NOT_MET' };
  let browser, page;
  try {
    const { chromium } = require(path.join(frontend, 'node_modules/playwright'));
    browser = await chromium.launch({ headless: true, ...(process.env.MES_OBSERVER_CHROMIUM ? { executablePath: process.env.MES_OBSERVER_CHROMIUM } : {}) });
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('request', request => { if (/^https?:/.test(request.url())) record.applicationRequests++; });
    await page.addInitScript({ content: "window.__passiveProbeMetrics={focus:0,input:0};window.addEventListener('focusin',()=>window.__passiveProbeMetrics.focus++);window.addEventListener('input',()=>window.__passiveProbeMetrics.input++);" });
    if (observe) await page.addInitScript({ content: 'window.__MES_BOM_DIAG_ENABLED__=true;window.__MES_BOM_VALUE_TRAP__=true;window.__MES_BOM_PASSIVE__=true;\n'
      + fs.readFileSync(path.join(__dirname, 'bom-diag-native.js'), 'utf8') });
    await page.goto('data:text/html,<div id="root"></div>');
    await page.addScriptTag({ content: built.code });
    if (observe) globalThis.__mesBomTransport.arm(selectInputCase('q2-fill'));
    await page.getByTestId('shipping-bom-line-controls').fill('2');
    await page.getByTestId('shipping-wizard-next').click();
    record.values = await page.evaluate(() => {
      const input = document.querySelector('input');
      const key = Object.getOwnPropertyNames(input).find(name => name.startsWith('__reactProps$'));
      return { ...window.__inputProbe.read(), dom: Number(input.value), tracker: Number(input._valueTracker.getValue()),
        react: Number(input[key].value), reactVersion: window.__inputProbe.version, metrics: window.__passiveProbeMetrics };
    });
    assert.deepEqual({ ...record.values, reactVersion: undefined, metrics: undefined },
      { current: 2, submitted: 2, changes: [2], dom: 2, tracker: 2, react: 2, reactVersion: undefined, metrics: undefined });
    assert.equal(record.values.metrics.input, 1);
    assert.equal(record.values.metrics.focus, 2);
    assert.equal(record.applicationRequests, 0);
    if (observe) {
      record.native = await page.evaluate(() => window.__mesBomDiag.export());
      record.transport = globalThis.__mesBomTransport.export();
      record.patches = globalThis.__mesBomTransportPatches;
      assert.equal(record.native.writerTrap.diagnosticPauses, 0);
      assert.equal(record.native.writerTrap.errors + record.native.errors + record.native.dropped, 0);
      assert.equal(record.transport.dropped + record.transport.errors + record.transport.pending, 0);
      assert.equal(record.transport.events.filter(row => row.kind === 'wire:send' && row.command === 'Input.insertText').length, 1);
      assert.equal(record.transport.events.filter(row => row.kind === 'wire:receive' && row.ok).length, 1);
      assert.equal(record.native.events.filter(row => row.kind === 'native:input:window-bubble').length, 1);
      assert.equal(record.native.incidents.length, 0);
    }
    record.outcome = 'TOOL_PASS';
  } catch (error) { record.error = { name: error.name }; throw error; }
  finally {
    globalThis.__mesBomTransport?.disarm();
    if (browser) await browser.close();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(record, null, 2), { flag: 'wx' });
  }
  return record;
}

async function runProbe(frontendArg, outputArg, mode) {
  if (!['on', 'off'].includes(mode)) throw new Error('ONE_EXPLICIT_PROBE_MODE_REQUIRED');
  const frontend = fs.realpathSync(frontendArg), output = path.resolve(outputArg);
  const root = path.dirname(frontend);
  require('./install-bom-input-transport.cjs').validateInputOwnership(root,
    JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8')), fs.existsSync(path.join(root, '.git')));
  if (fs.existsSync(output)) throw new Error('REFUSE_PRIOR_PROBE_RECEIPT');
  const observe = mode === 'on';
  if (observe !== Boolean(globalThis.__mesBomTransport)) throw new Error('PROBE_MUST_USE_SEPARATE_PATCHED_OR_ORIGINAL_PROCESS');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output + '.started.json', JSON.stringify({ mode, kind: 'tool-only-react-number-input', applicationRequests: 0 }), { flag: 'wx' });
  const built = await buildProbe(frontend);
  const { chromium } = require(path.join(frontend, 'node_modules/playwright'));
  const manifest = buildInputManifest(root);
  manifest.files = manifest.files.filter(row => row.file.endsWith('react-dom-client.development.js'));
  const record = { schema: 1, mode, applicationRequests: 0, inputCalls: 1, build: built.receipt,
    patches: globalThis.__mesBomTransportPatches ?? [], outcome: 'TOOL_CONDITION_NOT_MET' };
  let browser, page, control;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.MES_OBSERVER_CHROMIUM ? { executablePath: process.env.MES_OBSERVER_CHROMIUM } : {}) });
    page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('request', request => { if (/^https?:/.test(request.url())) record.applicationRequests++; });
    if (observe) {
      const native = fs.readFileSync(path.join(__dirname, 'bom-diag-native.js'), 'utf8');
      await page.addInitScript({ content: 'window.__MES_BOM_DIAG_ENABLED__=true;window.__MES_BOM_VALUE_TRAP__=true;window.__MES_BOM_QUANTITY_ONLY__=true;window.__MES_BOM_PAUSE_ON_RESET__=true;\n' + native });
      control = await attachInputTrace(page, manifest, { requireCatalog: false });
    }
    await page.goto('data:text/html,<div id="root"></div>');
    await page.addScriptTag({ content: built.code });
    const numberQuantityInput = page.getByTestId('shipping-bom-line-controls');
    await numberQuantityInput.waitFor({ state: 'visible' });
    assert.equal(await numberQuantityInput.getAttribute('type'), 'number');
    assert.equal(await numberQuantityInput.inputValue(), '1');
    if (control) await control.ready(manifest.files.map(row => row.file));
    if (observe) globalThis.__mesBomTransport.arm(selectInputCase('q2-fill'));
    await numberQuantityInput.fill('2');
    if (control?.stopped()) throw new Error('UNEXPECTED_PROBE_WRITER_RESET');
    await page.getByTestId('shipping-wizard-next').click();
    if (observe) globalThis.__mesBomTransport.disarm();
    record.values = await page.evaluate(() => {
      const input = document.querySelector('input');
      const key = Object.getOwnPropertyNames(input).find(name => name.startsWith('__reactProps$'));
      return { ...window.__inputProbe.read(), dom: Number(input.value), tracker: Number(input._valueTracker.getValue()),
        react: Number(input[key].value), reactVersion: window.__inputProbe.version };
    });
    assert.deepEqual({ ...record.values, reactVersion: undefined }, { current: 2, submitted: 2, changes: [2], dom: 2, tracker: 2, react: 2, reactVersion: undefined });
    assert.equal(record.applicationRequests, 0);
    if (observe) {
      record.snapshot = await page.evaluate(() => ({ exact: window.__mesBomExact.export(), native: window.__mesBomDiag.export() }));
      record.transport = globalThis.__mesBomTransport.export();
      record.observer = control.evidence();
      assert.equal(record.patches.length, 1);
      assert.equal(record.transport.dropped + record.transport.errors + record.transport.pending, 0);
      assert.equal(record.snapshot.exact.dropped + record.snapshot.exact.errors + record.snapshot.native.dropped + record.snapshot.native.writerTrap.errors, 0);
      assert.equal(record.observer.errors.length, 0);
      assert.deepEqual(record.transport.events.filter(row => row.kind === 'wire:send').map(row => row.command), ['Input.insertText']);
      assert.equal(record.transport.events.filter(row => row.kind === 'wire:receive' && row.ok).length, 1);
      for (const kind of ['fill:needsinput', 'keyboard:insertText', 'raw:sendText']) assert.equal(record.transport.events.filter(row => row.kind === kind).length, 1);
      for (const label of ['react:tracker-compare', 'react:change-queue', 'react:dispatch-queue', 'react:restore-target']) assert.ok(record.snapshot.exact.events.some(row => row.label === label && row.readable));
    }
    record.outcome = 'TOOL_PASS';
  } catch (error) {
    record.error = { name: error.name, message: String(error.message).slice(0, 300) };
    if (page) await page.screenshot({ path: output + '.png' }).catch(() => {});
    throw error;
  } finally {
    globalThis.__mesBomTransport?.disarm();
    if (control) await control.close();
    if (browser) await browser.close();
    fs.writeFileSync(output, JSON.stringify(record, null, 2), { flag: 'wx' });
  }
  return record;
}
module.exports = { buildProbe, runProbe, runPassiveProbe, ENTRY };
if (require.main === module) {
  const [frontend, output, mode] = process.argv.slice(2);
  (mode?.startsWith('passive-') ? runPassiveProbe(frontend, output, mode) : runProbe(frontend, output, mode)).then(record => process.stdout.write(JSON.stringify({ mode, outcome: record.outcome, values: record.values }) + '\n'))
    .catch(error => { process.stderr.write(String(error.message).slice(0, 300) + '\n'); process.exitCode = 1; });
}
