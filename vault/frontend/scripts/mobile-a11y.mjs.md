---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/scripts/mobile-a11y.mjs
tags: [vault, code-note, auto-generated, stub]
---

# mobile-a11y.mjs

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/scripts/mobile-a11y.mjs]]

## 원본 첫 줄

```
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
```
