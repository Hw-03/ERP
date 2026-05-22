---
type: file-explanation
source_path: "frontend/scripts/mobile-performance.mjs"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mobile-performance.mjs — mobile-performance.mjs 설명

## 이 파일은 무엇을 책임지나

`mobile-performance.mjs`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/scripts/mobile-performance.mjs` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
 * Mobile UI Performance Measurement
 * Runs Lighthouse on phone (393px) and tablet (768px)
 * Captures FPS, CLS, LCP metrics to perf-*.json
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 구식 /legacy/home 경로 제거 — 현재 라우팅은 /legacy?tab=...
// MOBILE_BASE_URL 로 호스트/포트 오버라이드 가능(기본 localhost:3000).
const BASE_URL = (process.env.MOBILE_BASE_URL || 'http://localhost:3000') + '/legacy?tab=dashboard';
const SCREENSHOTS_DIR = path.resolve('./frontend/screenshots');

const SCREENS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 768, height: 1024 },
];

async function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

function runLighthouse(screenName, width, height) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(SCREENSHOTS_DIR, `perf-${screenName}.json`);

    const args = [
      BASE_URL,
      '--output=json',
      `--output-path=${outputPath}`,
      '--form-factor=mobile',
      `--screen-emulation.width=${width}`,
      `--screen-emulation.height=${height}`,
      '--throttling.cpuSlowdownMultiplier=4',
      '--quiet',
      '--chrome-flags="--headless=new"',
    ];

    console.log(`\n⚡ Running Lighthouse on ${screenName} (${width}x${height})...`);
    console.log(`   npx lighthouse ${args.join(' ')}`);

    const process = spawn('npx', ['lighthouse', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    process.stdout?.on('data', (data) => {
```
