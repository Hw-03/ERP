/**
 * CP6 최종 브라우저 증거.
 *
 * A4/A5는 실제 화면 경로를 검증하고, 동결 화면 캡처는 명시적인 최종 증거
 * 디렉터리가 주어진 통합 실행에서만 생성한다.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

import { loginAsOperator, readSeed } from "./_helpers";

const POPULATION_NOTICE = "KPI 숫자는 PA·PF 중간품목을 제외하며, 좁힌 목록에는 PA·PF가 표시될 수 있습니다.";

interface AnimationProbeEvent {
  action: string;
  type: "start" | "end";
  animationName: string;
}

interface AnimationSnapshot {
  starts: number;
  ends: number;
  computedAnimationName: string;
  ownAnimationCount: number;
}

interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FrozenMetrics {
  mobileViewport: { width: number; height: number };
  mobileNav: LayoutBox;
  desktopViewport: { width: number; height: number };
  desktopWorkShell: LayoutBox;
  finalRequirements: LayoutBox;
  finalBomChanges: LayoutBox;
  finalBomChangeList: LayoutBox;
}

function writeEvidence(filename: string, value: unknown): void {
  const evidenceDir = process.env.CP6_FINAL_EVIDENCE_DIR;
  if (!evidenceDir) return;
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(resolve(evidenceDir, filename), JSON.stringify(value, null, 2), "utf8");
}

function isItemsListRequest(route: Route): boolean {
  const request = route.request();
  const url = new URL(request.url());
  return request.method() === "GET"
    && url.pathname === "/api/items"
    && url.searchParams.get("limit") === "2000";
}

function isItemsListResponse(urlValue: string, method: string): boolean {
  const url = new URL(urlValue);
  return method === "GET"
    && url.pathname === "/api/items"
    && url.searchParams.get("limit") === "2000";
}

async function gotoDashboardThroughItemsBarrier(page: Page): Promise<void> {
  let releaseRequest!: () => void;
  let markIntercepted!: () => void;
  const release = new Promise<void>((resolveRelease) => { releaseRequest = resolveRelease; });
  const intercepted = new Promise<void>((resolveIntercepted) => { markIntercepted = resolveIntercepted; });
  let held = false;

  const handler = async (route: Route): Promise<void> => {
    if (isItemsListRequest(route)) {
      // React Strict Mode can abort and reissue the initial query. Keep every
      // matching request behind the same barrier until the loading UI is checked.
      if (!held) {
        held = true;
        markIntercepted();
      }
      await release;
    }
    await route.continue();
  };

  await page.route("**/api/items?*", handler);
  await page.goto("/mes?tab=dashboard");
  await intercepted;

  await expect(page.getByText(POPULATION_NOTICE, { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("재고 데이터를 불러오는 중입니다...", { exact: true }).filter({ visible: true })).toBeVisible();

  const responsePromise = page.waitForResponse((response) => (
    isItemsListResponse(response.url(), response.request().method())
  ));
  releaseRequest();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  await expect(page.getByText("E2E원자재튜브", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("재고 데이터를 불러오는 중입니다...", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.unroute("**/api/items?*", handler);
}

async function exerciseInventoryNotice(page: Page, viewport: "desktop" | "mobile"): Promise<Record<string, string>> {
  const desktop = viewport === "desktop";
  await page.setViewportSize(desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 });
  await gotoDashboardThroughItemsBarrier(page);

  const notice = page.getByText(POPULATION_NOTICE, { exact: true }).filter({ visible: true });
  const allCard = page.getByRole("button", { name: /^전체/ }).filter({ visible: true }).first();
  const search = desktop
    ? page.getByRole("textbox", { name: "자재 검색" }).filter({ visible: true }).first()
    : page.getByPlaceholder("품명 · 코드 · 위치 · 공급처").filter({ visible: true }).first();

  await expect(search).toBeVisible();
  await expect(notice).toBeVisible();
  await expect(allCard).toContainText("PA·PF 제외 품목");

  await search.fill("E2E출하PF");
  await expect(page.getByText("E2E출하PF", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(notice).toBeVisible();
  await expect(allCard).toContainText(/PA·PF 제외 전체 \d+건 · 클릭하면 초기화/);
  const narrowedHint = (await allCard.innerText()).replace(/\s+/g, " ").trim();

  await search.fill("CP6-존재하지-않는-품목");
  await expect(page.getByText("검색 결과가 없습니다.", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(notice).toBeVisible();

  await search.fill("");
  const lowCard = page.getByRole("button", { name: /^부족/ }).filter({ visible: true }).first();
  await lowCard.click();
  await expect(lowCard).toHaveAttribute("aria-pressed", "true");
  await expect(notice).toBeVisible();
  await allCard.click();
  await expect(allCard).toHaveAttribute("aria-pressed", "true");
  await expect(allCard).toContainText("PA·PF 제외 품목");

  return {
    viewport,
    initialHint: "PA·PF 제외 품목",
    narrowedHint,
    notice: POPULATION_NOTICE,
  };
}

function reportRecord(
  employee: { employee_id: string; name: string; department: string },
  workDate: string,
  reportId: string,
): Record<string, string> {
  return {
    report_id: reportId,
    work_date: workDate,
    employee_id: employee.employee_id,
    employee_name: employee.name,
    department: employee.department,
    content: `${employee.name} CP6 브라우저 검증 일보`,
    created_at: `${workDate}T00:00:00Z`,
    updated_at: `${workDate}T00:01:00Z`,
  };
}

async function mockDailyWorkReportReads(page: Page): Promise<void> {
  const seed = readSeed();
  const employees = [seed.warehouseEmployee, seed.departmentEmployee, seed.plainEmployee] as Array<{
    employee_id: string;
    name: string;
    department: string;
  }>;

  await page.route("**/api/daily-work-reports**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      await route.continue();
      return;
    }

    const url = new URL(request.url());
    const segments = url.pathname.split("/").filter(Boolean);
    const workDate = url.searchParams.get("work_date") ?? segments.at(-1) ?? "2026-09-07";
    const respond = (body: unknown) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });

    if (url.pathname === "/api/daily-work-reports") {
      await respond([
        reportRecord(employees[0], workDate, "11111111-1111-4111-8111-111111111111"),
        reportRecord(employees[1], workDate, "22222222-2222-4222-8222-222222222222"),
      ]);
      return;
    }

    const employeeId = decodeURIComponent(segments[2] ?? "");
    const employee = employees.find((candidate) => candidate.employee_id === employeeId) ?? employees[2];
    if (segments.at(-1) === "activity") {
      const activityDate = segments.at(-2) ?? workDate;
      await respond({
        work_date: activityDate,
        employee_id: employeeId,
        summary: [{
          operation_key: "warehouse",
          operation_label: "창고 작업",
          work_count: 1,
          quantity_by_unit: { EA: 1 },
        }],
        cancelled_count: 0,
        details: [],
      });
      return;
    }

    const reportDate = segments.at(-1) ?? workDate;
    await respond(reportRecord(employee, reportDate, "33333333-3333-4333-8333-333333333333"));
  });
}

async function installAnimationProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = { action: "idle", events: [] as AnimationProbeEvent[] };
    (window as typeof window & { __cp6AnimationProbe?: typeof probe }).__cp6AnimationProbe = probe;
    const record = (type: "start" | "end") => (event: AnimationEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.testid !== "daily-work-report-result") return;
      if (target.offsetParent === null || event.animationName !== "viewSlide") return;
      probe.events.push({ action: probe.action, type, animationName: event.animationName });
    };
    document.addEventListener("animationstart", record("start"), true);
    document.addEventListener("animationend", record("end"), true);
  });
}

