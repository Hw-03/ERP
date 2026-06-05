#!/usr/bin/env node
/**
 * Mobile UI Performance Measurement
 * Runs Lighthouse on phone (393px) and tablet (768px)
 * Captures FPS, CLS, LCP metrics to perf-*.json
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 구식 home 경로 제거 — 현재 라우팅은 /mes?tab=...
// MOBILE_BASE_URL 로 호스트/포트 오버라이드 가능(기본 localhost:3000).
const BASE_URL = (process.env.MOBILE_BASE_URL || 'http://localhost:3000') + '/mes?tab=dashboard';
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
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        try {
          const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
          const scores = report.lighthouseResult?.audits || {};

          const fps = scores['mainthread-work-breakdown']?.score || 'N/A';
          const cls = scores['cumulative-layout-shift']?.numericValue || 0;
          const lcp = scores['largest-contentful-paint']?.numericValue || 0;

          console.log(`   ✓ ${screenName}:`);
          console.log(`     FPS Score: ${(fps * 100).toFixed(1)}%`);
          console.log(`     CLS: ${cls.toFixed(3)}`);
          console.log(`     LCP: ${(lcp / 1000).toFixed(2)}s`);

          resolve({ screenName, outputPath, success: true });
        } catch (e) {
          console.error(`   ✗ Failed to parse report: ${e.message}`);
          reject(e);
        }
      } else {
        console.error(`   ✗ Lighthouse failed (code ${code})`);
        if (stderr) console.error(`     ${stderr}`);
        reject(new Error(`Lighthouse exited with code ${code}`));
      }
    });
  });
}

async function capturePerformance() {
  await ensureScreenshotsDir();

  console.log('⚡ Mobile UI Performance Measurement');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('Ensure dev server is running on localhost:3000\n');

  try {
    for (const screen of SCREENS) {
      await runLighthouse(screen.name, screen.width, screen.height);
    }

    console.log('\n✅ Performance reports saved to frontend/screenshots/');
    console.log('   - perf-phone.json');
    console.log('   - perf-tablet.json');
  } catch (error) {
    console.error('❌ Performance measurement failed:', error.message);
    process.exit(1);
  }
}

capturePerformance();
