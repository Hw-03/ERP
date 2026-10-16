import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { requiredInputs, verifyExecution } from "./mes-expectation-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "docs/superpowers/specs/2026-10-07-mes-expectations";
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
/** Git checkout line endings do not change a test's source identity. */
export const sourceSha256 = (value) => sha256(value.toString().replaceAll("\r\n", "\n"));
const clone = (value) => structuredClone(value);

/** Reject duplicate IDs before any Map can silently overwrite an original row. */
function unique(rows, key, label) {
  const found = new Set();
  for (const row of rows) {
    const id = key(row);
    if (!id || found.has(id)) throw new Error(`${label}: duplicate/missing ${id}`);
    found.add(id);
  }
  return found;
}

function verification(assertions) {
  const passed = assertions.filter((a) => a.execution.status === "PASS").length;
  if (assertions.some((a) => a.execution.status === "FAIL")) return "FAIL";
  return passed === assertions.length ? "PASS" : passed ? "PARTIAL" : "NOT_RUN";
}

/** Sentence boundaries are available; conjunctions still require human atomic review. */
function originalConditions(original) {
  return [["technical", original.expected], ["staff", original.staffExpected !== original.expected ? original.staffExpected : null]]
    .flatMap(([origin, value]) => (value ?? "").split(/(?<=[.!?。])\s+|\n+/u).map((text) => text.trim()).filter(Boolean).map((expected, index) => ({ id: `${origin}-${index + 1}`, origin, expected })));
}

/** Keep prior observations immutable; linking a test never marks a new run PASS. */
export function normalizeExpectations({ audit, feedback, policy, registry, provenance = [] }) {
  const ids = unique(audit.cases, (c) => c.id, "audit");
  unique(policy.cases, (c) => c.id, "policy");
  unique(registry.assertions, (a) => `${a.caseId}/${a.conditionId}`, "registry");
  unique(registry.tests ?? [], (t) => t.id, "tests");
  const tests = new Map((registry.tests ?? []).map((t) => [t.id, t]));
  for (const id of [...policy.cases.map((c) => c.id), ...Object.keys(feedback.reviews), ...registry.assertions.map((a) => a.caseId)]) {
    if (!ids.has(id)) throw new Error(`unknown ID: ${id}`);
  }
  const changes = new Map(policy.cases.map((c) => [c.id, c]));
  const links = new Map(registry.assertions.map((a) => [`${a.caseId}/${a.conditionId}`, a]));
  const cases = audit.cases.map((original) => {
    const change = changes.get(original.id);
    const atomicReview = change?.atomicReview ?? (change ? "reviewed" : "unreviewed");
    if (!["reviewed", "unreviewed"].includes(atomicReview)) throw new Error(`invalid atomic review: ${original.id}`);
    const conditions = change?.conditions ?? originalConditions(original);
    if (!conditions.length || conditions.some((c) => !c.expected?.trim())) throw new Error(`missing conditions: ${original.id}`);
    const conditionIds = unique(conditions, (c) => c.id, original.id);
    for (const link of registry.assertions.filter((a) => a.caseId === original.id)) {
      if (!conditionIds.has(link.conditionId)) throw new Error(`unknown condition: ${original.id}/${link.conditionId}`);
    }
    const assertions = conditions.map((condition) => {
      const link = links.get(`${original.id}/${condition.id}`);
      const bindings = (link?.bindings ?? []).map((binding) => {
        if (!binding.testId) return clone(binding);
        const referenced = tests.get(binding.testId);
        if (!referenced) throw new Error(`unknown test: ${binding.testId}`);
        const { id: _id, ...definition } = referenced;
        return { ...definition, assertion: binding.assertion };
      });
      const coverage = change?.deferred ? "deferred" : bindings.length ? "linked" : change ? "missing" : "browser-needed";
      return { ...clone(condition), coverage, reason: link?.reason ?? (coverage === "linked" ? null : change?.deferred ? "미사용·검수 제외 범위 유지" : change ? "이 개별 조건의 실제 테스트 근거가 아직 없음" : "이번 구현 범위 밖: 현재 조건의 자동 assertion 대조 또는 브라우저 재검수 필요"), bindings, execution: clone(link?.execution ?? { status: "NOT_RUN" }), ...(link?.historicalExecutions ? { historicalExecutions: clone(link.historicalExecutions) } : {}), ...(link?.historicalBindings ? { historicalBindings: clone(link.historicalBindings) } : {}) };
    });
    return {
      id: original.id, source: original.source ?? (original.id.startsWith("PC-DELTA-") ? "DELTA" : "CONTRACT"),
      original: clone(original), userReview: clone(feedback.reviews[original.id] ?? null),
      decisionIds: clone(change?.decisionIds ?? []), finalExpected: change?.finalExpected ?? original.expected,
      finalStaffExpected: change?.finalStaffExpected ?? change?.finalExpected ?? original.staffExpected ?? original.expected,
      action: change?.action ?? original.action, scope: change?.deferred ? "deferred" : change ? "current-decisions" : "preserved-outside-scope",
      verificationTags: clone(change?.verificationTags ?? []),
      atomicReview, atomicReviewNote: atomicReview === "reviewed" ? null : "기대 문구는 보존했다. 복합 조건의 원자성과 검증 범위를 재검토하기 전에는 전체 PASS로 승격할 수 없다.",
      requiredConditionIds: [...conditionIds], assertions, currentVerification: verification(assertions),
    };
  });
  return {
    schemaVersion: policy.schemaVersion ?? 1, policyDate: "2026-10-07", provenance: clone(provenance), originalRun: clone(audit.run),
    semantics: { linkage: "selector + actual assertion fragment + source SHA256", currentPass: "all individual conditions require fresh execution evidence; original observations remain historical", denominator: "active original ledger cases grouped by source; excluded cases are separate" },
    cases, excludedCases: (audit.excludedCases ?? []).map((c) => ({ ...clone(c), status: "deferred" })), metrics: summarize(cases),
  };
}

