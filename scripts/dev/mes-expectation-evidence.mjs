import crypto from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const XML_READER = fileURLToPath(new URL("./mes_expectation_junit.py", import.meta.url));
export const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const fingerprint = (value) => digest(JSON.stringify(stable(value)));
const slash = (value) => value.replaceAll("\\", "/");
const PNG_SIGNATURE = "89504e470d0a1a0a";
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});

/** Browser PNGs must contain complete, CRC-valid chunks and decodable pixel rows. */
function validateScreenshot(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error("screenshot PNG signature missing");
  let offset = 8, width = 0, height = 0, channels = 0, ended = false;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("screenshot PNG chunk truncated");
    let crc = 0xffffffff;
    for (let index = offset + 4; index < end - 4; index++) crc = CRC_TABLE[(crc ^ bytes[index]) & 255] ^ crc >>> 8;
    if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(end - 4)) throw new Error("screenshot PNG CRC mismatch");
    const data = bytes.subarray(offset + 8, end - 4);
    if (offset === 8 && type !== "IHDR") throw new Error("screenshot PNG header missing");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) throw new Error("screenshot PNG header invalid");
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[data[9]];
      if (!width || !height || width * height > 100_000_000 || data[8] !== 8 || !channels || data[10] || data[11] || data[12]) throw new Error("screenshot PNG dimensions/encoding invalid");
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") { if (length || end !== bytes.length) throw new Error("screenshot PNG ending invalid"); ended = true; }
    offset = end;
  }
  if (!ended || offset !== bytes.length || !compressed.length) throw new Error("screenshot PNG incomplete");
  const stride = width * channels + 1, expected = stride * height;
  let pixels;
  try { pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected }); }
  catch (error) { throw new Error(`screenshot PNG pixels invalid: ${error.message}`); }
  if (pixels.length !== expected) throw new Error("screenshot PNG pixel rows truncated");
  for (let row = 0; row < height; row++) if (pixels[row * stride] > 4) throw new Error("screenshot PNG row filter invalid");
}

/** The archived receipt keeps the original manifest while paths move on promotion. */
function verifyArchivedReceipt(report, read) {
  const reference = report.runReceipt;
  const bytes = read(relativePath(reference.path)), originalBytes = read(relativePath(reference.originalExecution.path));
  if (digest(bytes) !== reference.sha256 || digest(originalBytes) !== reference.originalExecution.sha256) throw new Error("completion receipt/archive hash mismatch");
  const receipt = JSON.parse(bytes.toString()), original = JSON.parse(originalBytes.toString());
  const entry = receipt.groups?.filter((group) => group.execution.sha256 === reference.originalExecution.sha256);
  if (receipt.kind !== "mes-expectation-run" || receipt.schemaVersion !== 1 || receipt.runId !== report.runId || receipt.status !== "PASS" || receipt.failures?.length !== 0 || entry?.length !== 1) throw new Error("completion receipt does not prove this execution");
  const restored = structuredClone(report);
  delete restored.runReceipt;
  for (const key of ["raw", "collection", "environmentFile"]) if (restored[key]) restored[key].path = original[key]?.path;
  for (const [index, screenshot] of (restored.screenshots ?? []).entries()) screenshot.path = original.screenshots?.[index]?.path;
  if (fingerprint(restored) !== fingerprint(original)) throw new Error("completion receipt execution metadata changed");
}

/** Only repository-relative paths can identify evidence or snapshot inputs. */
export function relativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value) || value.split("/").some((part) => part === ".." || part === ".")) throw new Error(`invalid relative path: ${value}`);
  return value;
}

/** Include directory membership so newly added consumers cannot retain old PASS. */
export function captureSnapshot(selectors, paths, read) {
  if (!selectors?.length) throw new Error("empty snapshot selectors");
  const selected = [...new Set(selectors.map(relativePath))].sort();
  const entries = [...new Set(paths.map(slash))].filter((file) => selected.some((input) => input.endsWith("/") ? file.startsWith(input) : file === input)).sort();
  for (const input of selected) if (!entries.some((file) => input.endsWith("/") ? file.startsWith(input) : file === input)) throw new Error(`empty snapshot input: ${input}`);
  const files = entries.map((file) => {
    relativePath(file);
    const bytes = Buffer.from(read(file));
    // Binary fixture identity is byte-exact; checkout newline conversion is text-only.
    return { path: file, sha256: digest(bytes.includes(0) ? bytes : bytes.toString("utf8").replaceAll("\r\n", "\n")) };
  });
  return { selectors: selected, files, sha256: fingerprint(files) };
}

/** Execution and documentation changes are not part of a condition's contract. */
export function conditionFingerprint(row, condition) {
  return fingerprint({ caseId: row.id, decisions: row.decisionIds, conditionId: condition.id, expected: condition.expected, requiredEvidence: condition.requiredEvidence, bindings: condition.bindings });
}

