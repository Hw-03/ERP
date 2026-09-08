import { expect, test, type Locator, type Page } from "@playwright/test";
import { checkA11y, injectAxe } from "axe-playwright";
import { gotoWarehouseCompose, loginAsOperator } from "./_helpers";

async function checkCoreA11y(page: Page, selector: string): Promise<void> {
  await injectAxe(page);
  await checkA11y(
    page,
    selector,
    {
      axeOptions: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      },
      includedImpacts: ["minor", "moderate", "serious", "critical"],
      detailedReport: true,
      detailedReportOptions: { html: true },
    },
    false,
    "v2",
  );
}

async function checkCoreA11yInThemes(page: Page, selector: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await page.locator("html").evaluate((element, nextTheme) => {
      element.setAttribute("data-theme", nextTheme);
    }, theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.locator(selector).evaluate(async (element) => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const animations = element.getAnimations({ subtree: true }).filter((animation) => {
        const endTime = animation.effect?.getComputedTiming().endTime;
        return typeof endTime === "number" && Number.isFinite(endTime);
      });
      let timeoutId = 0;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("테마 전환이 1초 안에 완료되지 않았습니다.")), 1_000);
      });
      try {
        await Promise.race([
          Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))),
          timeout,
        ]);
      } finally {
        window.clearTimeout(timeoutId);
      }
    });
    await checkCoreA11y(page, selector);
  }
}

async function tabTo(page: Page, target: Locator, maxSteps = 80): Promise<void> {
  await expect(target).toBeVisible();
  for (let step = 0; step < maxSteps; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab ${maxSteps}회 안에 대상에 도달하지 못했습니다: ${await target.evaluate((element) => element.outerHTML)}`);
}

async function activateWithKeyboard(page: Page, target: Locator, key: "Enter" | "Space" = "Enter") {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

test.describe("핵심 업무 접근성", () => {
  test("입출고 작업 유형을 키보드로 열고 axe 계약을 통과한다", async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
    await gotoWarehouseCompose(page);

    const root = page.getByTestId("io-compose-view").filter({ visible: true });
    await expect(root).toBeVisible();
    await checkCoreA11yInThemes(page, '[data-testid="io-compose-view"]');

    const workType = page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first();
    await activateWithKeyboard(page, workType);
    await expect(page.getByText("세부 작업과 부서 선택", { exact: true }).filter({ visible: true })).toBeVisible();
  });

  test("출하 요청 작성을 키보드로 열고 axe 계약을 통과한다", async ({ page }) => {
    await loginAsOperator(page, { role: "warehouse" });
    let failInitialShippingLoad = true;
    await page.route(/\/api\/shipping\/requests\/page(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET" && failInitialShippingLoad) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "E2E 출하 로드 실패" }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/mes?tab=shipping");

    const root = page.getByTestId("shipping-root-panel").filter({ visible: true });
    await expect(root).toBeVisible();
    const requestHub = page.locator('[data-shipping-hub-card="request"]').filter({ visible: true });
    await expect(requestHub).toBeVisible();
    const loadAlert = page.getByRole("alert", { name: "출하 데이터 로드 오류" });
    await expect(loadAlert).toBeFocused();

    failInitialShippingLoad = false;
    const retry = loadAlert.getByRole("button", { name: "다시 시도" });
    await activateWithKeyboard(page, retry);
    await expect(loadAlert).toHaveCount(0);

    await activateWithKeyboard(page, requestHub);
    await expect(page.getByTestId("shipping-request-list-panel")).toBeVisible();

    const create = page.locator('[data-primary-action="new-shipping-request"]');
    await activateWithKeyboard(page, create);
    await expect(page.getByTestId("shipping-wizard-step-1")).toBeVisible();
    await checkCoreA11yInThemes(page, '[data-testid="shipping-root-panel"]');
  });

  test("불량 격리 목록을 키보드로 열고 axe 계약을 통과한다", async ({ page }) => {
    await loginAsOperator(page, { role: "department" });
    let failInitialDefectLoad = true;
    await page.route(/\/api\/defects\/locations(?:\?.*)?$/, async (route) => {
      if (route.request().method() === "GET" && failInitialDefectLoad) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ detail: "E2E 불량 로드 실패" }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/mes?tab=defect");

    const root = page.getByTestId("defect-desktop-view").filter({ visible: true });
    await expect(root).toBeVisible();
    const listCard = page.getByRole("button", { name: /격리 목록/ }).filter({ visible: true }).first();
    await activateWithKeyboard(page, listCard);
    await expect(page.getByRole("heading", { name: "격리 목록", exact: true })).toBeVisible();

    const loadAlert = page.getByRole("alert", { name: "불량 데이터 로드 오류" });
    await expect(loadAlert).toBeFocused();
    failInitialDefectLoad = false;
    await activateWithKeyboard(page, loadAlert.getByRole("button", { name: "다시 시도" }));
    await expect(loadAlert).toHaveCount(0);

    const search = page.getByRole("searchbox", { name: "불량 검색" }).filter({ visible: true });
    await tabTo(page, search);
    await page.keyboard.type("E2E");
    await expect(search).toHaveValue("E2E");
    await checkCoreA11yInThemes(page, '[data-testid="defect-desktop-view"]');
  });

  test("부서 행과 확인창을 키보드로 조작하고 오류 연결·axe 계약을 통과한다", async ({ page }) => {
    await loginAsOperator(page, { code: "E01" });
    await page.goto("/mes?tab=admin");

    const zeroKey = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) await zeroKey.click();

    const departmentTab = page.getByRole("navigation", { name: "관리자 섹션" })
      .getByRole("button", { name: "부서 관리", exact: true });
    await activateWithKeyboard(page, departmentTab);

    const root = page.getByTestId("admin-departments-section");
    await expect(root).toBeVisible();
    const rows = root.locator("[data-admin-department-row]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(1);
    await activateWithKeyboard(page, rows.nth(1), "Enter");
    await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
    await activateWithKeyboard(page, rows.first(), "Space");
    await expect(rows.first()).toHaveAttribute("aria-selected", "true");

    const colorInput = root.getByRole("textbox", { name: "색상 코드" });
    await tabTo(page, colorInput);
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("#123");
    await expect(colorInput).toHaveAttribute("aria-invalid", "true");
    const describedBy = await colorInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toContainText("올바른 hex 코드");

    const deactivate = root.getByRole("button", { name: "부서 비활성화" });
    await activateWithKeyboard(page, deactivate);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const cancel = dialog.getByRole("button", { name: "취소" });
    const confirm = dialog.getByRole("button", { name: "비활성화", exact: true });
    await tabTo(page, confirm);
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(deactivate).toBeFocused();

    await checkCoreA11yInThemes(page, '[data-testid="admin-departments-section"]');
  });
});