/** Count base and delta independently from active ledger rows, never fixed constants. */
export function summarize(cases) {
  return Object.fromEntries(["CONTRACT", "DELTA"].map((source) => {
    const rows = cases.filter((c) => c.source === source);
    const eligible = rows.filter((row) => row.scope !== "deferred");
    return [source, { total: rows.length, eligibleCases: eligible.length, deferredCases: rows.length - eligible.length, reviewedCases: eligible.filter((row) => row.atomicReview === "reviewed").length, eligibleConditions: eligible.flatMap((row) => row.assertions).length, linkedCases: eligible.filter((c) => c.assertions.every((a) => a.coverage === "linked")).length, linkedConditions: eligible.flatMap((c) => c.assertions).filter((a) => a.coverage === "linked").length, totalConditions: rows.flatMap((c) => c.assertions).length, executedCases: eligible.filter((c) => c.currentVerification === "PASS").length }];
  }));
}

/** Skip regex syntax so its brackets, quotes and comment markers remain data. */
function regexEnd(source, index, preceding) {
  if (source[index] !== "/" || /[/*]/.test(source[index + 1] ?? "") || !/(?:^|[=(:,;!?{\[&|]|\b(?:return|throw|case|yield))\s*$/.test(preceding)) return -1;
  let escaped = false, characterClass = false;
  for (let end = index + 1; end < source.length; end++) {
    const char = source[end];
    if (char === "\n" || char === "\r") return -1;
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === "[") characterClass = true;
    else if (char === "]") characterClass = false;
    else if (char === "/" && !characterClass) {
      while (/[a-z]/i.test(source[end + 1] ?? "")) end++;
      return end;
    }
  }
  return -1;
}

/** Remove comments while retaining strings used by selectors and expectations. */
function withoutComments(source, python) {
  let output = "", quote = null, escaped = false, line = false, block = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i], next = source[i + 1];
    if (line) { if (char === "\n") { line = false; output += char; } else output += " "; continue; }
    if (block) { if (char === "*" && next === "/") { block = false; output += "  "; i++; } else output += char === "\n" ? char : " "; continue; }
    if (quote) { output += char; if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === quote) quote = null; continue; }
    const regex = python ? -1 : regexEnd(source, i, output);
    if (regex >= 0) { output += source.slice(i, regex + 1); i = regex; continue; }
    if (char === '"' || char === "'" || char === "`") { quote = char; output += char; continue; }
    if (python && char === "#" || !python && char === "/" && next === "/") { line = true; output += " "; continue; }
    if (!python && char === "/" && next === "*") { block = true; output += "  "; i++; continue; }
    output += char;
  }
  return output;
}

