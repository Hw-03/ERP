---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/scripts/mobile-performance.mjs
tags: [vault, code-note, auto-generated, stub]
---

# mobile-performance.mjs

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/scripts/mobile-performance.mjs]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
