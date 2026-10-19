'use strict';
// Explicit opt-in in the owned gitless Linux source only. No on-event filesystem writes.
if (process.env.MES_BOM_PASSIVE === '1') {
  const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
  const tool = require('./bom-input-transport.cjs');
  const root = fs.realpathSync(process.env.MES_DIAG_SOURCE ?? '');
  require('./install-bom-passive.cjs').validatePassiveOwnership(root,
    JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8')),
    fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, 'frontend/.git')));
  if (process.platform !== 'linux' || process.env.MES_BOM_INPUT_TRANSPORT === '1') throw new Error('PASSIVE_LINUX_EXCLUSIVE_MODE_REQUIRED');
  const bundle = fs.realpathSync(path.join(root, 'frontend/node_modules/playwright-core/lib/coreBundle.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'frontend/tests/e2e/_bom-passive-manifest.json'), 'utf8'));
  const original = Module._extensions['.js'];
  globalThis.__mesBomTransport = tool.createTransportRecorder();
  globalThis.__mesBomTransportPatches = [];
  Module._extensions['.js'] = function (module, filename) {
    if (filename !== bundle) return original(module, filename);
    const patched = tool.patchPlaywright(fs.readFileSync(filename, 'utf8'));
    if (patched.receipt.originalSha256 !== manifest.playwrightSha256) throw new Error('PASSIVE_PLAYWRIGHT_SOURCE_HASH_CHANGED');
    globalThis.__mesBomTransportPatches.push(patched.receipt);
    module._compile(patched.source, filename);
  };
}
if (process.env.MES_BOM_INPUT_TRANSPORT === '1') {
  const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
  const tool = require('./bom-input-transport.cjs');
  const root = fs.realpathSync(process.env.MES_DIAG_SOURCE ?? '');
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8'));
  if (process.platform !== 'linux' || root !== '/home/hw/mes-flaky-input-transport-20261019-154319/source' || fs.existsSync(path.join(root, '.git'))
    || marker.source !== root || marker.kind !== 'synthetic-direct-boundaries'
    || marker.head !== '63d4ed59acf223e6cad62b3a360d905825d92021') throw new Error('INPUT_TRANSPORT_OWNERSHIP_REFUSED');
  const bundle = fs.realpathSync(path.join(root, 'frontend/node_modules/playwright-core/lib/coreBundle.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'frontend/tests/e2e/_bom-input-transport-manifest.json'), 'utf8'));
  const original = Module._extensions['.js'];
  globalThis.__mesBomTransport = tool.createTransportRecorder();
  globalThis.__mesBomTransportPatches = [];
  Module._extensions['.js'] = function (module, filename) {
    if (filename !== bundle) return original(module, filename);
    const patched = tool.patchPlaywright(fs.readFileSync(filename, 'utf8'));
    if (patched.receipt.originalSha256 !== manifest.inputTransport.playwrightSha256) throw new Error('PLAYWRIGHT_SOURCE_HASH_CHANGED');
    globalThis.__mesBomTransportPatches.push(patched.receipt);
    module._compile(patched.source, filename);
  };
}
