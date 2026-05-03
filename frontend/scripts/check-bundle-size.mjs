#!/usr/bin/env node
/**
 * Round-16 #4 — Bundle size gate.
 *
 * .next/static/chunks 의 *.js 합산 크기가 임계 (default 2.0 MB) 이내인지 검사.
 * Next.js production build 후 실행. 임계 초과 시 exit 1.
 *
 * 사용:
 *   node scripts/check-bundle-size.mjs              # default 임계
 *   node scripts/check-bundle-size.mjs --max 1.5    # 1.5 MB 강제
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const maxIdx = args.indexOf("--max");
const MAX_MB = maxIdx >= 0 ? parseFloat(args[maxIdx + 1]) : 2.0;
const MAX_BYTES = MAX_MB * 1024 * 1024;

async function walk(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(p)));
      else if (e.name.endsWith(".js")) out.push(p);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`✗ ${dir} 가 없습니다. next build 를 먼저 실행하세요.`);
      process.exit(1);
    }
    throw err;
  }
  return out;
}

async function main() {
  const chunksDir = path.join(FRONTEND_ROOT, ".next", "static", "chunks");
  const files = await walk(chunksDir);

  let total = 0;
  for (const f of files) {
    const stat = await fs.stat(f);
    total += stat.size;
  }

  const totalMB = total / 1024 / 1024;
  const limitMB = MAX_BYTES / 1024 / 1024;
  console.log(`Bundle size (.next/static/chunks): ${totalMB.toFixed(2)} MB (limit ${limitMB.toFixed(2)} MB)`);

  if (total > MAX_BYTES) {
    console.error(`✗ Bundle size ${totalMB.toFixed(2)} MB exceeds limit ${limitMB.toFixed(2)} MB.`);
    process.exit(1);
  }
  console.log(`✓ Bundle size within limit.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
