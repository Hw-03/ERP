import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeExpectations, selectAssertions, summarize, validateExpectations } from "./normalize-mes-expectations.mjs";
import { captureSnapshot, conditionFingerprint, digest, parseReport, relativePath, requiredInputs, verifyExecution } from "./mes-expectation-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "docs/superpowers/specs/2026-10-07-mes-expectations";
const RUNTIME = "_attic/runtime/mes-expectations";
// Removing the last approver changes all pending requests; this scenario needs its own seed.
const FRESH_BROWSER_FILES = new Set([
  "frontend/tests/e2e/as-research-expectations.spec.ts",
  "frontend/tests/e2e/as-research-ui-expectations.spec.ts",
]);
const slash = (value) => value.replaceAll("\\", "/");
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const kstNow = () => new Date(Date.now() + 9 * 3600_000).toISOString().replace("Z", "+09:00");
const runnerFor = (file) => file.startsWith("backend/") ? "pytest" : file.includes("/e2e/") ? "playwright" : file.startsWith("frontend/") ? "vitest" : "node";
const inputPaths = (root) => execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
const groupKey = (group) => `${group.runner}-${digest((group.files ?? [group.file]).join("\n")).slice(0, 10)}`;
const artifacts = (report) => [report.raw, report.collection, report.environmentFile, ...(report.screenshots ?? [])].filter(Boolean).map(({ path, sha256 }) => ({ path, sha256 }));

/** Record intended declarations independently of what the child happened to emit. */
function groupDeclaration(group) {
  return { runner: group.runner, files: group.files, conditions: group.conditions.map(({ row, condition, bindings }) => ({
    caseId: row.id, conditionId: condition.id, fingerprint: conditionFingerprint(row, condition),
    targets: [...new Map(bindings.map(({ file, selector }) => [`${file}::${selector}`, { file, selector }])).values()],
  })) };
}

/** Called after isolated E2E seed; the DB read is explicitly read-only. */
export function recordBrowserEnvironment({ root, database, seedFile, bootId, output }) {
  const expected = path.resolve(root, "backend/mes_e2e.db");
  if (path.resolve(database) !== expected || fs.realpathSync(database) !== expected) throw new Error("browser evidence requires the dedicated E2E database");
  if (!bootId) throw new Error("backend boot identity missing");
  const script = ["import hashlib,json,sqlite3,sys", "from pathlib import Path", "c=sqlite3.connect(Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True)", "c.execute('BEGIN')", "revision=','.join(r[0] for r in c.execute('SELECT version_num FROM alembic_version ORDER BY version_num'))", "snapshot=hashlib.sha256('\\n'.join(c.iterdump()).encode()).hexdigest()", "c.close()", "print(json.dumps({'revision':revision,'logicalSnapshotHash':snapshot}))"].join("\n");
  const identity = JSON.parse(execFileSync("python", ["-c", script, database], { encoding: "utf8", windowsHide: true }));
  if (!identity.revision) throw new Error("E2E schema revision missing");
  const record = { kind: "browser", baseUrl: "http://127.0.0.1:3100", backendUrl: "http://127.0.0.1:8021", versions: { node: process.version, python: execFileSync("python", ["--version"], { encoding: "utf8", windowsHide: true }).trim() }, database: { ...identity, path: slash(expected), fixtureHash: digest(fs.readFileSync(seedFile)), bootId }, recordedAt: kstNow() };
  writeJson(output, record);
  return record;
}

async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`isolated browser port already occupied: ${port}`)));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

/** Select reviewed conditions, then group complete files to retain all parameters. */
export function buildRunPlan(model, selection) {
  if (model.schemaVersion !== 2) throw new Error("runner requires schema 2");
  const selected = selectAssertions(model, selection);
  const groups = new Map();
  for (const row of model.cases.filter((entry) => selected.caseIds.includes(entry.id))) {
    if (row.atomicReview !== "reviewed") throw new Error(`unreviewed: ${row.id}`);
    for (const condition of row.assertions) {
      if (!condition.requiredEvidence?.length) throw new Error(`required evidence missing: ${row.id}/${condition.id}`);
      if (condition.requiredEvidence.includes("browser") && !condition.bindings.some((binding) => runnerFor(binding.file) === "playwright")) throw new Error(`browser binding missing: ${row.id}/${condition.id}`);
      for (const binding of condition.bindings) {
        const runner = runnerFor(binding.file);
        const key = runner === "node" || FRESH_BROWSER_FILES.has(binding.file) ? binding.file
          : runner === "pytest" && binding.file.startsWith("backend/tests/ops/") ? "pytest-ops" : runner;
        if (!groups.has(key)) groups.set(key, { runner, files: [], conditions: [] });
        const group = groups.get(key);
        if (!group.files.includes(binding.file)) group.files.push(binding.file);
        let entry = group.conditions.find((entry) => entry.row.id === row.id && entry.condition.id === condition.id);
        if (!entry) { entry = { row, condition, bindings: [] }; group.conditions.push(entry); }
        entry.bindings.push(binding);
      }
    }
  }
  return { caseIds: selected.caseIds, groups: [...groups.values()], globalPass: false };
}