async function setAnimationAction(page: Page, action: string): Promise<void> {
  await page.evaluate((nextAction) => {
    const probe = (window as typeof window & {
      __cp6AnimationProbe?: { action: string; events: AnimationProbeEvent[] };
    }).__cp6AnimationProbe;
    if (!probe) throw new Error("CP6 animation probe is not installed");
    probe.action = nextAction;
  }, action);
}

async function settleAnimationBoundary(page: Page): Promise<void> {
  await expect(page.getByTestId("daily-work-report-result").filter({ visible: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolveFrame) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
  }));
}

async function waitForAnimationEnd(page: Page, action: string): Promise<void> {
  await page.waitForFunction((expectedAction) => {
    const probe = (window as typeof window & {
      __cp6AnimationProbe?: { events: AnimationProbeEvent[] };
    }).__cp6AnimationProbe;
    return probe?.events.some((event) => event.action === expectedAction && event.type === "end") ?? false;
  }, action);
}

async function animationSnapshot(page: Page, action: string): Promise<AnimationSnapshot> {
  return page.evaluate((expectedAction) => {
    const probe = (window as typeof window & {
      __cp6AnimationProbe?: { events: AnimationProbeEvent[] };
    }).__cp6AnimationProbe;
    if (!probe) throw new Error("CP6 animation probe is not installed");
    const result = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="daily-work-report-result"]'))
      .find((element) => element.offsetParent !== null);
    if (!result) throw new Error("visible daily-work-report-result not found");
    const ownAnimations = result.getAnimations().filter((animation) => {
      const effect = animation.effect as KeyframeEffect | null;
      return effect?.target === result;
    });
    return {
      starts: probe.events.filter((event) => event.action === expectedAction && event.type === "start").length,
      ends: probe.events.filter((event) => event.action === expectedAction && event.type === "end").length,
      computedAnimationName: getComputedStyle(result).animationName,
      ownAnimationCount: ownAnimations.length,
    };
  }, action);
}

