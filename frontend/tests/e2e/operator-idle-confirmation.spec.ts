import { expect, test, type Page } from "@playwright/test";

const confirmationTitle = "현재 작업자를 확인해 주세요";

async function login(page: Page): Promise<string> {
  const employees = await (await page.request.get("/api/employees?active_only=true")).json();
  const employee = employees.find((candidate: { employee_code: string }) => candidate.employee_code === "E01") ?? employees[0];
  await page.goto("/mes?tab=dashboard");
  await page.getByRole("combobox", { name: "직원 선택" }).fill(employee.employee_code);
  await page.getByRole("option").filter({ hasText: employee.name }).first().click();
  await page.getByPlaceholder("숫자 4자리").fill("0000");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "직원 선택" })).not.toBeVisible();
  await expect(page.getByRole("textbox").first()).toBeVisible();
  return employee.name;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`${viewport.width}px: 5분 확인·입력 유지·새로고침·계정 전환`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    const name = await login(page);
    const filter = viewport.width >= 1024
      ? page.getByRole("textbox", { name: "자재 검색" })
      : page.getByPlaceholder("품명 · 코드 · 위치 · 공급처");
    await filter.fill("작성 내용 유지 확인");
    const confirmation = page.getByRole("dialog", { name: confirmationTitle });
    await page.clock.fastForward(299_000);
    await expect(confirmation).not.toBeVisible();
    await page.clock.fastForward(1_000);
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole("heading")).toBeFocused();
    const mascot = confirmation.locator("[data-mascot-slot] img");
    await expect(mascot).toHaveAttribute("src", "/images/login/dexray-operator-confirm.webp");
    await expect(mascot).toBeVisible();
    await expect.poll(() => mascot.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    const slotSize = viewport.width >= 1024 ? 128 : 96;
    await expect(confirmation.locator("[data-mascot-slot]")).toHaveCSS("width", `${slotSize}px`);
    const box = await confirmation.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(16);
    expect(box!.width).toBeLessThanOrEqual(480);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(confirmation).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(confirmation.getByRole("button", { name: `${name}(으)로 계속` })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmation).not.toBeVisible();
    await expect(filter).toHaveValue("작성 내용 유지 확인");
    await page.clock.fastForward(300_000);
    await expect(confirmation).toBeVisible();
    await page.reload();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "다른 계정으로 로그인" }).click();
    await expect(page.getByRole("combobox", { name: "직원 선택" })).toBeVisible();
    expect(await page.evaluate(() => ["dexcowin_mes_operator", "dexcowin_mes_boot_id", "dexcowin_mes_operator_activity"].map((key) => sessionStorage.getItem(key)))).toEqual([null, null, null]);
  });
}

test("알림창 위에서 키보드와 포커스를 독점하고 확인 후 알림창으로 복귀한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  const name = await login(page);
  const notifications = page.getByRole("dialog", { name: "알림", exact: true });
  // 로그인 알림이 자동으로 열리면 그대로 사용한다. 조회 응답과 수동 열기의 경합도 허용한다.
  await expect(async () => {
    if (!await notifications.isVisible()) {
      await page.getByRole("button", { name: /^알림(?: \d+건)?$/ }).click({ timeout: 1_000 });
    }
    await expect(notifications).toBeVisible();
  }).toPass({ timeout: 10_000 });
  await page.clock.fastForward(300_000);
  const confirmation = page.getByRole("dialog", { name: confirmationTitle });
  await expect(confirmation.getByRole("heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(confirmation.getByRole("button", { name: `${name}(으)로 계속` })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmation.getByRole("button", { name: "다른 계정으로 로그인" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmation.getByRole("button", { name: `${name}(으)로 계속` })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(confirmation).not.toBeVisible();
  await expect(notifications).toBeVisible();
  await expect(notifications.getByRole("button", { name: "알림 닫기" })).toBeFocused();
});

test("지연된 타이머의 첫 Enter를 소비하고 낮은 다크 화면에서도 버튼에 접근한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 });
  await page.clock.install();
  const name = await login(page);
  const filter = page.getByPlaceholder("품명 · 코드 · 위치 · 공급처");
  await filter.focus();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now()) + 300_000));
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("dialog", { name: confirmationTitle });
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("heading")).toBeFocused();
  await expect(confirmation.getByRole("button", { name: "다른 계정으로 로그인" })).toBeVisible();
  await confirmation.getByRole("button", { name: `${name}(으)로 계속` }).click();
  await expect(confirmation).not.toBeVisible();
});
