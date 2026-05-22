---
type: file-explanation
source_path: "_attic/.dev/screenshot.mjs"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# screenshot.mjs — screenshot.mjs 설명

## 이 파일은 무엇을 책임지나

`screenshot.mjs`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/_attic/.dev/📁_.dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```js
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'fs';

const BASE = 'http://localhost:3000';
// MODE=light|dark (기본 light). dark 재생성 시 MODE=dark 로 실행.
const MODE = (process.env.MODE || 'light').toLowerCase();
const OUT = `C:/ERP/.dev/screenshots/${MODE}`;

// 해당 모드 폴더만 비우고 재생성 (다른 모드는 보존)
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 라이트 모드: 페이지 로딩 전 localStorage + data-theme 을 세팅
async function applyTheme(ctx) {
  if (MODE === 'light') {
    await ctx.addInitScript(() => {
      try { localStorage.setItem('theme', 'light'); } catch {}
      const setAttr = () => document.documentElement?.setAttribute('data-theme', 'light');
      setAttr();
      document.addEventListener('DOMContentLoaded', setAttr);
    });
  }
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log('  ✓', name);
}

async function tryClick(page, selector, timeout = 5000) {
  try {
    const el = page.locator(selector).first();
    await el.click({ timeout });
    return true;
  } catch { return false; }
}

// 데스크톱 사이드바 탭 (라벨 div가 내부에 있음)
async function clickDesktopTab(page, labelText) {
  await page.evaluate((text) => {
    const shell = document.querySelector('.lg\\:flex');
    if (!shell) return;
    const divs = Array.from(shell.querySelectorAll('div.text-sm.font-bold'));
    const hit = divs.find(d => d.textContent.trim() === text);
    hit?.closest('button')?.click();
  }, labelText);
  await page.waitForTimeout(1500);
}

// 관리자 내부 섹션 탭 (품목/직원/BOM/출하묶음/설정)
async function clickAdminSection(page, labelText) {
  await page.evaluate((text) => {
    const shell = document.querySelector('.lg\\:flex');
    if (!shell) return;
    const divs = Array.from(shell.querySelectorAll('div.text-sm.font-bold'));
```