/** Conservative area defaults cover unknown import/fixture consumers. */
export function requiredInputs(bindings, paths) {
  const selectors = new Set(["scripts/dev/normalize-mes-expectations.mjs", "scripts/dev/mes-expectation-evidence.mjs", "scripts/dev/run-mes-expectations.mjs"]);
  for (const binding of bindings) {
    selectors.add(binding.file);
    if (binding.file.startsWith("backend/")) {
      selectors.add("backend/");
      selectors.add("scripts/");
    } else if (binding.file.startsWith("frontend/")) {
      selectors.add("frontend/");
      selectors.add("scripts/");
      if (binding.file.includes("/e2e/")) selectors.add("backend/");
    } else selectors.add("scripts/");
  }
  for (const input of [".nvmrc", "pytest.ini", "pyproject.toml", ".node-version"]) if (paths.includes(input)) selectors.add(input);
  return [...selectors].sort();
}

function reportFile(value, root, testRoot = "") {
  const normalized = slash(value);
  const base = slash(root).replace(/\/$/, "");
  if (normalized.startsWith(`${base}/`)) return relativePath(normalized.slice(base.length + 1));
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) throw new Error(`report belongs to another root: ${value}`);
  return relativePath(testRoot ? `${testRoot}/${normalized}` : normalized);
}

