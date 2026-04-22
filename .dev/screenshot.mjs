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
    const hit = divs.find(d => d.textContent.trim() === text);
    hit?.closest('button')?.click();
  }, labelText);
  // 워크스페이스 헤더가 바뀔 때까지 대기
  try {
    await page.waitForFunction((text) => {
      const shell = document.querySelector('.lg\\:flex');
      if (!shell) return false;
      const headers = Array.from(shell.querySelectorAll('div.text-2xl.font-black'));
      return headers.some(h => h.textContent.trim() === `${text} 관리`);
    }, labelText, { timeout: 3000 });
  } catch {}
  await page.waitForTimeout(600);
}

// PIN 숫자 한 자리 클릭 (mobile | desktop)
async function clickPinDigit(page, digit, scope) {
  await page.evaluate(({ digit, scope }) => {
    let root;
    if (scope === 'desktop') {
      root = document.querySelector('.lg\\:flex') || document;
    } else {
      root = document.querySelector('.lg\\:hidden') || document;
    }
    const btns = Array.from(root.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.trim() === digit);
    btn?.click();
  }, { digit, scope });
  await page.waitForTimeout(350);
}

async function enterPin(page, pin, scope) {
  for (const d of pin) await clickPinDigit(page, d, scope);
  await page.waitForTimeout(1800);
}

// 모바일 바텀시트 닫기 (배경 클릭 → onClose)
async function closeBottomSheet(page) {
  await page.mouse.click(5, 5);
  await page.waitForTimeout(500);
}

// 모바일 탭/섹션 버튼 클릭
// 메인 하단 탭바(재고/창고입출고/부서입출고/관리자)는 이모지+라벨 2-div 구조라
// textContent 정확매칭이 실패 → 내부 div 텍스트 매칭 우선 시도.
async function clickMobileSection(page, labelText) {
  const ok = await page.evaluate((text) => {
    const mobile = document.querySelector('.lg\\:hidden');
    if (!mobile) return false;
    const btns = Array.from(mobile.querySelectorAll('button'));
    // 1) 내부 div 중 텍스트가 정확히 일치
    let btn = btns.find(b =>
      Array.from(b.querySelectorAll('div')).some(d => d.textContent.trim() === text)
    );
    // 2) 버튼 자체 textContent 정확 일치 (SectionTabs 같이 자식 없는 단순 버튼)
    if (!btn) btn = btns.find(b => b.textContent.trim() === text);
    if (!btn) return false;
    btn.click();
    return true;
  }, labelText);
  await page.waitForTimeout(700);
  return ok;
}

// 모바일 메인 스크롤을 상단으로
async function resetMobileScroll(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('main, [class*="overflow-y-auto"]').forEach(el => {
      el.scrollTop = 0;
    });
  });
  await page.waitForTimeout(200);
}

