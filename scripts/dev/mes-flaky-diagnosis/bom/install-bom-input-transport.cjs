'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { sha } = require('./bom-exact-cdp.cjs');
const { buildInputManifest } = require('./bom-input-transport.cjs');
const existing = require('./install-bom-concurrent.cjs');
const APPROVED_SOURCE = '/home/hw/mes-flaky-input-transport-20261019-154319/source';
const APPROVED_HEAD = '63d4ed59acf223e6cad62b3a360d905825d92021';

function validateInputOwnership(root, marker, hasGit) {
  existing.validateOwnership(root, marker, hasGit);
  if (root !== APPROVED_SOURCE) throw new Error('NEW_APPROVED_SOURCE_ONLY');
  if (marker.kind !== 'synthetic-direct-boundaries' || marker.head !== APPROVED_HEAD) throw new Error('APPROVED_EXPORT_IDENTITY_REQUIRED');
}

/** Resolve every runtime helper before any fixture API or browser action is admitted. */
function preflightInputDependencies(root) {
  const required = [
    'frontend/tests/e2e/_bom-input-transport.cjs', 'frontend/tests/e2e/_bom-exact-cdp.cjs',
    'frontend/tests/e2e/_bom-diag-native.js', 'frontend/tests/e2e/_bom-input-transport-manifest.json',
    'frontend/tests/e2e/_common-expectations.ts', 'frontend/tests/e2e/_failure-boundary.ts',
    'scripts/dev/mes-flaky-diagnosis/snapshot-db.py',
  ];
  return required.map(file => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile() || fs.lstatSync(absolute).isSymbolicLink()) throw new Error('INPUT_DEPENDENCY_MISSING:' + file);
    const bytes = fs.readFileSync(absolute);
    if (file.endsWith('/_failure-boundary.ts')) {
      const text = bytes.toString('utf8');
      for (const exported of ['export function registerBoundary(', 'export async function preserveFailure(', 'export async function beforeCleanup(']) {
        if (!text.includes(exported)) throw new Error('INPUT_BOUNDARY_EXPORT_UNAVAILABLE');
      }
    }
    return { file, sha256: sha(bytes) };
  });
}

