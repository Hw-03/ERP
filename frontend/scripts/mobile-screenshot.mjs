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
    const vw = document.documentElement.clientWidth;
    const scrollW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0,
    );
    const hasHorizontalOverflow = scrollW > vw + 1;

    // 뷰포트 밖으로 삐져나간 요소 표본(셀렉터/우측좌표) — 평가자가 핀포인트
    const cssPath = (el) => {
      if (!(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      let depth = 0;
      while (cur && cur.nodeType === 1 && depth < 4) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id) { seg += `#${cur.id}`; parts.unshift(seg); break; }
        const cls = (cur.className && typeof cur.className === 'string')
          ? '.' + cur.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        parts.unshift(seg + cls);
        cur = cur.parentElement;
        depth += 1;
      }
      return parts.join(' > ');
    };

    const overflowingElements = [];
    const smallTouchTargets = [];
    const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])';
    const all = document.body ? document.body.querySelectorAll('*') : [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && overflowingElements.length < 12) {
        overflowingElements.push({
          selector: cssPath(el),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    }
    for (const el of document.querySelectorAll(INTERACTIVE)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if ((r.width < 44 || r.height < 44) && smallTouchTargets.length < 15) {
        smallTouchTargets.push({
          selector: cssPath(el),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (el.textContent || '').trim().slice(0, 24),
        });
      }
    }

    return {
      viewportWidth: vw,
      documentScrollWidth: scrollW,
      hasHorizontalOverflow,
      overflowingElements,
      smallTouchTargets,
      containerPaddingLeft: root ? style.paddingLeft : '0px',
      containerPaddingRight: root ? style.paddingRight : '0px',
      containerPaddingTop: root ? style.paddingTop : '0px',
      itemRowHeights: itemRows,
      mobileShellWidth: mobileShell ? mobileShell.getBoundingClientRect().width : null,
      backgroundColor: root ? style.backgroundColor : 'unknown',
    };
  });

  return measurements;
}

async function captureScreenshots() {
  await ensureScreenshotsDir();

  const browser = await chromium.launch();
  const measurements = {};

  try {
    for (const screen of SCREENS) {
      console.log(`\n📱 Capturing ${screen.name} (${screen.width}x${screen.height})...`);

      const context = await browser.newContext({
        viewport: { width: screen.width, height: screen.height },
      });

      const op = await seedOperator(context, BASE_URL);
      if (op) console.log(`  🔑 세션: ${op.name}(${op.department}) wh=${op.warehouse_role}`);

      for (const page of PAGES) {
        const screenshotPath = path.join(
          SCREENSHOTS_DIR,
          `${screen.name}-${page.id}.png`
        );

        const browserPage = await context.newPage();

        try {
          // Navigate to page
          console.log(`  → ${page.label}...`);
          const url = `${BASE_URL}${page.path}`;
          await browserPage.goto(url, { waitUntil: 'networkidle' });

          // Wait for content to load
          await browserPage.waitForTimeout(500);

          // Capture measurements
          const key = `${screen.name}-${page.id}`;
          measurements[key] = await captureMeasurements(browserPage);

          // Capture screenshot
          await browserPage.screenshot({
            path: screenshotPath,
            fullPage: false,
          });

          console.log(`     ✓ ${screenshotPath}`);
        } catch (error) {
          console.error(`     ✗ Failed to capture ${page.label}: ${error.message}`);
        } finally {
          await browserPage.close();
        }
      }

      await context.close();
    }

    // Write measurements to JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(measurements, null, 2));
    console.log(`\n✅ Measurements saved to ${OUTPUT_FILE}`);
    console.log(`📊 Captured ${Object.keys(measurements).length} screen samples`);

  } finally {
    await browser.close();
  }
}

// Ensure dev server is running
console.log('📸 Mobile UI Screenshot Capture');
console.log(`Base URL: ${BASE_URL}`);
console.log('Ensure dev server is running on localhost:3000\n');

captureScreenshots().catch((error) => {
  console.error('❌ Capture failed:', error);
  process.exit(1);
});
