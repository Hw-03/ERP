---
type: file-explanation
source_path: "frontend/scripts/check-bundle-size.mjs"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# check-bundle-size.mjs — check-bundle-size.mjs 설명

## 이 파일은 무엇을 책임지나

`check-bundle-size.mjs`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/scripts/check-bundle-size.mjs` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/frontend/scripts/📁_scripts]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```js
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
```
