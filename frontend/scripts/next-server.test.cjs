const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { EventEmitter } = require('node:events');

test('custom server dependency probe succeeds without opening a port', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'next-server.js'), '--check'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /API_PROXY_RUNTIME=PASS/);
});

test('all direct and supervised launch paths select the managed API server', () => {
  const pkg = require('../package.json');
  const wrapper = fs.readFileSync(path.join(__dirname, 'dev.js'), 'utf8');
  assert.match(pkg.scripts['dev:raw'], /scripts\/next-server.js dev/);
  assert.match(pkg.scripts.start, /scripts\/next-server.js start/);
  assert.match(wrapper, /path\.join\(__dirname, "next-server\.js"\)/);
});

test('Next has no second API proxy or external rewrite', () => {
  const config = require('../next.config')('phase-development-server');
  assert.equal(config.rewrites, undefined);
  assert.equal(fs.existsSync(path.join(__dirname, '../proxy.ts')), false);
});

test('custom server receives development signal diagnostics without enabling arbitrary children', () => {
  const { initializeNextSignalProbe } = require('./next-signal-probe');
  for (const [entry, expected] of [[path.join(__dirname, 'next-server.js'), true], [path.join(__dirname, 'other.js'), false]]) {
    const proc = Object.assign(new EventEmitter(), { argv: [process.execPath, entry], pid: 1, ppid: 2,
      cwd: () => path.resolve(__dirname, '..'), report: {},
      env: { MES_RUNTIME_PROFILE: 'development', MES_NEXT_SIGNAL_PROBE: '1' } });
    const logs = [];
    assert.equal(initializeNextSignalProbe({ processRef: proc, createDiagnosticsFactory: () => ({
      log: (kind) => logs.push(kind), prepareNodeReportDirectory: () => 'synthetic-report-path',
    }) }), expected);
    proc.emit('SIGTERM');
    assert.equal(logs.includes('NEXT_SIGNAL_RECEIVED'), expected);
    assert.equal(proc.report.reportOnUncaughtException === true, expected);
  }
});