/** Repair only the absent boundary; never regenerate an already installed spec or manifest. */
function installInputDependencies(root) {
  root = fs.realpathSync(path.resolve(root));
  validateInputOwnership(root, JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8')), fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, 'frontend/.git')));
  const target = fs.realpathSync(path.join(root, 'frontend/tests/e2e'));
  if (!target.startsWith(root + path.sep)) throw new Error('HELPER_TARGET_ESCAPES_SOURCE');
  const destination = path.join(target, '_failure-boundary.ts');
  const bytes = fs.readFileSync(path.join(__dirname, '../failure-boundary.ts'));
  const present = fs.existsSync(destination);
  if (present && (fs.lstatSync(destination).isSymbolicLink() || !fs.readFileSync(destination).equals(bytes))) throw new Error('REFUSE_EXISTING_INPUT_HELPER:_failure-boundary.ts');
  if (!present) fs.writeFileSync(destination, bytes, { flag: 'wx' });
  return { schema: 1, mode: 'dependencies-only', installed: !present, file: '_failure-boundary.ts', sha256: sha(bytes),
    generatedSpecAndManifestWritten: false, dependencies: preflightInputDependencies(root) };
}

/** Reuse the proven fixture/DB guard builder; its older spec is installed but never selected. */
function installInput(root) {
  root = fs.realpathSync(path.resolve(root));
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8'));
  validateInputOwnership(root, marker, fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, 'frontend/.git')));
  const reused = existing.install(root);
  const target = path.join(root, 'frontend/tests/e2e');
  const prepared = fs.readFileSync(path.join(target, 'bom-concurrent.spec.ts'), 'utf8');
  const guardStart = prepared.indexOf('function requireIsolatedExport(testInfo: TestInfo): void {');
  const guardEnd = prepared.indexOf('\n\ntest.describe.configure', guardStart);
  if (guardStart < 0 || guardEnd < 0) throw new Error('REUSED_ISOLATION_GUARD_UNRESOLVED');
  const originalFile = path.join(target, 'shipping-additional-expectations.spec.ts');
  const original = fs.readFileSync(originalFile, 'utf8');
  const fixtureStart = original.indexOf('    const suffix = randomUUID().slice(0, 8);');
  const fixtureEndText = '    const parts = { ...made, rawHistory: [] } as Parts;';
  const fixtureEnd = original.indexOf(fixtureEndText, fixtureStart);
  if (fixtureStart < 0 || fixtureEnd < 0) throw new Error('REUSED_PARTS_FIXTURE_UNRESOLVED');
  const manifest = buildInputManifest(root);
  manifest.exportIdentity = { head: marker.head, kind: marker.kind };
  manifest.originalSpecSha256 = sha(original);
  manifest.reusedInstallerReceipt = reused;
  const template = fs.readFileSync(path.join(__dirname, 'bom-input-transport.spec.ts'), 'utf8');
  const spec = template.replace('/*__ISOLATED_EXPORT_GUARD__*/', prepared.slice(guardStart, guardEnd))
    .replace('/*__PARTS_FIXTURE__*/', original.slice(fixtureStart, fixtureEnd + fixtureEndText.length));
  if (spec.includes('/*__ISOLATED_EXPORT_GUARD__*/') || spec.includes('/*__PARTS_FIXTURE__*/')) throw new Error('TEMPLATE_EXPANSION_INCOMPLETE');
  const files = {
    '_failure-boundary.ts': fs.readFileSync(path.join(__dirname, '../failure-boundary.ts')),
    '_bom-input-transport.cjs': fs.readFileSync(path.join(__dirname, 'bom-input-transport.cjs'), 'utf8').replace("require('./bom-exact-cdp.cjs')", "require('./_bom-exact-cdp.cjs')"),
    '_bom-input-transport-manifest.json': JSON.stringify(manifest, null, 2),
    'bom-input-transport.spec.ts': spec,
  };
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(target, name);
    if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink() || !fs.readFileSync(destination).equals(Buffer.from(content)))) throw new Error('REFUSE_EXISTING_INPUT_HELPER:' + name);
  }
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(target, name), content);
  if (sha(fs.readFileSync(originalFile)) !== manifest.originalSpecSha256) throw new Error('ORIGINAL_SPEC_CHANGED');
  const dependencies = preflightInputDependencies(root);
  return { schema: 1, approvedSource: root, files: Object.entries(files).map(([file, content]) => ({ file, sha256: sha(content) })),
    dependencies,
    originalsUnchanged: true, productPatches: 0, playwrightOriginalSha256: manifest.inputTransport.playwrightSha256,
    sourceHashes: manifest.files.map(file => ({ file: file.file, sha256: file.sha256, points: file.points.length })),
    reuse: 'original fixture, loginUi, DB/source guards, first-failure boundary' };
}
module.exports = { validateInputOwnership, installInput, installInputDependencies, preflightInputDependencies };
if (require.main === module) {
  if (process.argv.length === 4 && process.argv[3] === '--dependencies-only') {
    process.stdout.write(JSON.stringify(installInputDependencies(process.argv[2]), null, 2) + '\n');
  } else if (process.argv.length === 4 && process.argv[3] === '--preflight-only') {
    const root = fs.realpathSync(path.resolve(process.argv[2]));
    validateInputOwnership(root, JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8')), fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, 'frontend/.git')));
    process.stdout.write(JSON.stringify({ schema: 1, mode: 'preflight-only', dependencies: preflightInputDependencies(root) }, null, 2) + '\n');
  } else {
    if (process.argv.length !== 3) throw new Error('Usage: node install-bom-input-transport.cjs /approved/gitless/source [--preflight-only|--dependencies-only]');
    process.stdout.write(JSON.stringify(installInput(process.argv[2]), null, 2) + '\n');
  }
}
