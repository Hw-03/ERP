import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseEvidenceSections } from "./generate-mes-regression-review.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs/superpowers/specs/2026-09-14-mes-functional-regression-contract.md",
);
const TEST_ROOTS = ["backend/tests", "frontend", "scripts/dev"];
const CONTRACT_TOKEN = /8(?:\.|_)([0-9]+)(?:-|_)([0-9]{2})/g;
const AUDIT_TEST_PATH = "scripts/dev/check-mes-regression-contract-mapping.test.mjs";

export const PLAN_TARGET_IDS = [
  "8.5-03", "8.5-07", "8.7-03", "8.7-07", "8.8-01", "8.10-02", "8.10-05", "8.16-12",
  "8.16-04", "8.17-04", "8.17-05", "8.17-07", "8.22-07", "8.22-08", "8.22-09", "8.24-04",
  "8.25-04", "8.25-05", "8.25-08", "8.12-01", "8.12-05", "8.12-10", "8.12-12", "8.12-13",
  "8.12-16", "8.3-03", "8.6-09", "8.13-05", "8.13-06", "8.13-12", "8.15-08", "8.15-09",
  "8.17-09", "8.20-08", "8.22-10", "8.23-10", "8.24-13", "8.7-05", "8.20-09", "8.21-05",
  "8.5-06", "8.16-03", "8.19-04", "8.19-25",
];

function collectContractIds(contents) {
  return [...contents.matchAll(CONTRACT_TOKEN)]
    .map(([, section, item]) => `8.${section}-${item}`);
}

function isTestEvidence(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const name = path.basename(normalized);
  if (normalized === AUDIT_TEST_PATH) return false;
  if (
    normalized.includes("/node_modules/")
    || normalized.includes("/.next/")
    || normalized.includes("/__pycache__/")
    || normalized.includes("/test-results/")
  ) return false;
  if (name.endsWith(".py")) {
    return normalized.startsWith("backend/tests/") || name.startsWith("test_");
  }
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name);
}

function collectTestFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => isTestEvidence(path.relative(REPO_ROOT, file)));
}

export function auditContractMappings() {
  const contract = fs.readFileSync(CONTRACT_PATH, "utf8");
  const contractIds = parseEvidenceSections(contract)
    .flatMap((section) => section.items.map((item) => item.id));
  const contractSet = new Set(contractIds);
  const evidence = new Map();
  const discoveredIds = new Set();

  for (const relativeRoot of TEST_ROOTS) {
    const root = path.join(REPO_ROOT, relativeRoot);
    for (const file of collectTestFiles(root)) {
      const contents = fs.readFileSync(file, "utf8");
      for (const id of collectContractIds(contents)) {
        discoveredIds.add(id);
        if (!contractSet.has(id)) continue;
        const relativePath = path.relative(REPO_ROOT, file).replaceAll("\\", "/");
        const paths = evidence.get(id) ?? new Set();
        paths.add(relativePath);
        evidence.set(id, paths);
      }
    }
  }

  const evidenceById = Object.fromEntries(
    [...evidence.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))
      .map(([id, files]) => [id, [...files].sort()]),
  );
  const mappedIds = contractIds.filter((id) => evidence.has(id));
  const missingIds = contractIds.filter((id) => !evidence.has(id));
  const unknownIds = [...discoveredIds].filter((id) => !contractSet.has(id)).sort();

  return { contractIds, evidenceById, mappedIds, missingIds, unknownIds };
}

export function requireCompleteContractMappings(audit = auditContractMappings()) {
  if (audit.unknownIds.length > 0) {
    throw new Error(`원본에 없는 계약 ID: ${audit.unknownIds.join(", ")}`);
  }
  if (audit.missingIds.length > 0) {
    throw new Error(
      `계약 ID 자동 테스트 연결 누락 ${audit.missingIds.length}건: ${audit.missingIds.join(", ")}`,
    );
  }
  return audit;
}

export function requirePlanTargetMappings(audit = auditContractMappings()) {
  const missingTargetIds = PLAN_TARGET_IDS.filter((id) => !audit.evidenceById[id]?.length);
  if (missingTargetIds.length > 0) {
    throw new Error(`계획 대상 계약 ID 자동 테스트 연결 누락 ${missingTargetIds.length}건: ${missingTargetIds.join(", ")}`);
  }
  return audit;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const audit = auditContractMappings();
  console.log(`MES_CONTRACT_MAPPING=${audit.mappedIds.length}/${audit.contractIds.length}`);
  console.log(`MES_CONTRACT_MAPPING_MISSING=${audit.missingIds.length}`);
  console.log(`MES_PLAN_TARGET_MAPPING=${PLAN_TARGET_IDS.filter((id) => audit.evidenceById[id]?.length).length}/${PLAN_TARGET_IDS.length}`);
  if (audit.missingIds.length > 0) console.log(audit.missingIds.join(","));
  if (process.argv.includes("--require-plan-targets")) {
    try {
      requirePlanTargetMappings(audit);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
  if (process.argv.includes("--require-complete")) {
    try {
      requireCompleteContractMappings(audit);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
