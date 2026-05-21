---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/scripts/check-bundle-size.mjs
tags: [vault, code-note, auto-generated, stub]
---

# check-bundle-size.mjs

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/scripts/check-bundle-size.mjs]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
#!/usr/bin/env node
/**
 * Round-16 #4 — Bundle size gate.
 *
 * .next-prod/static/chunks 의 *.js 합산 크기가 임계 (default 2.0 MB) 이내인지 검사.
 * Next.js production build 후 실행. 임계 초과 시 exit 1.
 *
 * 사용:
 *   node scripts/check-bundle-size.mjs              # default 임계
 *   node scripts/check-bundle-size.mjs --max 1.5    # 1.5 MB 강제
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
const MAX_MB = maxIdx >= 0 ? parseFloat(args[maxIdx + 1]) : 2.0;
const MAX_BYTES = MAX_MB * 1024 * 1024;

async function walk(dir) {
  const out = [];
```