/** Decode the runner's output, not a hand-authored summary of successful tests. */
export function parseReport(runner, bytes, { root, testRoot = "", file = null } = {}) {
  if (runner === "pytest" || runner === "node") {
    const parsed = spawnSync("python", [XML_READER], { input: bytes, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    if (parsed.status !== 0) throw new Error(`invalid JUnit: ${parsed.stderr?.trim()}`);
    return JSON.parse(parsed.stdout).map((entry) => ({ ...entry, file: runner === "node" ? relativePath(file) : entry.nodeid ? `backend/${entry.nodeid.split("::")[0]}` : `backend/${entry.classname.split(".").filter((part) => !/^Test/.test(part)).join("/")}.py` }));
  }
  const report = JSON.parse(bytes.toString());
  if (runner === "vitest") {
    if (report.success !== true || !Array.isArray(report.testResults)) throw new Error("Vitest run failed or incomplete");
    const rows = report.testResults.flatMap((suite) => {
      if (suite.status !== "passed") throw new Error(`Vitest suite failed: ${suite.name}`);
      return suite.assertionResults.map((test) => ({ file: reportFile(suite.name, root), name: test.fullName, title: test.title, line: test.location?.line, status: test.status === "passed" && !test.failureMessages?.length ? "PASS" : "FAIL", retry: test.mes?.retryCount ?? 0, repeat: test.mes?.repeatCount ?? 0, expectedFailure: test.mes?.expectedFailure ?? false }));
    });
    if (report.numTotalTests !== rows.length) throw new Error("Vitest instance count mismatch");
    return rows;
  }
  if (runner === "playwright") {
    if (!Array.isArray(report.suites) || report.errors?.length) throw new Error("Playwright run failed or incomplete");
    const rows = [];
    const visit = (suite, parents) => {
      const titles = [...parents, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
        rows.push({ file: reportFile(spec.file, root, testRoot), name: `${test.projectName}::${[...titles, spec.title].join(" > ")}`, title: spec.title, line: spec.line, status: test.expectedStatus === "passed" && test.status === "expected" && test.results?.length === 1 && test.results[0].status === "passed" && !test.results[0].errors?.length ? "PASS" : "FAIL", retry: test.results?.[0]?.retry ?? 0, expectedFailure: test.expectedStatus !== "passed", screenshots: (test.results?.[0]?.attachments ?? []).filter((attachment) => attachment.contentType === "image/png" && attachment.path).map((attachment) => reportFile(attachment.path, root)) });
      }
      for (const child of suite.suites ?? []) visit(child, titles);
    };
    for (const suite of report.suites) visit(suite, []);
    return rows;
  }
  throw new Error(`unknown runner: ${runner}`);
}

/** All collected instances for a declaration must pass exactly once. */
export function matchInstances(results, binding, expected) {
  if (!expected?.length || new Set(expected).size !== expected.length) throw new Error("empty/duplicate expected instances");
  const matched = results.filter((entry) => entry.file === binding.file && (binding.line ? entry.line === binding.line : entry.name === binding.selector || entry.name.startsWith(`${binding.selector}[`)));
  if (matched.length !== expected.length || new Set(matched.map((row) => row.name)).size !== matched.length || expected.some((name) => !matched.some((row) => row.name === name))) throw new Error(`missing/duplicate instances: ${binding.file}::${binding.selector}`);
  if (matched.some((row) => row.status !== "PASS" || row.retry || row.repeat || row.expectedFailure)) throw new Error(`non-passing instance: ${binding.selector}`);
  return matched;
}

/** Revalidate saved raw evidence and current inputs; v1 summaries cannot close v2. */
export function verifyExecution(report, row, condition, { read, paths, requiredInputs, evidenceKind = "test", bindings = condition.bindings }) {
  try {
    if (report.schemaVersion !== 2 || !report.runId || report.exitCode !== 0 || !Array.isArray(report.argv) || !report.argv.length || !report.cwd || !Number.isFinite(Date.parse(report.startedAt)) || !Number.isFinite(Date.parse(report.endedAt)) || Date.parse(report.endedAt) < Date.parse(report.startedAt)) throw new Error("execution metadata incomplete/failed");
    if (!report.environment?.versions || !Object.keys(report.environment.versions).length) throw new Error("runtime identity missing");
    if (report.runReceipt) verifyArchivedReceipt(report, read);
    if (evidenceKind === "browser") {
      if (report.runner !== "playwright" || report.environment.kind !== "browser" || !report.environment.baseUrl || !report.environment.database?.revision || !report.environment.database?.fixtureHash || !report.environment.database?.logicalSnapshotHash || !report.environment.database?.bootId) throw new Error("browser environment/DB identity missing");
      const environmentBytes = read(relativePath(report.environmentFile?.path));
      if (digest(environmentBytes) !== report.environmentFile.sha256 || fingerprint(JSON.parse(environmentBytes.toString())) !== fingerprint(report.environment)) throw new Error("browser environment artifact changed");
    }
    for (const input of requiredInputs) if (!report.snapshot?.selectors?.includes(input)) throw new Error(`missing required snapshot input: ${input}`);
    const current = captureSnapshot(report.snapshot.selectors, paths, read);
    if (JSON.stringify(current) !== JSON.stringify(report.snapshot)) throw new Error("stale product/config/test snapshot");
    const proof = report.conditions?.filter((entry) => entry.caseId === row.id && entry.conditionId === condition.id);
    if (proof?.length !== 1 || proof[0].fingerprint !== conditionFingerprint(row, condition)) throw new Error("missing/stale condition fingerprint");
    const raw = read(relativePath(report.raw.path));
    if (digest(raw) !== report.raw.sha256) throw new Error("raw report hash mismatch");
    const results = parseReport(report.runner, raw, report);
    for (const binding of bindings) {
      const target = proof[0].targets?.filter((entry) => entry.file === binding.file && entry.selector === binding.selector);
      if (target?.length !== 1) throw new Error("missing/duplicate target");
      const matched = matchInstances(results, binding, target[0].instances);
      if (report.runner === "playwright") for (const instance of matched) {
        if (!instance.screenshots.length) throw new Error(`missing screenshot attachment: ${instance.name}`);
        for (const source of instance.screenshots) {
          const captures = report.screenshots?.filter((entry) => entry.instance === instance.name && entry.source === source);
          if (captures?.length !== 1) throw new Error(`missing/duplicate screenshot evidence: ${instance.name}`);
          const bytes = Buffer.from(read(relativePath(captures[0].path)));
          if (digest(bytes) !== captures[0].sha256) throw new Error("screenshot hash mismatch");
          validateScreenshot(bytes);
        }
      }
      if (report.runner === "playwright") {
        if (report.collection?.exitCode !== 0 || !report.collection.argv?.includes("--list")) throw new Error("Playwright collection failed/missing");
        const bytes = read(relativePath(report.collection.path));
        if (digest(bytes) !== report.collection.sha256) throw new Error("collection hash mismatch");
        try { matchInstances(parseReport("playwright", bytes, report).map((entry) => ({ ...entry, status: "PASS" })), binding, target[0].instances); }
        catch (error) { throw new Error(`collection: ${error.message}`); }
      }
      if (["vitest", "pytest"].includes(report.runner)) {
        const collectionBytes = read(relativePath(report.collection?.path));
        if (digest(collectionBytes) !== report.collection.sha256) throw new Error("collection hash mismatch");
        const collection = JSON.parse(collectionBytes.toString());
        if (collection.schemaVersion !== 1) throw new Error("unsupported collection");
        try {
          matchInstances(collection.collected.map((entry) => ({ ...entry, status: entry.mode === "run" ? "PASS" : "FAIL" })), binding, target[0].instances);
          matchInstances(collection.completed.map((entry) => ({ ...entry, status: entry.mode === "run" ? entry.status : "FAIL" })), binding, target[0].instances);
        } catch (error) { throw new Error(`collection: ${error.message}`); }
      }
    }
    if (!bindings.length) throw new Error("no executable evidence binding");
    return [];
  } catch (error) { return [error.message]; }
}