async function goto(page, url) {
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2500);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ══════════════════════════════════════════
  // 데스크톱 (1440×900)
  // ══════════════════════════════════════════
  console.log(`\n[데스크톱 / ${MODE}]`);
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await applyTheme(desk);

  // ── 대시보드 ──
  {
    const p = await desk.newPage();
    await goto(p, '/');
    await shot(p, 'desk_01_dashboard');

    if (await tryClick(p, 'button:has-text("부족")', 3000)) {
      await p.waitForTimeout(800);
      await shot(p, 'desk_02_dashboard_kpi_shortage');
      await tryClick(p, 'button:has-text("전체")', 2000);
      await p.waitForTimeout(500);
    }

    if (await tryClick(p, 'button:has-text("DX3000")', 3000)) {
      await p.waitForTimeout(800);
      await shot(p, 'desk_03_dashboard_model_filter');
      await tryClick(p, 'button:has-text("전체")', 2000);
      await p.waitForTimeout(500);
    }

    const row = p.locator('table tbody tr').first();
    if (await row.count() > 0) {
      await row.click();
      await p.waitForTimeout(1000);
      await shot(p, 'desk_04_dashboard_detail_panel');
    }
    await p.close();
  }

  // ── 입출고 ──
  {
    const p = await desk.newPage();
    await goto(p, '/');
    await clickDesktopTab(p, '입출고');
    await p.waitForTimeout(1500);
    await shot(p, 'desk_05_warehouse_io');

    // 검색창: 정확한 placeholder로 찾기
    try {
      const search = p.getByPlaceholder('품목명, 코드, 바코드 검색');
      await search.scrollIntoViewIfNeeded({ timeout: 3000 });
      await search.click({ timeout: 3000 });
      await search.type('LED', { delay: 80 });
      await p.waitForTimeout(1000);
      await shot(p, 'desk_06_warehouse_search');
    } catch (e) {
      console.log('  skip: warehouse search —', e.message.split('\n')[0]);
    }
    await p.close();
  }

  // ── 입출고 내역 ──
  {
    const p = await desk.newPage();
    await goto(p, '/');
    await clickDesktopTab(p, '입출고 내역');
    await p.waitForTimeout(1200);
    await shot(p, 'desk_07_history');

    // 유형 필터 "출고" — 데스크톱 쉘 안에서 정확한 텍스트 버튼 찾기
    const filterClicked = await p.evaluate(() => {
      const shell = document.querySelector('.lg\\:flex');
      if (!shell) return false;
      const btns = Array.from(shell.querySelectorAll('button'));
      const btn = btns.find(b => b.textContent.trim() === '출고');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (filterClicked) {
      await p.waitForTimeout(800);
      await shot(p, 'desk_08_history_filtered');
    }
    await p.close();
  }

  // ── 관리 (PIN → 각 섹션) ──
  {
    const p = await desk.newPage();
    await goto(p, '/');
    await clickDesktopTab(p, '관리');
    await p.waitForTimeout(1000);
    await shot(p, 'desk_09_admin_pinlock');

    await clickPinDigit(p, '0', 'desktop');
    await clickPinDigit(p, '0', 'desktop');
    await shot(p, 'desk_10_admin_pin_typing');

    await clickPinDigit(p, '0', 'desktop');
    await clickPinDigit(p, '0', 'desktop');
    await p.waitForTimeout(2000);

    // 품목 (기본)
    await shot(p, 'desk_11_admin_items');

    // 품목 하나 클릭 → 우측 편집 패널
    const itemClicked = await p.evaluate(() => {
      const shell = document.querySelector('.lg\\:flex');
      if (!shell) return false;
      // 아이템 행 버튼은 내부 div.text-sm.font-semibold 에 품목명
      const divs = Array.from(shell.querySelectorAll('div.text-sm.font-semibold'));
      const target = divs.find(d => d.textContent.trim() === 'POWER LED');
      const btn = target?.closest('button');
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (itemClicked) {
      await p.waitForTimeout(800);
      await shot(p, 'desk_12_admin_item_selected');
    } else {
      console.log('  skip: item selected');
    }

    // 직원
    await clickAdminSection(p, '직원');
    await shot(p, 'desk_13_admin_employees');

    // BOM
    await clickAdminSection(p, 'BOM');
    await shot(p, 'desk_14_admin_bom');

    // 출하묶음
    await clickAdminSection(p, '출하묶음');
    await shot(p, 'desk_15_admin_packages');

    // 설정
    await clickAdminSection(p, '설정');
    await shot(p, 'desk_16_admin_settings');

    await p.close();
  }

  await desk.close();

  // ══════════════════════════════════════════
  // 모바일 (390×844)
  // ══════════════════════════════════════════
  console.log(`\n[모바일 / ${MODE}]`);
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await applyTheme(mob);

  // ── 재고 ──
  {
    const p = await mob.newPage();
    await goto(p, '/');
    await clickMobileSection(p, '재고');
    await p.waitForTimeout(800);
    await resetMobileScroll(p);
    await shot(p, 'mob_01_inventory');

    // 첫 번째 실제 아이템 버튼 (아이템명으로)
    try {
      await p.locator('button:has-text("POWER LED")').first().click({ timeout: 3000 });
      await p.waitForTimeout(1000);
      await shot(p, 'mob_02_inventory_bottomsheet');
      await closeBottomSheet(p);
    } catch { console.log('  skip: inventory bottomsheet'); }
    await p.close();
  }

  // ── 창고입출고 ──
  {
    const p = await mob.newPage();
    await goto(p, '/');
    await clickMobileSection(p, '창고입출고');
    await p.waitForTimeout(1200);
    await resetMobileScroll(p);
    await shot(p, 'mob_03_warehouse');
    await p.close();
  }

  // ── 부서입출고 ──
  {
    const p = await mob.newPage();
    await goto(p, '/');
    await clickMobileSection(p, '부서입출고');
    await p.waitForTimeout(1200);
    await resetMobileScroll(p);
    await shot(p, 'mob_04_dept');
    await p.close();
  }

  // ── 관리자 (PIN → 각 섹션) ──
  {
    const p = await mob.newPage();
    await goto(p, '/');
    await clickMobileSection(p, '관리자');
    await p.waitForTimeout(1200);
    await shot(p, 'mob_05_admin_pinlock');

    await clickPinDigit(p, '0', 'mobile');
    await clickPinDigit(p, '0', 'mobile');
    await shot(p, 'mob_06_admin_pin_typing');

    await clickPinDigit(p, '0', 'mobile');
    await clickPinDigit(p, '0', 'mobile');
    await p.waitForTimeout(2000);
    await resetMobileScroll(p);

    // 상품 (기본)
    await shot(p, 'mob_07_admin_items');

    // 편집 바텀시트
    try {
      await p.locator('button:has-text("편집")').first().click({ timeout: 3000 });
      await p.waitForTimeout(1000);
      await shot(p, 'mob_08_admin_item_edit_sheet');
      await closeBottomSheet(p);
    } catch { console.log('  skip: edit sheet'); }

    // 직원
    await clickMobileSection(p, '직원');
    await resetMobileScroll(p);
    await shot(p, 'mob_09_admin_employees');

    // BOM
    await clickMobileSection(p, 'BOM');
    await resetMobileScroll(p);
    await shot(p, 'mob_10_admin_bom');

    // 출하묶음
    await clickMobileSection(p, '출하묶음');
    await resetMobileScroll(p);
    await shot(p, 'mob_11_admin_packages');

    // 설정
    await clickMobileSection(p, '설정');
    await resetMobileScroll(p);
    await shot(p, 'mob_12_admin_settings');

    await p.close();
  }

  await mob.close();
  await browser.close();

  console.log('\n✅ 전체 완료!  저장 위치:', OUT);
})();
