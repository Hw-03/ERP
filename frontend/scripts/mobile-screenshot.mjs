#!/usr/bin/env node
/**
 * Mobile UI Screenshot Capture
 * Captures 393px (phone) + 768px (tablet) screenshots for all 7 mobile screens
 * Exports CSS measurements to measurements.json for Review agent validation
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000/legacy';
const SCREENSHOTS_DIR = path.resolve('./frontend/screenshots');
const OUTPUT_FILE = path.join(SCREENSHOTS_DIR, 'measurements.json');

const SCREENS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 768, height: 1024 },
];

const PAGES = [
  { id: 'home', path: '/legacy?tab=home', label: 'Home' },
  { id: 'inventory', path: '/legacy?tab=inventory', label: 'Inventory' },
  { id: 'history', path: '/legacy?tab=history', label: 'History' },
  { id: 'warehouse', path: '/legacy?tab=warehouse', label: 'Warehouse' },
  { id: 'dept', path: '/legacy?tab=dept', label: 'Dept' },
  { id: 'admin', path: '/legacy?tab=admin', label: 'Admin' },
  { id: 'more', path: '/legacy?tab=more', label: 'More' },
];

async function ensureScreenshotsDir() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

async function captureMeasurements(page, screenName, pageName) {
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

    return {
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
          measurements[key] = await captureMeasurements(browserPage, screen.name, page.label);

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
