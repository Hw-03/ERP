'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildManifest, sha } = require('./bom-exact-cdp.cjs');

function validateOwnership(root, marker, hasGit) {
  if (hasGit || /^C:\\ERP(?:-dev)?(?:\\|$)/i.test(root)) throw new Error('GITLESS_SOURCE_COPY_REQUIRED');
  if (!marker || marker.source !== root) throw new Error('EXACT_OWNED_SOURCE_MARKER_REQUIRED');
}

/** Installer only writes new test helpers in a gitless copy; product and original spec remain byte-identical. */
function install(root) {
  root = fs.realpathSync(path.resolve(root));
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8'));
  validateOwnership(root, marker, fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, 'frontend', '.git')));
  const originalFile = path.join(root, 'frontend/tests/e2e/shipping-additional-expectations.spec.ts');
  const original = fs.readFileSync(originalFile, 'utf8');
  const start = original.indexOf('    const suffix = randomUUID().slice(0, 8);');
  const endMarker = '    const parts = { ...made, rawHistory: [] } as Parts;';
  const end = original.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error('ORIGINAL_PARTS_FIXTURE_UNRESOLVED');
  const preparation = original.slice(start, end + endMarker.length);
  if ((preparation.match(/request\.post\("\/api\/items"/g) ?? []).length !== 1 || !preparation.includes('variantOther')) throw new Error('ORIGINAL_PARTS_FIXTURE_CHANGED');
  const manifest = buildManifest(root);
  const rawPreseed = fs.readFileSync(path.join(root, 'scripts/dev/mes-flaky-diagnosis/items-preseed.spec.ts'), 'utf8');
  const preseed = rawPreseed.replace(/\r\n/g, '\n');
  const guardStart = preseed.indexOf('function requireIsolatedExport(testInfo: TestInfo): void {');
  const guardEnd = preseed.indexOf('\nasync function readItems', guardStart);
  if (guardStart < 0 || guardEnd < 0) throw new Error('ISOLATED_EXPORT_GUARD_UNRESOLVED');
  let guard = preseed.slice(guardStart, guardEnd);
  const oldMarkerGuard = `    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { source?: string; checkout?: string; commit?: string };
    if (marker.source !== root || typeof marker.checkout !== "string" || !/^[0-9a-f]{40}$/.test(marker.commit ?? "")) throw Error();
    const checkout = fs.realpathSync(marker.checkout);
    const relative = path.relative(checkout, root);
    if (!relative || (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) throw Error();`;
  const newMarkerGuard = `    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { source?: string; checkout?: string; commit?: string; head?: string; kind?: string };
    if (marker.source !== root) throw Error();
    if (marker.checkout && marker.commit) {
      if (!/^[0-9a-f]{40}$/.test(marker.commit)) throw Error();
      const checkout = fs.realpathSync(marker.checkout);
      const relative = path.relative(checkout, root);
      if (!relative || (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) throw Error();
    } else {
      if (!/^[0-9a-f]{40}$/.test(marker.head ?? "") || marker.head !== manifest.exportIdentity?.head || marker.kind !== manifest.exportIdentity?.kind) throw Error();
    }`;
  if (!guard.includes(oldMarkerGuard)) throw new Error('ISOLATED_EXPORT_MARKER_GUARD_CHANGED');
  guard = guard.replace(oldMarkerGuard, newMarkerGuard);
  manifest.exportIdentity = { head: marker.head ?? marker.commit, kind: marker.kind ?? null };
  manifest.isolationGuardSourceSha256 = sha(rawPreseed);
  manifest.originalSpecSha256 = sha(original);
  const target = path.join(root, 'frontend/tests/e2e');
  if (!fs.realpathSync(target).startsWith(root + path.sep)) throw new Error('HELPER_TARGET_ESCAPES_SOURCE');
  const files = {
    '_bom-exact-cdp.cjs': fs.readFileSync(path.join(__dirname, 'bom-exact-cdp.cjs')),
    '_bom-diag-native.js': fs.readFileSync(path.join(__dirname, 'bom-diag-native.js')),
    '_bom-concurrent-manifest.json': JSON.stringify(manifest, null, 2),
    'bom-concurrent.spec.ts': fs.readFileSync(path.join(__dirname, 'bom-concurrent.spec.ts'), 'utf8').replace('/*__PARTS_FIXTURE__*/', preparation).replace('/*__ISOLATED_EXPORT_GUARD__*/', guard),
  };
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(target, name);
    if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('SYMLINK_HELPER_REFUSED');
    if (fs.existsSync(destination) && !Buffer.from(fs.readFileSync(destination)).equals(Buffer.from(content))) throw new Error('REFUSE_EXISTING_HELPER:' + name);
  }
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(target, name), content);
  if (sha(fs.readFileSync(originalFile)) !== manifest.originalSpecSha256) throw new Error('ORIGINAL_SPEC_CHANGED');
  return { schema: 1, files: Object.keys(files).map(name => ({ file: name, sha256: sha(files[name]) })),
    sources: manifest.files.map(file => ({ file: file.file, sha256: file.sha256, points: file.points.length })), originalSpecSha256: manifest.originalSpecSha256 };
}
module.exports = { install, validateOwnership };
if (require.main === module) {
  if (process.argv.length !== 3) throw new Error('Usage: node install-bom-concurrent.cjs /absolute/gitless/source');
  process.stdout.write(JSON.stringify(install(process.argv[2]), null, 2) + '\n');
}
