---
type: file-explanation
source_path: "frontend/scripts/mobile-screenshot.mjs"
importance: normal
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# mobile-screenshot.mjs — mobile-screenshot.mjs 설명

## 이 파일은 무엇을 책임지나

`mobile-screenshot.mjs`는 JavaScript 설정/코드입니다. 프로젝트 구조 안에서 `frontend/scripts/mobile-screenshot.mjs` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

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
 * Mobile UI Screenshot Capture
 * Captures 393px (phone) + 768px (tablet) screenshots for all 7 mobile screens
 * Exports CSS measurements to measurements.json for Review agent validation
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { seedOperator } from './_mobile-auth.mjs';

// page.path 가 이미 '/legacy?tab=...' 를 포함하므로 BASE_URL 에는 /legacy 를 붙이지 않는다.
// MOBILE_BASE_URL 로 포트/호스트 오버라이드 가능(기본 localhost:3000).
const BASE_URL = process.env.MOBILE_BASE_URL || 'http://localhost:3000';
const SCREENSHOTS_DIR = path.resolve('./frontend/screenshots');
const OUTPUT_FILE = path.join(SCREENSHOTS_DIR, 'measurements.json');

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

async function captureMeasurements(page) {
  const measurements = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="screen-root"]') ||
                 document.querySelector('main') ||
                 document.body.firstElementChild;

    const itemRows = [...document.querySelectorAll('[data-testid="item-row"]') ||
                       document.querySelectorAll('[data-testid="list-item"]') ||
                       []]
      .slice(0, 3)
      .map(r => r.getBoundingClientRect().height);

    const mobileShell = document.querySelector('[data-testid="mobile-shell"]') ||
                       document.querySelector('[class*="flex h-screen"]');

    const style = root ? getComputedStyle(root) : {};

    // ── 하드페일 #1: 가로 오버플로 ──────────────────────────
```
