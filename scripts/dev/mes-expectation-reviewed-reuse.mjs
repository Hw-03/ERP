import path from "node:path";
import { captureSnapshot, digest, parseReport, relativePath } from "./mes-expectation-evidence.mjs";

// This is a format migration allowlist, not a general exclusion for scripts/.
export const COMPATIBILITY_FILES = [
  "scripts/dev/normalize-mes-expectations.mjs",
  "scripts/dev/mes-expectation-reviewed-reuse.mjs",
  "scripts/dev/mes-expectation-reviewed-reuse.test.mjs",
];
export const COMPATIBILITY_SUITES = [
  "scripts/dev/normalize-mes-expectations.test.mjs",
  "scripts/dev/mes-expectation-evidence.test.mjs",
  "scripts/dev/run-mes-expectations.test.mjs",
  "scripts/dev/mes-expectation-reviewed-reuse.test.mjs",
];
const sourceHash = (bytes) => digest(Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const leafTest = (file) => /^frontend\/tests\/e2e\/[^/_][^/]*\.spec\.ts$/.test(file);

/** References stay byte-exact; source snapshots alone normalize checkout newlines. */
function artifact(reference, read) {
  const bytes = read(relativePath(reference?.path));
  if (digest(bytes) !== reference.sha256) throw new Error("review artifact hash mismatch");
  return bytes;
}

/** Local checks supplement the old run; they never impersonate its test instances. */
function verifyLocal(local, changedLeaves, read) {
  if (!changedLeaves.length) return;
  if (local?.kind !== "playwright-list" || local.exitCode !== 0 || local.retries !== 0) throw new Error("local verification incomplete");
  const files = new Map((local.files ?? []).map((f) => [f.path, f.sha256]));
  if (files.size !== local.files.length || changedLeaves.some((f) => !files.has(f))) throw new Error("local verification files missing");
  for (const [file, hash] of files) if (!leafTest(file) || sourceHash(read(file)) !== hash) throw new Error("local verification source changed");
  const log = artifact(local.result, read).toString("utf8").replaceAll("\\", "/");
  const passed = [...log.matchAll(/^\s*ok\s+\d+\s+\[[^\]]+\]\s+›\s+([^\r\n]+?):\d+:\d+\s+›\s+([^\r\n]+?)\s+\([\d.]+(?:ms|s|m)\)\s*$/gm)]
    .map((m) => ({ file: `frontend/${m[1]}`, title: m[2] }));
  if (!passed.length || new Set(passed.map((p) => JSON.stringify(p))).size !== passed.length || !same(passed, local.tests) || !log.includes(`${passed.length} passed (`) || /^\s*\d+ (?:failed|skipped|flaky)|^\s*x\s+\d+/m.test(log) || changedLeaves.some((f) => !passed.some((p) => p.file === f))) throw new Error("local verification result mismatch");
}

/** A verifier migration needs fresh native tool tests bound to its exact code. */
function verifyCompatibility(proof, read) {
  if (proof?.kind !== "node-junit" || proof.exitCode !== 0 || !proof.argv?.includes("--test")) throw new Error("compatibility verification missing");
  for (const suite of COMPATIBILITY_SUITES) if (!proof.argv.includes(suite)) throw new Error("compatibility suite missing");
  const required = [...new Set([...COMPATIBILITY_FILES, ...COMPATIBILITY_SUITES, "scripts/dev/mes-expectation-evidence.mjs", "scripts/dev/run-mes-expectations.mjs"])].sort();
  if (!same(proof.files?.map((f) => f.path).sort(), required)) throw new Error("compatibility inputs incomplete");
  for (const file of proof.files) if (sourceHash(read(file.path)) !== file.sha256) throw new Error("compatibility source changed");
  const results = parseReport("node", artifact(proof.result, read), { root: "/", file: COMPATIBILITY_SUITES[0] });
  if (!results.length || results.some((r) => r.status !== "PASS")) throw new Error("compatibility tests failed/skipped");
}