function invoke(executable, args, options) {
  return new Promise((resolve, reject) => {
    const output = fs.openSync(options.log, "w");
    const child = spawn(executable, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", output, output], windowsHide: true });
    child.once("error", (error) => { fs.closeSync(output); reject(error); });
    child.once("close", (code) => { fs.closeSync(output); resolve(code ?? -1); });
  });
}

/** Keep failure artifacts; only an independently validated report may be promoted. */
export async function executeGroup(group, { root, runId, output, inputs, paths }) {
  relativePath(output);
  const files = group.files ?? [group.file];
  const key = groupKey(group);
  const directory = path.join(root, output);
  fs.mkdirSync(directory, { recursive: true });
  const read = (file) => fs.readFileSync(path.join(root, file));
  const snapshot = captureSnapshot(inputs, paths, read);
  const extension = ["pytest", "node"].includes(group.runner) ? "xml" : "json";
  const rawPath = `${output}/${key}.${extension}`, collectionPath = `${output}/${key}-collection.json`;
  const rawAbsolute = path.join(root, rawPath);
  const environmentPath = path.join(directory, `${key}-environment.json`);
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`, MES_EXPECTATION_ROOT: root, MES_EXPECTATION_COLLECTION: path.join(root, collectionPath), MES_EXPECTATION_ENVIRONMENT: environmentPath };
  // An independent runner is not the parent node:test worker's recursive run().
  delete env.NODE_TEST_CONTEXT;
  let executable = process.execPath, cwd = root, args;
  if (group.runner === "node") args = ["--test", "--test-reporter=junit", `--test-reporter-destination=${rawAbsolute}`, ...files];
  else if (group.runner === "pytest") {
    executable = "python"; cwd = path.join(root, "backend");
    env.PYTHONPATH = `${path.join(root, "scripts/dev")}${path.delimiter}${env.PYTHONPATH ?? ""}`;
    args = ["-m", "pytest", "-p", "mes_expectation_pytest", ...files.map((file) => file.slice("backend/".length)), "-q", `--junitxml=${rawAbsolute}`];
    if (files.every((file) => file.startsWith("backend/tests/ops/"))) args.push("--confcutdir=tests/ops");
  } else if (group.runner === "vitest") {
    cwd = path.join(root, "frontend");
    args = ["node_modules/vitest/vitest.mjs", "run", ...files.map((file) => file.slice("frontend/".length)), "--config=vitest.expectations.config.mts", "--retry=0", "--reporter=json", "--reporter=../scripts/dev/mes-expectation-vitest-reporter.mjs", `--outputFile=${rawAbsolute}`];
  } else if (group.runner === "playwright") {
    await requireFreePort(8021);
    await requireFreePort(3100);
    cwd = path.join(root, "frontend");
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = rawAbsolute;
    env.E2E_BASE_URL = "http://127.0.0.1:3100";
    args = ["node_modules/@playwright/test/cli.js", "test", ...files.map((file) => file.slice("frontend/".length)), "--retries=0", "--reporter=json", "--forbid-only", "--grep=.*", "--grep-invert=(?!)", "--repeat-each=1", "--shard=1/1"];
  } else throw new Error(`unknown runner: ${group.runner}`);
  let head = null;
  try { head = execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch (error) { if (error.status !== 128) throw error; }
  const startedAt = kstNow();
  let listing = null;
  if (group.runner === "playwright") {
    const listArgs = [...args, "--list"];
    const listCode = await invoke(executable, listArgs, { cwd, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(root, collectionPath) }, log: path.join(directory, `${key}-collection.log`) });
    listing = { path: collectionPath, sha256: fs.existsSync(path.join(root, collectionPath)) ? digest(read(collectionPath)) : null, exitCode: listCode, argv: [executable, ...listArgs] };
  }
  const exitCode = listing && listing.exitCode !== 0 ? listing.exitCode : await invoke(executable, args, { cwd, env, log: path.join(directory, `${key}.log`) });
  const report = { schemaVersion: 2, runId, runner: group.runner, head, file: group.runner === "node" ? files[0] : undefined, root: slash(root), testRoot: group.runner === "playwright" ? "frontend/tests/e2e" : undefined, startedAt, endedAt: kstNow(), argv: [executable, ...args], cwd: slash(path.relative(root, cwd)) || ".", exitCode, snapshot, raw: { path: rawPath, sha256: fs.existsSync(rawAbsolute) ? digest(read(rawPath)) : null }, environment: { kind: "unit", versions: { node: process.version, python: execFileSync("python", ["--version"], { encoding: "utf8", windowsHide: true }).trim() } }, conditions: [] };
  if (["pytest", "vitest"].includes(group.runner)) report.collection = { path: collectionPath, sha256: fs.existsSync(path.join(root, collectionPath)) ? digest(read(collectionPath)) : null };
  if (listing) report.collection = listing;
  if (group.runner === "playwright") {
    report.environment = fs.existsSync(environmentPath) ? JSON.parse(fs.readFileSync(environmentPath, "utf8")) : { kind: "browser", error: "missing isolated database identity" };
    if (fs.existsSync(environmentPath)) report.environmentFile = { path: slash(path.relative(root, environmentPath)), sha256: digest(fs.readFileSync(environmentPath)) };
  }
  if (exitCode === 0) {
    try {
      const currentPaths = inputPaths(root);
      if (JSON.stringify(captureSnapshot(inputs, currentPaths, read)) !== JSON.stringify(snapshot)) throw new Error("inputs changed during execution");
      const results = parseReport(group.runner, read(rawPath), report);
      if (group.runner === "playwright") report.screenshots = results.flatMap((instance) => instance.screenshots.map((source) => {
        const bytes = read(source), sha256 = digest(bytes);
        const target = `${output}/screenshot-${sha256}.png`;
        fs.writeFileSync(path.join(root, target), bytes);
        return { instance: instance.name, source, path: target, sha256 };
      }));
      report.conditions = group.conditions.map(({ row, condition, bindings }) => {
        const declarations = [...new Map(bindings.map((binding) => [`${binding.file}::${binding.selector}`, binding])).values()];
        return { caseId: row.id, conditionId: condition.id, fingerprint: conditionFingerprint(row, condition), targets: declarations.map((binding) => ({ file: binding.file, selector: binding.selector, instances: results.filter((entry) => entry.file === binding.file && (binding.line ? entry.line === binding.line : entry.name === binding.selector || entry.name.startsWith(`${binding.selector}[`))).map((entry) => entry.name) })) };
      });
      for (const { row, condition, bindings } of group.conditions) {
        const errors = verifyExecution(report, row, condition, { read, paths: currentPaths, requiredInputs: inputs, bindings, evidenceKind: group.runner === "playwright" ? "browser" : "test" });
        if (errors.length) throw new Error(`${row.id}/${condition.id}: ${errors.join("; ")}`);
      }
    } catch (error) { report.verificationError = error.message; }
  }
  writeJson(path.join(directory, `${key}-execution.json`), report);
  return report;
}

function readLedger(root) {
  const read = (file) => fs.readFileSync(path.join(root, file));
  const json = (file) => JSON.parse(read(file).toString("utf8").replace(/^\uFEFF/, ""));
  const provenance = json(`${BASE}.sources/manifest.json`);
  for (const source of provenance) if (digest(read(source.path)) !== source.sha256) throw new Error(`original hash changed: ${source.path}`);
  const model = normalizeExpectations({ audit: json(provenance[0].path), feedback: json(provenance[1].path), policy: json(`${BASE}.decisions.json`), registry: json(`${BASE}.assertions.json`), provenance });
  const paths = inputPaths(root);
  // A rerun may replace stale execution, but it must never bless a stale binding.
  const pending = structuredClone(model);
  for (const row of pending.cases) { row.currentVerification = "NOT_RUN"; for (const condition of row.assertions) condition.execution = { status: "NOT_RUN" }; }
  pending.metrics = summarize(pending.cases);
  const errors = validateExpectations(pending, read, { paths });
  if (errors.length) throw new Error(errors.join("\n"));
  return { model, paths };
}

/** Recheck before copying; only complete individual conditions update the ledger. */
export function promoteRun(model, paths, directory, root = ROOT) {
  relativePath(directory);
  if (!directory.startsWith(`${RUNTIME}/`) || directory.slice(RUNTIME.length + 1).includes("/")) throw new Error("promotion requires one runtime run directory");
  const runId = path.posix.basename(directory);
  const destination = `${BASE}.sources/verification/${runId}`;
  if (fs.existsSync(path.join(root, destination))) throw new Error("promoted run already exists");
  const read = (file) => fs.readFileSync(path.join(root, relativePath(file)));
  let receiptBytes, receipt;
  try { receiptBytes = read(`${directory}/run.json`); receipt = JSON.parse(receiptBytes); }
  catch (error) { throw new Error(`completion receipt missing/invalid: ${error.message}`); }
  if (receipt.schemaVersion !== 1 || receipt.kind !== "mes-expectation-run" || receipt.runId !== runId || receipt.status !== "PASS" || receipt.failures?.length !== 0 || !Number.isFinite(Date.parse(receipt.completedAt)) || !receipt.caseIds?.length || new Set(receipt.caseIds).size !== receipt.caseIds.length) throw new Error("completion receipt incomplete/failed");
  const expected = buildRunPlan(model, { ids: receipt.caseIds });
  if (receipt.reports !== expected.groups.length || receipt.groups?.length !== expected.groups.length) throw new Error("completion receipt group count mismatch");
  const files = fs.readdirSync(path.join(root, directory)).filter((file) => file.endsWith("-execution.json")).sort();
  const expectedFiles = expected.groups.map((group) => `${groupKey(group)}-execution.json`).sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) throw new Error("completion receipt execution files missing/unexpected");
  for (const [index, group] of expected.groups.entries()) {
    const entry = receipt.groups[index];
    if (JSON.stringify(entry.declaration) !== JSON.stringify(groupDeclaration(group)) || entry.execution?.path !== `${directory}/${groupKey(group)}-execution.json`) throw new Error("completion receipt selection mismatch");
    const bytes = read(entry.execution.path);
    if (digest(bytes) !== entry.execution.sha256) throw new Error("completion receipt execution hash mismatch");
    const report = JSON.parse(bytes);
    if (entry.snapshotSha256 !== report.snapshot?.sha256 || JSON.stringify(entry.artifacts) !== JSON.stringify(artifacts(report))) throw new Error("completion receipt artifacts/snapshot mismatch");
    const observed = report.conditions.map((proof) => ({ ...proof, targets: proof.targets.map(({ file, selector }) => ({ file, selector })) }));
    if (JSON.stringify(observed) !== JSON.stringify(entry.declaration.conditions)) throw new Error("completion receipt condition/target mismatch");
    for (const artifact of entry.artifacts) {
      if (!relativePath(artifact.path).startsWith(`${directory}/`) || artifact.path.slice(directory.length + 1).includes("/") || digest(read(artifact.path)) !== artifact.sha256) throw new Error("completion receipt artifact path/hash mismatch");
    }
  }
  const stagedFiles = new Map(), updates = new Map();
  const receiptFile = `${destination}/run-receipt.json`;
  stagedFiles.set(receiptFile, receiptBytes);
  for (const file of files) {
    const executionBytes = read(`${directory}/${file}`);
    const report = JSON.parse(executionBytes);
    if (report.runId !== runId || report.exitCode !== 0 || report.verificationError || !report.conditions?.length) throw new Error("failed/empty/mismatched run cannot be promoted");
    for (const proof of report.conditions) {
      const row = model.cases.find((entry) => entry.id === proof.caseId);
      const condition = row?.assertions.find((entry) => entry.id === proof.conditionId);
      if (!condition || row.scope === "deferred") throw new Error("unknown/deferred condition in evidence");
      const bindings = condition.bindings.filter((binding) => proof.targets.some((target) => target.file === binding.file && target.selector === binding.selector));
      const errors = verifyExecution(report, row, condition, { read, paths, requiredInputs: requiredInputs(bindings, paths), evidenceKind: report.runner === "playwright" ? "browser" : "test", bindings });
      if (errors.length) throw new Error(`${row.id}/${condition.id}: ${errors.join("; ")}`);
    }
    const promoted = structuredClone(report);
    const originalFile = `${destination}/original-${file}`;
    stagedFiles.set(originalFile, executionBytes);
    promoted.runReceipt = { path: receiptFile, sha256: digest(receiptBytes), originalExecution: { path: originalFile, sha256: digest(executionBytes) } };
    for (const artifact of [promoted.raw, promoted.collection, promoted.environmentFile, ...(promoted.screenshots ?? [])].filter(Boolean)) {
      const originalPath = relativePath(artifact.path);
      if (!originalPath.startsWith(`${directory}/`) || originalPath.slice(directory.length + 1).includes("/")) throw new Error("evidence outside its run directory");
      const bytes = read(originalPath);
      if (digest(bytes) !== artifact.sha256) throw new Error("evidence hash changed before promotion");
      artifact.path = `${destination}/${path.posix.basename(originalPath)}`;
      stagedFiles.set(artifact.path, bytes);
    }
    const evidenceFile = `${destination}/${file}`;
    const bytes = Buffer.from(`${JSON.stringify(promoted, null, 2)}\n`);
    stagedFiles.set(evidenceFile, bytes);
    for (const proof of promoted.conditions) {
      const key = `${proof.caseId}/${proof.conditionId}`;
      if (!updates.has(key)) updates.set(key, []);
      updates.get(key).push({ evidenceFile, evidenceHash: digest(bytes) });
    }
  }
  const candidate = structuredClone(model);
  candidate.cases = candidate.cases.filter((row) => row.assertions.some((condition) => updates.has(`${row.id}/${condition.id}`)));
  for (const row of candidate.cases) {
    for (const condition of row.assertions) condition.execution = updates.has(`${row.id}/${condition.id}`) ? { status: "PASS", evidence: updates.get(`${row.id}/${condition.id}`) } : { status: "NOT_RUN" };
    const count = row.assertions.filter((condition) => condition.execution.status === "PASS").length;
    row.currentVerification = count === row.assertions.length ? "PASS" : count ? "PARTIAL" : "NOT_RUN";
  }
  candidate.metrics = summarize(candidate.cases);
  const errors = validateExpectations(candidate, (file) => stagedFiles.get(file) ?? read(file), { paths });
  if (errors.length) throw new Error(errors.join("\n"));
  const registryPath = path.join(root, `${BASE}.assertions.json`);
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  for (const [key, evidence] of updates) {
    const entry = registry.assertions.find((entry) => `${entry.caseId}/${entry.conditionId}` === key);
    if (!entry) throw new Error(`missing registry assertion: ${key}`);
    if (entry.execution && entry.execution.status !== "NOT_RUN") entry.historicalExecutions = [...(entry.historicalExecutions ?? []), entry.execution];
    entry.execution = { status: "PASS", evidence };
  }
  fs.mkdirSync(path.join(root, destination), { recursive: true });
  for (const [file, bytes] of stagedFiles) fs.writeFileSync(path.join(root, file), bytes, { flag: "wx" });
  writeJson(registryPath, registry);
  return { runId, promotedConditions: updates.size, evidenceDirectory: destination, globalPass: false };
}

/** CLI execution stays in an ignored run directory until explicit promotion. */
export async function runCli(argv = process.argv.slice(2), root = ROOT) {
  if (argv[0] === "--record-browser-environment") {
    if (argv.length !== 2) throw new Error("browser environment metadata argument required");
    return recordBrowserEnvironment(JSON.parse(argv[1]));
  }
  const value = (flag) => { const index = argv.indexOf(flag); if (index < 0) return null; if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`missing ${flag}`); return argv[index + 1]; };
  const { model, paths } = readLedger(root);
  if (value("--promote")) return promoteRun(model, paths, slash(value("--promote")), root);
  const plan = buildRunPlan(model, { ids: (value("--ids") ?? "").split(",").filter(Boolean), tier: value("--tier") ?? (value("--ids") ? null : "smoke") });
  if (argv.includes("--plan")) return plan;
  const runId = value("--run-id") ?? `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error("invalid run ID");
  const output = `${RUNTIME}/${runId}`;
  if (fs.existsSync(path.join(root, output))) throw new Error("run ID already exists");
  const reports = [];
  for (const group of plan.groups) {
    console.log(`Running ${group.runner}: ${group.files.join(", ")}`);
    reports.push(await executeGroup(group, { root, runId, output, paths, inputs: requiredInputs(group.conditions.flatMap((entry) => entry.bindings), paths) }));
  }
  const failed = reports.filter((report) => report.exitCode !== 0 || report.verificationError);
  const result = { schemaVersion: 1, kind: "mes-expectation-run", runId, completedAt: kstNow(), caseIds: plan.caseIds, reports: reports.length,
    groups: reports.map((report, index) => {
      const executionPath = `${output}/${groupKey(plan.groups[index])}-execution.json`;
      return { declaration: groupDeclaration(plan.groups[index]), snapshotSha256: report.snapshot.sha256, execution: { path: executionPath, sha256: digest(fs.readFileSync(path.join(root, executionPath))) }, artifacts: artifacts(report) };
    }),
    status: failed.length ? "FAIL" : "PASS", failures: failed.map((report) => ({ runner: report.runner, exitCode: report.exitCode, error: report.verificationError })), globalPass: false };
  writeJson(path.join(root, output, "run.json"), result);
  if (failed.length) process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
