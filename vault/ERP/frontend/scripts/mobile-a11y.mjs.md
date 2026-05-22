---
type: file-explanation
source_path: "frontend/scripts/mobile-a11y.mjs"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mobile-a11y.mjs — mobile-a11y.mjs 설명

## 이 파일은 무엇을 책임지나

`mobile-a11y.mjs`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/scripts/mobile-a11y.mjs` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
 * Mobile UI Accessibility Scan (WCAG AA)
 * Runs axe-core on all mobile screens
 * Outputs violations to a11y-report.json for Accessibility agent
 */

import { chromium } from 'playwright';
import { injectAxe, checkA11y, getViolations } from 'axe-playwright';
import * as fs from 'fs';
import * as path from 'path';
import { seedOperator } from './_mobile-auth.mjs';

// page.path 가 이미 '/legacy?tab=...' 를 포함하므로 BASE_URL 에는 /legacy 를 붙이지 않는다.
// MOBILE_BASE_URL 로 포트/호스트 오버라이드 가능(기본 localhost:3000).
const BASE_URL = process.env.MOBILE_BASE_URL || 'http://localhost:3000';
const SCREENSHOTS_DIR = path.resolve('./frontend/screenshots');
const OUTPUT_FILE = path.join(SCREENSHOTS_DIR, 'a11y-report.json');

const SCREENS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 768, height: 1024 },
];

const PAGES = [
  { id: 'dashboard', path: '/legacy?tab=dashboard', label: 'Dashboard' },
  { id: 'warehouse', path: '/legacy?tab=warehouse', label: 'Warehouse' },
  { id: 'history', path: '/legacy?tab=history', label: 'History' },
  { id: 'weekly', path: '/legacy?tab=weekly', label: 'Weekly' },
  { id: 'admin', path: '/legacy?tab=admin', label: 'Admin' },
];

async function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

async function runA11yScan() {
  await ensureScreenshotsDir();

  const browser = await chromium.launch();
  const allViolations = {};

  try {
    for (const screen of SCREENS) {
      console.log(`\n♿ Scanning ${screen.name} (${screen.width}x${screen.height})...`);

      const context = await browser.newContext({
        viewport: { width: screen.width, height: screen.height },
      });

      const op = await seedOperator(context, BASE_URL);
      if (op) console.log(`  🔑 세션: ${op.name}(${op.department}) wh=${op.warehouse_role}`);
```
