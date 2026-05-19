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

const BASE_URL = 'http://localhost:3000/legacy';
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

      for (const page of PAGES) {
        const browserPage = await context.newPage();

        try {
          // Navigate to page
          console.log(`  → ${page.label}...`);
          const url = `${BASE_URL}${page.path}`;
          await browserPage.goto(url, { waitUntil: 'networkidle' });

          // Wait for content to load
          await browserPage.waitForTimeout(500);

          // Inject axe-core
          await injectAxe(browserPage);

          // Run accessibility check
          try {
            await checkA11y(browserPage, null, {
              detailedReport: true,
              detailedReportOptions: {
                html: true,
              },
            });

            console.log(`     ✓ WCAG AA pass`);
            allViolations[`${screen.name}-${page.id}`] = {
              url: url,
              violations: [],
              passes: true,
            };
          } catch (a11yError) {
            // Get detailed violations
            const violations = await getViolations(browserPage);
            console.log(`     ⚠️  ${violations.length} violations found`);

            allViolations[`${screen.name}-${page.id}`] = {
              url: url,
              violations: violations.map(v => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                nodes: v.nodes.slice(0, 2).map(n => ({
                  html: n.html,
                  target: n.target,
                })),
              })),
              passes: false,
            };
          }
        } catch (error) {
          console.error(`     ✗ Failed to scan ${page.label}: ${error.message}`);
          allViolations[`${screen.name}-${page.id}`] = {
            url: `${BASE_URL}${page.path}`,
            violations: [],
            error: error.message,
          };
        } finally {
          await browserPage.close();
        }
      }

      await context.close();
    }

    // Write report to JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allViolations, null, 2));
    console.log(`\n✅ Accessibility report saved to ${OUTPUT_FILE}`);

    // Summary
    const totalViolations = Object.values(allViolations).reduce(
      (sum, item) => sum + (item.violations?.length || 0),
      0
    );
    console.log(`📊 Total WCAG violations found: ${totalViolations}`);

  } finally {
    await browser.close();
  }
}

console.log('♿ Mobile UI Accessibility Scan');
console.log(`Base URL: ${BASE_URL}`);
console.log('Ensure dev server is running on localhost:3000\n');

runA11yScan().catch((error) => {
  console.error('❌ Scan failed:', error);
  process.exit(1);
});
