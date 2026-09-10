import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";


export function parseDiagnostics(output) {
  const counts = {};
  for (const line of output.split(/\r?\n/)) {
    const located = line.match(/^(.+)\(\d+,\d+\): error (TS\d+):\s*(.+)$/);
    const global = line.match(/^error (TS\d+):\s*(.+)$/);
    if (!located && !global) continue;
    const diagnosticPath = located ? located[1].replaceAll("\\", "/") : "<global>";
    const code = located ? located[2] : global[1];
    const message = (located ? located[3] : global[2]).replace(/\s+/g, " ").trim();
    const key = `${diagnosticPath}:${code}:${message}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}


export function findRegressions(actual, baseline) {
  return Object.entries(actual)
    .filter(([key, count]) => count > (baseline[key] ?? 0))
    .map(([key, count]) => ({ key, baseline: baseline[key] ?? 0, actual: count }))
    .sort((left, right) => left.key.localeCompare(right.key));
}


function run(projectPath, baselinePath, updateBaseline) {
  const tscPath = process.env.TYPECHECK_TSC_PATH ?? path.resolve("node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(
    process.execPath,
    [tscPath, "--project", projectPath, "--pretty", "false"],
    { cwd: process.cwd(), encoding: "utf-8" },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error || result.signal) {
    process.stderr.write(output);
    process.stderr.write(`TypeScript compiler execution failed: ${result.error?.message ?? result.signal}.\n`);
    return 2;
  }
  const diagnostics = parseDiagnostics(output);
  const diagnosticCount = Object.values(diagnostics).reduce((total, count) => total + count, 0);
  let followsDiagnostic = false;
  const unparsed = output.split(/\r?\n/).filter((line) => {
    if (!line.trim()) return false;
    if (/^.+\(\d+,\d+\): error TS\d+:\s*.+$/.test(line) || /^error TS\d+:\s*.+$/.test(line)) {
      followsDiagnostic = true;
      return false;
    }
    if (followsDiagnostic && /^\s+/.test(line)) return false;
    followsDiagnostic = false;
    return true;
  });

  if (unparsed.length > 0 || ![0, 2].includes(result.status)) {
    process.stderr.write(output);
    process.stderr.write(`TypeScript compiler produced fatal/unparsed output or unexpected exit ${result.status}.\n`);
    return 2;
  }

  if (updateBaseline) {
    const payload = {
      version: 1,
      project: projectPath.replaceAll("\\", "/"),
      policy: "Existing debt ceiling; reductions pass, new diagnostic kinds or count increases fail.",
      diagnostic_count: diagnosticCount,
      diagnostics,
    };
    fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    process.stdout.write(`TypeScript baseline updated: ${diagnosticCount} known diagnostics.\n`);
    return 0;
  }

  if (!fs.existsSync(baselinePath)) {
    process.stderr.write(`TypeScript baseline not found: ${baselinePath}\n`);
    return 2;
  }
  const baselinePayload = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
  const baselineCount = Object.values(baselinePayload.diagnostics ?? {}).reduce((total, count) => total + count, 0);
  if (
    baselinePayload.project !== projectPath.replaceAll("\\", "/")
    || baselinePayload.diagnostic_count !== baselineCount
  ) {
    process.stderr.write("TypeScript baseline metadata is inconsistent with its project or diagnostics.\n");
    return 2;
  }
  const regressions = findRegressions(diagnostics, baselinePayload.diagnostics ?? {});
  if (regressions.length > 0) {
    process.stderr.write(output);
    process.stderr.write("\nNew TypeScript diagnostics exceed the checked-in baseline:\n");
    for (const regression of regressions) {
      process.stderr.write(`- ${regression.key} (${regression.baseline} -> ${regression.actual})\n`);
    }
    return 1;
  }
  if (result.status !== 0 && diagnosticCount === 0) {
    process.stderr.write(output || `TypeScript exited with code ${result.status}.\n`);
    return result.status ?? 2;
  }
  process.stdout.write(
    `TypeScript diagnostic baseline passed: ${diagnosticCount} known diagnostics, no new kind or increase.\n`,
  );
  return 0;
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , projectPath, baselinePath, flag] = process.argv;
  if (!projectPath || !baselinePath) {
    process.stderr.write("Usage: node typecheck-baseline.mjs <tsconfig> <baseline.json> [--update-baseline]\n");
    process.exitCode = 2;
  } else {
    process.exitCode = run(projectPath, baselinePath, flag === "--update-baseline");
  }
}
