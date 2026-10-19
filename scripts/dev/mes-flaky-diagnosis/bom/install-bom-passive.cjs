'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { instrument } = require('../instrument-failure.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

/** Validate a disposable export without admitting a checkout or an unapproved source identity. */
function validatePassiveOwnership(root, marker, hasGit) {
  if (hasGit || /^C:\\ERP(?:-dev)?(?:\\|$)/i.test(root) || !marker || marker.source !== root
    || marker.kind !== 'synthetic-direct-boundaries' || marker.head !== '63d4ed59acf223e6cad62b3a360d905825d92021') throw new Error('PASSIVE_OWNED_EXPORT_REQUIRED');
}
/** Only import/catch/cleanup additions; all original body expressions remain verbatim. */
function generatePassiveSpec(ts, original) {
  const anchor = 'from "./_common-expectations";';
  if (original.split(anchor).length !== 2) throw new Error('PASSIVE_ORIGINAL_IMPORT_CHANGED');
  let text = original.replace(anchor, 'from "./_bom-passive-fixture";');
  const cleanup = 'await runFixture(parts);';
  if (text.split(cleanup).length !== 2) throw new Error('PASSIVE_FIXTURE_BOUNDARY_CHANGED');
  text = text.replace(/await runFixture\(parts\);(\s+} finally {)/, cleanup + '$1\n      if (__mesNeedsPreservation()) await __mesBeforeCleanup();');
  const result = instrument(ts, text, 'bom-passive-original.spec.ts', './_failure-boundary');
  const checked = ts.transpileModule(result.text, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  if (checked.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error)) throw new Error('PASSIVE_GENERATED_SYNTAX_ERROR');
  return result;
}
/** New test helpers only; refuse symlinks and differing prior outputs before any write. */
function installPassive(root) {
  root = fs.realpathSync(path.resolve(root));
  const marker = JSON.parse(fs.readFileSync(path.join(root, '.mes-flaky-export.json'), 'utf8'));
  validatePassiveOwnership(root, marker, fs.existsSync(path.join(root, '.git')) || fs.existsSync(path.join(root, 'frontend/.git')));
  const target = fs.realpathSync(path.join(root, 'frontend/tests/e2e'));
  if (!target.startsWith(root + path.sep)) throw new Error('PASSIVE_HELPER_PATH_ESCAPE');
  const source = path.join(target, 'shipping-additional-expectations.spec.ts'), original = fs.readFileSync(source);
  const result = generatePassiveSpec(require(path.join(root, 'frontend/node_modules/typescript')), original.toString('utf8'));
  const files = {
    '_failure-boundary.ts': fs.readFileSync(path.join(__dirname, '../failure-boundary.ts')),
    '_bom-passive-fixture.ts': fs.readFileSync(path.join(__dirname, 'bom-passive-fixture.ts')),
    '_bom-diag-native.js': fs.readFileSync(path.join(__dirname, 'bom-diag-native.js')),
    '_bom-input-transport.cjs': fs.readFileSync(path.join(__dirname, 'bom-input-transport.cjs')),
    '_bom-passive-manifest.json': JSON.stringify({ schema: 1, head: marker.head,
      playwrightSha256: sha(fs.readFileSync(path.join(root, 'frontend/node_modules/playwright-core/lib/coreBundle.js'))) }),
    'bom-passive-original.spec.ts': result.text,
  };
  for (const [file, content] of Object.entries(files)) {
    const destination = path.join(target, file);
    if (fs.existsSync(destination) && (fs.lstatSync(destination).isSymbolicLink() || !fs.readFileSync(destination).equals(Buffer.from(content)))) throw new Error('PASSIVE_EXISTING_HELPER_DIFFERS:' + file);
  }
  for (const [file, content] of Object.entries(files)) if (!fs.existsSync(path.join(target, file))) fs.writeFileSync(path.join(target, file), content, { flag: 'wx' });
  if (!fs.readFileSync(source).equals(original)) throw new Error('PASSIVE_ORIGINAL_SPEC_CHANGED');
  return { schema: 1, generatedOnly: true, originalSha256: sha(original), originalUnchanged: true, tests: result.tests,
    productPatches: 0, files: Object.entries(files).map(([file, content]) => ({ file, sha256: sha(content) })) };
}
module.exports = { validatePassiveOwnership, generatePassiveSpec, installPassive };
if (require.main === module) {
  if (process.argv.length !== 3) throw new Error('Usage: node install-bom-passive.cjs /owned/gitless/source');
  process.stdout.write(JSON.stringify(installPassive(process.argv[2]), null, 2) + '\n');
}
