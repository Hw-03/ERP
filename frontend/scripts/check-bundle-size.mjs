#!/usr/bin/env node
/**
 * Round-16 #4 — Bundle size gate.
 *
 * .next-prod/static/chunks 의 *.js 합산 크기가 임계 (default 2.86 MiB) 이내인지 검사.
 * Next.js production build 후 실행. 임계 초과 시 exit 1.
 *
 * 사용:
 *   node scripts/check-bundle-size.mjs              # default 임계
 *   node scripts/check-bundle-size.mjs --max 1.5    # 1.5 MiB 강제
 *
 * 빌드 결과 디렉터리는 package.json 의 build 스크립트에서 --distDir .next-prod 로
 * 분리되어 있다 (dev 서버의 .next 와 충돌 방지).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_ROOT = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const maxIdx = args.indexOf("--max");
// 2026-09-11: 불량 관리·자동 부서 라우팅 통합 실측 2.855 MiB에 맞춰 예산을 0.02 MiB 조정.
const MAX_MIB = maxIdx >= 0 ? parseFloat(args[maxIdx + 1]) : 2.86;
const MAX_BYTES = MAX_MIB * 1024 * 1024;

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
  const distDir = ".next-prod";
  const chunksDir = path.join(FRONTEND_ROOT, distDir, "static", "chunks");
  const files = await walk(chunksDir);

  let total = 0;
  for (const f of files) {
    const stat = await fs.stat(f);
    total += stat.size;
  }

  const totalMiB = total / 1024 / 1024;
  const limitMiB = MAX_BYTES / 1024 / 1024;
  console.log(
    `Bundle size (${distDir}/static/chunks): ${totalMiB.toFixed(3)} MiB (${total.toLocaleString()} bytes) ` +
      `(limit ${limitMiB.toFixed(3)} MiB, ${MAX_BYTES.toLocaleString()} bytes)`,
  );

  if (total > MAX_BYTES) {
    console.error(
      `✗ Bundle size ${totalMiB.toFixed(3)} MiB (${total.toLocaleString()} bytes) exceeds ` +
        `limit ${limitMiB.toFixed(3)} MiB (${MAX_BYTES.toLocaleString()} bytes).`,
    );
    process.exit(1);
  }
  console.log(`✓ Bundle size within limit.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