/** Resolve a reviewed wrapper without changing the original execution or its dates. */
export function resolveReviewedReuse(record, { read, paths }) {
  if (record.schemaVersion !== 3 || record.kind !== "reviewed-reuse") throw new Error("unsupported reviewed execution");
  const report = JSON.parse(artifact(record.original, read).toString("utf8"));
  if (report.schemaVersion !== 2) throw new Error("review cannot chain or wrap non-native evidence");
  const review = JSON.parse(artifact(record.review, read).toString("utf8"));
  if (review.schemaVersion !== 1 || review.kind !== "mes-reviewed-reuse" || !/^[a-f0-9]{40}$/.test(review.head) || !Number.isFinite(Date.parse(review.reviewedAt))) throw new Error("review identity missing");
  if (!same(review.baseline?.selectors, review.current?.selectors)) throw new Error("review scope changed");
  const current = captureSnapshot(review.current.selectors, paths, read);
  if (!same(current, review.current)) throw new Error("review current snapshot changed");
  const before = new Map(review.baseline.files.map((f) => [f.path, f.sha256]));
  const after = new Map(current.files.map((f) => [f.path, f.sha256]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p)).sort();
  const changes = new Map((review.changes ?? []).map((c) => [relativePath(c.path), c]));
  if (changes.size !== review.changes.length || !same([...changes.keys()].sort(), changed)) throw new Error("review changes missing/duplicate");
  const oldBytes = new Map(), leaves = [];
  for (const file of changed) {
    const change = changes.get(file);
    if (before.has(file)) {
      const bytes = artifact(change.before, read);
      if (sourceHash(bytes) !== before.get(file)) throw new Error("review original source mismatch");
      oldBytes.set(file, bytes);
    } else if (change.before) throw new Error("unexpected original source");
    if (!after.has(file)) throw new Error("review cannot approve deleted input");
    if (change.reason === "unexecuted-leaf-test" && leafTest(file) && before.has(file)) leaves.push(file);
    else if (change.reason !== "verifier-compatibility" || !COMPATIBILITY_FILES.includes(file)) throw new Error(`review cannot exclude product/config/fixture: ${file}`);
  }
  const historicalRead = (file) => oldBytes.has(file) ? oldBytes.get(file) : read(file);
  const historicalPaths = [...new Set([...paths.filter((p) => !after.has(p) || before.has(p)), ...before.keys()])];
  if (!same(captureSnapshot(review.baseline.selectors, historicalPaths, historicalRead), review.baseline)) throw new Error("review baseline snapshot invalid");
  if (!same(captureSnapshot(report.snapshot.selectors, historicalPaths, historicalRead), report.snapshot)) throw new Error("review does not match original execution inputs");
  const raw = artifact(report.raw, read), collection = report.collection ? artifact(report.collection, read) : "";
  // Exact serialized file names also cover collection entries that did not execute.
  const sources = `${raw}\n${collection}\n${JSON.stringify(report.conditions)}\n${JSON.stringify(report.argv)}`.replaceAll("\\\\", "/");
  for (const file of leaves) {
    const name = path.posix.basename(file), stem = name.slice(0, -3);
    for (const bytes of [read(file), historicalRead(file)]) {
      if (/\bexport\b|\bmodule\s*\.\s*exports\b|\bexports\s*[.[]/.test(bytes.toString("utf8"))) throw new Error(`reviewed leaf exports a helper: ${file}`);
    }
    if (sources.includes(name)) throw new Error(`reviewed leaf was collected/executed: ${file}`);
    for (const source of current.files.filter((f) => /\.[cm]?[jt]sx?$/.test(f.path) && f.path.startsWith("frontend/") && !leaves.includes(f.path))) {
      const text = read(source.path).toString("utf8");
      if (text.includes(stem)) throw new Error(`reviewed leaf has a consumer: ${source.path}`);
    }
  }
  verifyLocal(review.localVerification, leaves, read);
  if (changed.some((p) => changes.get(p).reason === "verifier-compatibility")) verifyCompatibility(review.compatibility, read);
  return { report, read: historicalRead, paths: historicalPaths, review };
}

/** Preserve a proven baseline, with separate local evidence; never certify the current full suite. */
export function resolveBaselineVerification(record, { read, paths }) {
  if (record.schemaVersion !== 4 || record.kind !== "baseline-verification") throw new Error("unsupported baseline verification");
  const original = JSON.parse(artifact(record.original, read).toString("utf8"));
  if (original.kind !== "reviewed-reuse") throw new Error("baseline must reference a reviewed completion, not another baseline");
  const review = JSON.parse(artifact(record.review, read).toString("utf8"));
  if (review.schemaVersion !== 1 || review.kind !== "mes-baseline-verification" || !/^[a-f0-9]{40}$/.test(review.head) || !Number.isFinite(Date.parse(review.reviewedAt))) throw new Error("baseline identity missing");
  if (!same(review.baseline?.selectors, review.current?.selectors)) throw new Error("baseline scope changed");
  const current = captureSnapshot(review.current.selectors, paths, read);
  if (!same(current, review.current)) throw new Error("baseline current snapshot changed");
  const before = new Map(review.baseline.files.map(f => [f.path, f.sha256]));
  const after = new Map(current.files.map(f => [f.path, f.sha256]));
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(p => before.get(p) !== after.get(p)).sort();
  if (!changed.length || !same(review.changes?.map(c => c.path).sort(), changed)) throw new Error("baseline changes missing/duplicate");
  const oldBytes = new Map();
  for (const change of review.changes) {
    if (!change.reason?.trim() || !before.has(change.path) || !after.has(change.path)) throw new Error("baseline only supports reviewed edits to existing inputs");
    const bytes = artifact(change.before, read);
    if (sourceHash(bytes) !== before.get(change.path)) throw new Error("baseline original source mismatch");
    oldBytes.set(change.path, bytes);
  }
  const historicalRead = file => oldBytes.has(file) ? oldBytes.get(file) : read(file);
  if (!same(captureSnapshot(review.baseline.selectors, paths, historicalRead), review.baseline)) throw new Error("baseline snapshot invalid");
  const priorReview = JSON.parse(artifact(original.review, historicalRead).toString("utf8"));
  if (!same(priorReview.current, review.baseline)) throw new Error("baseline does not match prior completion");
  const local = review.localVerification;
  if (!same(local?.inputs?.selectors, ["frontend/"]) || !same(captureSnapshot(local.inputs.selectors, paths, read), local.inputs)) throw new Error("baseline local inputs changed");
  const localFiles = (local.files ?? []).map(f => f.path);
  if (!localFiles.length) throw new Error("baseline local evidence missing");
  verifyLocal(local, localFiles, read);
  if (changed.some(p => COMPATIBILITY_FILES.includes(p))) verifyCompatibility(review.compatibility, read);
  const resolved = resolveReviewedReuse(original, { read: historicalRead, paths });
  return { ...resolved, baselineReview: review };
}