/** Bound the fragment to its declared test; a neighbouring test cannot supply proof. */
export function declarationLine(source, selector, python = false) {
  source = withoutComments(source.toString().replaceAll("\r\n", "\n"), python);
  const lines = source.split("\n");
  const executableLines = codeOnly(source, python).split("\n");
  const index = lines.findIndex((line, lineIndex) => python ? new RegExp(`^\\s*(?:async )?def ${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(`).test(executableLines[lineIndex]) : /^\s*(?:it|test)\b/.test(executableLines[lineIndex]) && [JSON.stringify(selector), `'${selector.replaceAll("'", "\\'")}'`, `\`${selector}\``].some((value) => line.includes(value)));
  return index + 1;
}

function testBlock(source, selector, python) {
  const lines = source.split("\n");
  const executableLines = codeOnly(source, python).split("\n");
  const index = declarationLine(source, selector, python) - 1;
  if (index < 0) return null;
  if (!python) {
    const literal = [JSON.stringify(selector), `'${selector.replaceAll("'", "\\'")}'`, `\`${selector}\``].find((value) => lines[index].includes(value));
    const open = lines[index].lastIndexOf("(", lines[index].indexOf(literal));
    if (open < 0) return null;
    const start = (index ? lines.slice(0, index).join("\n").length + 1 : 0) + open;
    const executable = executableLines.join("\n");
    const stack = [], pairs = { ")": "(", "}": "{", "]": "[" };
    for (let offset = start; offset < executable.length; offset++) {
      const char = executable[offset];
      if ("({[".includes(char)) stack.push(char);
      else if (pairs[char]) {
        if (stack.pop() !== pairs[char]) return null;
        if (!stack.length) return source.slice(start, offset + 1);
      }
    }
    return null;
  }
  const indent = lines[index].match(/^\s*/)[0].length;
  let headerEnd = index, parentheses = 0;
  for (; headerEnd < executableLines.length; headerEnd++) {
    for (const char of executableLines[headerEnd]) {
      if (char === "(") parentheses++;
      else if (char === ")") parentheses--;
    }
    if (parentheses === 0 && /:\s*$/.test(executableLines[headerEnd])) break;
  }
  if (headerEnd === executableLines.length) return null;
  const end = executableLines.findIndex((line, lineIndex) => lineIndex > headerEnd && line.trim() && line.match(/^\s*/)[0].length <= indent);
  return lines.slice(index, end < 0 ? undefined : end).join("\n");
}

/** An assertion spelled inside a fixture string or docstring is not executable proof. */
function codeOnly(source, python) {
  let result = "", quote = null, escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (!escaped && source.slice(index, index + quote.length) === quote) { result += " ".repeat(quote.length); index += quote.length - 1; quote = null; }
      else { result += char === "\n" ? "\n" : " "; if (escaped) escaped = false; else if (char === "\\") escaped = true; }
    } else if (!python && regexEnd(source, index, result) >= 0) {
      const end = regexEnd(source, index, result);
      result += " ".repeat(end - index + 1); index = end;
    } else if (char === "'" || char === '"' || char === "`") {
      quote = python && source.slice(index, index + 3) === char.repeat(3) ? char.repeat(3) : char;
      result += " ".repeat(quote.length); index += quote.length - 1;
    } else result += char;
  }
  return result;
}

