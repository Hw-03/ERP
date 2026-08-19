import { spawnSync } from "node:child_process";
import path from "node:path";

const TEST_PATH = /^(?:app|lib|scripts)\/.+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/;

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 1;
}

const project = process.argv[2];
if (!project) {
  process.exitCode = fail("Usage: node verify-test-typecheck-manifest.mjs <tsconfig>");
} else {
  const policy = spawnSync(
    "python",
    ["../scripts/dev/verification_policy.py", "--repo-root", "..", "--list-frontend-unit-tests"],
    { encoding: "utf-8" },
  );
  if (policy.status !== 0) {
    process.exitCode = fail(policy.stderr || "verification policy test manifest failed");
  } else {
    const expected = new Set(JSON.parse(policy.stdout).map((file) => file.replace(/^frontend\//, "")));
    const tsc = spawnSync(
      process.execPath,
      [path.resolve("node_modules/typescript/bin/tsc"), "--project", project, "--listFilesOnly", "--pretty", "false"],
      { encoding: "utf-8" },
    );
    if (tsc.status !== 0) {
      process.stderr.write(`${tsc.stdout}${tsc.stderr}`);
      process.exitCode = fail("TypeScript included-file manifest failed.");
    } else {
      const actual = new Set(tsc.stdout.split(/\r?\n/).filter(Boolean).map((file) => (
        path.relative(process.cwd(), file).replaceAll("\\", "/")
      )).filter((file) => TEST_PATH.test(file)));
      const missing = [...expected].filter((file) => !actual.has(file)).sort();
      const unexpected = [...actual].filter((file) => !expected.has(file)).sort();
      if (missing.length || unexpected.length) {
        process.exitCode = fail(`Test typecheck manifest mismatch. missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)}`);
      } else {
        process.stdout.write(`Test typecheck manifest passed: ${actual.size} tracked test files.\n`);
      }
    }
  }
}