async function authorButton(page: Page, employeeName: string) {
  return page
    .getByTestId("daily-work-report-author-chips")
    .filter({ visible: true })
    .getByRole("button", { name: new RegExp(employeeName) });
}

function expectNoAnimation(snapshot: AnimationSnapshot): void {
  expect(snapshot.starts).toBe(0);
  expect(snapshot.ends).toBe(0);
  expect(snapshot.computedAnimationName).toBe("none");
  expect(snapshot.ownAnimationCount).toBe(0);
}

function gitBlobHash(path: string): string {
  const result = spawnSync("git", ["hash-object", path], {
    cwd: resolve(process.cwd(), ".."),
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout.trim();
}

function expectLayoutClose(actual: FrozenMetrics, baseline: FrozenMetrics): void {
  const boxNames = ["mobileNav", "desktopWorkShell", "finalRequirements", "finalBomChanges", "finalBomChangeList"] as const;
  const fields = ["x", "y", "width", "height"] as const;
  expect(actual.mobileViewport).toEqual(baseline.mobileViewport);
  expect(actual.desktopViewport).toEqual(baseline.desktopViewport);
  for (const boxName of boxNames) {
    for (const field of fields) {
      expect(
        Math.abs(actual[boxName][field] - baseline[boxName][field]),
        `${boxName}.${field}`,
      ).toBeLessThanOrEqual(1);
    }
  }
}

test.describe.serial("CP6 최종 브라우저 증거", () => {
  test("A4 재고 모집단 안내가 로딩·목록·빈 결과·KPI 필터에서 유지된다", async ({ page }) => {
    await loginAsOperator(page);
    const desktop = await exerciseInventoryNotice(page, "desktop");
    const mobile = await exerciseInventoryNotice(page, "mobile");
    writeEvidence("a4-inventory-population-browser.json", { desktop, mobile });
  });

  test("A5 작성자 전환만 한 번 애니메이션하고 감소 모션에서는 애니메이션하지 않는다", async ({ page }) => {
    const seed = readSeed();
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockDailyWorkReportReads(page);
    await loginAsOperator(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/mes?tab=dailyReport");
    await expect(page.getByRole("tab", { name: "전체 일보" }).filter({ visible: true }).first()).toBeVisible();
    await installAnimationProbe(page);
    await page.getByRole("tab", { name: "전체 일보" }).filter({ visible: true }).first().click();

    await setAnimationAction(page, "first-author");
    await (await authorButton(page, seed.warehouseEmployee.name)).click();
    await settleAnimationBoundary(page);
    const firstAuthor = await animationSnapshot(page, "first-author");
    expectNoAnimation(firstAuthor);

    await setAnimationAction(page, "different-author");
    await (await authorButton(page, seed.departmentEmployee.name)).click();
    await waitForAnimationEnd(page, "different-author");
    const differentAuthor = await animationSnapshot(page, "different-author");
    expect(differentAuthor.starts).toBe(1);
    expect(differentAuthor.ends).toBe(1);

    await setAnimationAction(page, "same-author");
    await (await authorButton(page, seed.departmentEmployee.name)).click();
    await settleAnimationBoundary(page);
    const sameAuthor = await animationSnapshot(page, "same-author");
    expectNoAnimation(sameAuthor);

    await setAnimationAction(page, "detail-open");
    await page.getByRole("button", { name: "창고 작업 거래 상세 펼치기" }).filter({ visible: true }).click();
    await settleAnimationBoundary(page);
    const detailOpen = await animationSnapshot(page, "detail-open");
    expectNoAnimation(detailOpen);

    await setAnimationAction(page, "detail-close");
    await page.getByRole("button", { name: "창고 작업 거래 상세 접기" }).filter({ visible: true }).click();
    await settleAnimationBoundary(page);
    const detailClose = await animationSnapshot(page, "detail-close");
    expectNoAnimation(detailClose);

    await setAnimationAction(page, "tab-change");
    await page.getByRole("tab", { name: "내 일보" }).filter({ visible: true }).first().click();
    await settleAnimationBoundary(page);
    const tabChange = await animationSnapshot(page, "tab-change");
    expectNoAnimation(tabChange);

    await setAnimationAction(page, "date-change");
    await page.getByRole("button", { name: "전일" }).filter({ visible: true }).first().click();
    await settleAnimationBoundary(page);
    const dateChange = await animationSnapshot(page, "date-change");
    expectNoAnimation(dateChange);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/mes?tab=dailyReport");
    await expect(page.getByRole("tab", { name: "전체 일보" }).filter({ visible: true }).first()).toBeVisible();
    await installAnimationProbe(page);
    await page.getByRole("tab", { name: "전체 일보" }).filter({ visible: true }).first().click();

    await setAnimationAction(page, "reduced-first-author");
    await (await authorButton(page, seed.warehouseEmployee.name)).click();
    await settleAnimationBoundary(page);
    const reducedFirstAuthor = await animationSnapshot(page, "reduced-first-author");
    expectNoAnimation(reducedFirstAuthor);

    await setAnimationAction(page, "reduced-different-author");
    await (await authorButton(page, seed.departmentEmployee.name)).click();
    await settleAnimationBoundary(page);
    const reducedDifferentAuthor = await animationSnapshot(page, "reduced-different-author");
    expectNoAnimation(reducedDifferentAuthor);

    writeEvidence("a5-daily-report-animation-browser.json", {
      normalMotion: { firstAuthor, differentAuthor, sameAuthor, detailOpen, detailClose, tabChange, dateChange },
      reducedMotion: { firstAuthor: reducedFirstAuthor, differentAuthor: reducedDifferentAuthor },
    });
  });

  test("동결 모바일 탭바와 데스크톱 출하 5단계 레이아웃을 같은 뷰포트로 재캡처한다", async ({ page }) => {
    const evidenceDirValue = process.env.CP6_FINAL_EVIDENCE_DIR;
    const baselineDirValue = process.env.CP6_FROZEN_BASELINE_DIR;
    test.skip(!evidenceDirValue || !baselineDirValue, "CP6 최종 통합 증거 실행에서만 동결 캡처를 생성합니다.");
    const evidenceDir = resolve(evidenceDirValue as string);
    const baselineDir = resolve(baselineDirValue as string);
    mkdirSync(evidenceDir, { recursive: true });

    const frontendRoot = process.cwd();
    const mobileShellPath = resolve(frontendRoot, "app", "mes", "_components", "mobile", "MobileShell.tsx");
    const globalsPath = resolve(frontendRoot, "app", "globals.css");
    const weeklyPath = resolve(frontendRoot, "app", "mes", "_components", "DesktopWeeklyReportView.tsx");
    const shippingPath = resolve(frontendRoot, "app", "mes", "_components", "DesktopShippingView.tsx");
    expect(gitBlobHash(mobileShellPath)).toBe("138a10bbd7d2753d6b1b482ec051ef909cc5ea9f");
    expect(gitBlobHash(globalsPath)).toBe("1020b0888951c6ec2d4022618fc2997a72b93728");
    expect(gitBlobHash(weeklyPath)).toBe("080af724c8d2debb4e93af74fba7e3ef0a9a1a7d");
    const shippingSource = readFileSync(shippingPath, "utf8");
    expect(shippingSource).toContain('grid-rows-[auto_minmax(0,1fr)_auto]');
    expect(shippingSource).toContain('h-[58px] grid-cols-2 overflow-x-hidden overflow-y-auto');
    expect(shippingSource).toContain('shipping-final-requirements-list" className="grid min-h-0 flex-1 gap-2 overflow-y-auto');

    await loginAsOperator(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mes?tab=dashboard");
    const mobileNav = page.getByRole("navigation").filter({ visible: true });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByRole("button")).toHaveCount(5);
    await expect(mobileNav.getByRole("button", { name: "더보기" })).toBeVisible();
    await mobileNav.screenshot({ path: resolve(evidenceDir, "mobile-bottom-nav-final.png") });
    const mobileNavBox = await mobileNav.boundingBox();
    expect(mobileNavBox).not.toBeNull();

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/mes?tab=shipping");
    await page.getByRole("button", { name: /출하 관리/ }).filter({ visible: true }).click();
    await page.locator('[data-primary-action="new-shipping-request"]').click();
    await expect(page.getByTestId("shipping-wizard-step-1")).toBeVisible();

    const { shippingItem } = readSeed() as ReturnType<typeof readSeed> & {
      shippingItem: { item_id: string };
    };
    await page.getByTestId("shipping-pf-search").fill("E2E출하PF");
    await page.getByTestId(`shipping-pf-option-${shippingItem.item_id}`).click();
    await page.getByTestId("shipping-wizard-next").click({ noWaitAfter: true });
    await expect(page.getByTestId("shipping-wizard-step-2")).toBeVisible();

    const changedMatch = page.waitForResponse((response) => (
      response.url().includes("/api/shipping/bom-match")
      && response.request().method() === "POST"
    ));
    await page.getByRole("button", { name: /E2E원자재튜브 제외/ }).click();
    expect((await changedMatch).ok()).toBe(true);
    await page.getByTestId("shipping-wizard-next").click({ noWaitAfter: true });
    await expect(page.getByTestId("shipping-wizard-step-3")).toBeVisible();

    const paName = page.getByTestId("shipping-new-pa-name");
    if (await paName.isVisible()) await paName.fill("E2E출하PA 기준변경");
    const pfName = page.getByTestId("shipping-new-pf-name");
    if (await pfName.isVisible()) await pfName.fill("E2E출하PF 기준변경");

    await page.getByTestId("shipping-wizard-next").click({ noWaitAfter: true });
    await expect(page.getByTestId("shipping-wizard-step-4")).toBeVisible();
    await page.getByLabel("요청 메모").fill("CP6 동결 기준 캡처");
    await page.getByTestId("shipping-wizard-next").click({ noWaitAfter: true });
    await expect(page.getByTestId("shipping-wizard-step-5")).toBeVisible();
    await expect(page.getByTestId("shipping-final-requirements")).toBeVisible();
    await expect(page.getByTestId("shipping-final-bom-changes")).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()));
    }));

    const workShell = page.getByTestId("shipping-request-work-shell");
    await workShell.screenshot({ path: resolve(evidenceDir, "desktop-shipping-step5-final.png") });
    const metrics = {
      mobileViewport: { width: 390, height: 844 },
      mobileNav: mobileNavBox,
      desktopViewport: { width: 1440, height: 900 },
      desktopWorkShell: await workShell.boundingBox(),
      finalRequirements: await page.getByTestId("shipping-final-requirements").boundingBox(),
      finalBomChanges: await page.getByTestId("shipping-final-bom-changes").boundingBox(),
      finalBomChangeList: await page.getByTestId("shipping-final-bom-change-list").boundingBox(),
    };
    for (const [name, value] of Object.entries(metrics)) {
      expect(value, `${name} metric`).not.toBeNull();
    }
    const finalMetrics = metrics as FrozenMetrics;
    const baseline = JSON.parse(
      readFileSync(resolve(baselineDir, "layout-metrics-baseline.json"), "utf8"),
    ) as FrozenMetrics;
    expectLayoutClose(finalMetrics, baseline);

    const styleContract = await page.evaluate(() => {
      const required = (testId: string): HTMLElement => {
        const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
        if (!element) throw new Error(`${testId} not found`);
        return element;
      };
      const finalSummary = required("shipping-final-summary");
      const requirementList = required("shipping-final-requirements-list");
      const bomChanges = required("shipping-final-bom-changes");
      const bomChangeList = required("shipping-final-bom-change-list");
      const bomChangeRow = required("shipping-final-bom-change-row");
      return {
        finalSummaryOverflowX: getComputedStyle(finalSummary).overflowX,
        finalSummaryOverflowY: getComputedStyle(finalSummary).overflowY,
        requirementListOverflowY: getComputedStyle(requirementList).overflowY,
        bomChangesFlexDirection: getComputedStyle(bomChanges).flexDirection,
        bomChangeListHeight: bomChangeList.getBoundingClientRect().height,
        bomChangeListColumns: getComputedStyle(bomChangeList).gridTemplateColumns.split(/\s+/).length,
        bomChangeListOverflowX: getComputedStyle(bomChangeList).overflowX,
        bomChangeListOverflowY: getComputedStyle(bomChangeList).overflowY,
        bomChangeRowHeight: bomChangeRow.getBoundingClientRect().height,
      };
    });
    expect(styleContract).toMatchObject({
      finalSummaryOverflowX: "hidden",
      finalSummaryOverflowY: "hidden",
      requirementListOverflowY: "auto",
      bomChangesFlexDirection: "column",
      bomChangeListHeight: 58,
      bomChangeListColumns: 2,
      bomChangeListOverflowX: "hidden",
      bomChangeListOverflowY: "auto",
      bomChangeRowHeight: 58,
    });

    writeFileSync(
      resolve(evidenceDir, "layout-metrics-final.json"),
      JSON.stringify({ metrics: finalMetrics, baseline, styleContract }, null, 2),
      "utf8",
    );
  });
});