/** Validate provenance at the assertion boundary; this checks linkage, not execution. */
export function validateExpectations(model, readSource, { requireComplete = false, paths = [] } = {}) {
  const errors = [];
  // Every binding in this validation sees one immutable source snapshot. Cache
  // parsing per declaration because many independent conditions share a test.
  const sources = new Map(), declarations = new Map();
  if (requireComplete && model.schemaVersion !== 2) errors.push("complete verification requires schema 2");
  try { unique(model.cases, (c) => c.id, "model"); } catch (error) { errors.push(error.message); }
  for (const row of model.cases) {
    const prefix = row.id;
    if (requireComplete && row.scope !== "deferred") {
      if (row.atomicReview !== "reviewed") errors.push(`${prefix}: unreviewed conditions`);
      if (row.currentVerification !== "PASS") errors.push(`${prefix}: not complete`);
    }
    if (row.atomicReview !== "reviewed" && row.currentVerification === "PASS") errors.push(`${prefix}: unreviewed compound conditions cannot claim PASS`);
    try { unique(row.assertions, (a) => a.id, prefix); } catch (error) { errors.push(error.message); }
    if (JSON.stringify(row.requiredConditionIds?.slice().sort()) !== JSON.stringify(row.assertions.map((a) => a.id).sort())) errors.push(`${prefix}: missing conditions`);
    if (row.currentVerification !== verification(row.assertions)) errors.push(`${prefix}: partial case cannot claim PASS`);
    for (const assertion of row.assertions) {
      const label = `${prefix}/${assertion.id}`;
      if (model.schemaVersion === 2 && row.scope !== "deferred" && (requireComplete || row.atomicReview === "reviewed") && (!assertion.requiredEvidence?.length || assertion.requiredEvidence.some((kind) => !["test", "browser"].includes(kind)) || new Set(assertion.requiredEvidence).size !== assertion.requiredEvidence.length)) errors.push(`${label}: required evidence must be test/browser`);
      if (assertion.coverage === "linked" && !assertion.bindings.length) errors.push(`${label}: missing binding`);
      for (const binding of assertion.bindings) {
        if (!binding.selector?.trim() || !binding.assertion?.trim() || !binding.file || !binding.sourceHash) { errors.push(`${label}: missing selector/assertion/hash`); continue; }
        if (!/^(?:backend\/tests\/.*\.py|frontend\/.*\.(?:test|spec)\.[cm]?[jt]sx?|scripts\/.*\.test\.mjs)$/.test(binding.file) || binding.file.split("/").includes("..")) { errors.push(`${label}: invalid test file`); continue; }
        try {
          if (!sources.has(binding.file)) {
            const source = readSource(binding.file);
            sources.set(binding.file, { source, hash: sourceSha256(source) });
          }
          const { source, hash } = sources.get(binding.file);
          if (hash !== binding.sourceHash) errors.push(`${label}: stale source hash ${binding.file}`);
          const python = binding.file.endsWith(".py");
          const declarationKey = `${binding.file}::${binding.selector}`;
          if (!declarations.has(declarationKey)) {
            const body = testBlock(withoutComments(source.toString().replaceAll("\r\n", "\n"), python), binding.selector, python);
            declarations.set(declarationKey, { body, line: declarationLine(source, binding.selector, python), code: body ? codeOnly(body, python) : "" });
          }
          const { body, line, code } = declarations.get(declarationKey);
          if (model.schemaVersion === 2 && binding.file.startsWith("frontend/") && binding.line !== line) errors.push(`${label}: missing/stale declaration line`);
          const offset = body?.indexOf(binding.assertion) ?? -1;
          const executableFragment = offset < 0 ? "" : code.slice(offset, offset + binding.assertion.length);
          if (!body || offset < 0 || !(python ? /^\s*(?:assert\s|with pytest\.raises\()/m.test(executableFragment) : /(?:\bexpect(?:\.[\w]+)?\s*\(|\bassert\.[\w]+\s*\()/m.test(executableFragment))) errors.push(`${label}: selector/assertion not found in actual test body`);
        } catch (error) { errors.push(`${label}: source unavailable ${error.message}`); }
      }
      if (!["NOT_RUN", "PASS", "FAIL"].includes(assertion.execution.status)) errors.push(`${label}: invalid execution status`);
      if (assertion.execution.status === "PASS") {
        const results = [];
        const proven = new Set(), evidenceKinds = new Set();
        for (const evidence of assertion.execution.evidence ?? []) {
          try {
            const evidencePath = evidence.evidenceFile ?? "";
            const supportedPath = /^_attic\/runtime\/.*\.json$/.test(evidencePath) || evidencePath.startsWith(`${BASE}.sources/verification/`) && evidencePath.endsWith(".json");
            if (!supportedPath || evidencePath.split("/").includes("..")) throw new Error("invalid execution evidence path");
            const bytes = readSource(evidence.evidenceFile);
            if (sha256(bytes) !== evidence.evidenceHash) throw new Error("stale evidence hash");
            const report = JSON.parse(bytes.toString());
            if (model.schemaVersion === 2) {
              if (report.schemaVersion !== 2) throw new Error("schema 2 raw execution required");
              const targets = report.conditions?.find((entry) => entry.caseId === row.id && entry.conditionId === assertion.id)?.targets ?? [];
              const bindings = assertion.bindings.filter((binding) => targets.some((target) => target.file === binding.file && target.selector === binding.selector));
              const kind = report.runner === "playwright" ? "browser" : "test";
              const problems = verifyExecution(report, row, assertion, { read: readSource, paths, requiredInputs: requiredInputs(bindings, paths), evidenceKind: kind, bindings });
              if (problems.length) throw new Error(problems.join("; "));
              for (const binding of bindings) proven.add(`${binding.file}::${binding.selector}`);
              evidenceKinds.add("test");
              if (kind === "browser") evidenceKinds.add("browser");
              continue;
            }
            if (!report.command?.trim() || !Number.isFinite(Date.parse(report.executedAt))) throw new Error("execution metadata missing");
            unique(report.results ?? [], (result) => `${result.file}::${result.selector}`, "execution results");
            results.push(...(report.results ?? []));
          } catch (error) { errors.push(`${label}: execution ${error.message}`); }
        }
        const complete = model.schemaVersion === 2
          ? assertion.bindings.every((binding) => proven.has(`${binding.file}::${binding.selector}`)) && assertion.requiredEvidence?.every((kind) => evidenceKinds.has(kind))
          : assertion.bindings.every((binding) => results.some((result) => result.status === "PASS" && result.file === binding.file && result.selector === binding.selector && result.sourceHash === binding.sourceHash));
        if (assertion.coverage !== "linked" || !assertion.bindings.length || !complete) errors.push(`${label}: execution PASS missing current evidence`);
      }
    }
  }
  if (JSON.stringify(model.metrics) !== JSON.stringify(summarize(model.cases))) errors.push("stale dynamic metrics");
  return errors;
}

/** A selected run yields concrete test targets, never a global PASS verdict. */
export function selectAssertions(model, { ids = [], tier = null } = {}) {
  const known = new Set(model.cases.map((row) => row.id));
  for (const id of ids) if (!known.has(id)) throw new Error(`unknown ID: ${id}`);
  if (tier && !["smoke", "P0", "full"].includes(tier)) throw new Error(`unknown tier: ${tier}`);
  for (const row of model.cases) if (row.scope === "deferred" && ids.includes(row.id)) throw new Error(`deferred ID: ${row.id}`);
  const rows = model.cases.filter((row) => row.scope !== "deferred" && (!ids.length || ids.includes(row.id)) && (!tier || tier === "full" || row.verificationTags.includes(tier)) && (ids.length || tier || row.scope === "current-decisions"));
  if (!rows.length) throw new Error("empty selection");
  const selectors = new Map();
  for (const row of rows) for (const condition of row.assertions) {
    if (condition.coverage !== "linked" || !condition.bindings.length || condition.bindings.some((binding) => !binding.selector?.trim())) throw new Error(`missing selector: ${row.id}/${condition.id}`);
    for (const binding of condition.bindings) selectors.set(`${binding.file}::${binding.selector}`, { ...binding });
  }
  return { caseIds: rows.map((row) => row.id), selectors: [...selectors.values()], globalPass: false };
}

/** Regeneration is explicit; validation never silently blesses changed test hashes. */
export function runCli(argv = process.argv.slice(2), root = ROOT) {
  const readBytes = (relative) => fs.readFileSync(path.join(root, relative));
  const readJson = (relative) => JSON.parse(readBytes(relative).toString("utf8").replace(/^\uFEFF/, ""));
  const sources = readJson(`${BASE}.sources/manifest.json`);
  for (const source of sources) if (sha256(readBytes(source.path)) !== source.sha256) throw new Error(`original hash changed: ${source.path}`);
  const registry = readJson(`${BASE}.assertions.json`);
  if (argv.includes("--refresh-hashes")) {
    for (const entry of registry.tests ?? []) entry.sourceHash = sourceSha256(readBytes(entry.file));
    for (const assertion of registry.assertions) for (const binding of assertion.bindings ?? []) if (binding.file) binding.sourceHash = sourceSha256(readBytes(binding.file));
    fs.writeFileSync(path.join(root, `${BASE}.assertions.json`), `${JSON.stringify(registry, null, 2)}\n`);
  }
  const model = normalizeExpectations({ audit: readJson(sources[0].path), feedback: readJson(sources[1].path), policy: readJson(`${BASE}.decisions.json`), registry, provenance: sources });
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
  const errors = validateExpectations(model, readBytes, { requireComplete: argv.includes("--require-complete"), paths });
  if (errors.length) throw new Error(errors.join("\n"));
  if (argv.includes("--select")) {
    const value = (name) => { const index = argv.indexOf(name); if (index < 0) return null; if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`missing ${name}`); return argv[index + 1]; };
    return selectAssertions(model, { ids: (value("--ids") ?? "").split(",").filter(Boolean), tier: value("--tier") });
  }
  const rendered = `${JSON.stringify(model, null, 2)}\n`;
  if (argv.includes("--check")) {
    if (readBytes(`${BASE}.json`).toString("utf8").replaceAll("\r\n", "\n") !== rendered) throw new Error("generated expectations stale: regenerate first");
  } else fs.writeFileSync(path.join(root, `${BASE}.json`), rendered);
  return model.metrics;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runCli(), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
