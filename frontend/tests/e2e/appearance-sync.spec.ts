import { expect, test, type Page } from "@playwright/test";
import { loginAsOperator } from "./_helpers";

async function openSettings(page: Page, employeeCode?: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const employee = await loginAsOperator(page, employeeCode ? { code: employeeCode } : { role: "warehouse" });
  const response = await page.request.put(`/api/employees/${employee.employee_id}/appearance`, { data: { theme: "light", sidebar_mode: "hover" } });
  expect(response.ok()).toBeTruthy();
  await page.goto("/mes?tab=settings");
  await expect(page.getByRole("button", { name: "라이트 테마", exact: true })).toHaveAttribute("aria-pressed", "true");
  return employee;
}

async function saveDarkExpanded(page: Page) {
  await page.getByRole("button", { name: "다크 테마", exact: true }).click();
  await page.getByRole("button", { name: "펼침 고정", exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
}

test("같은 직원의 설정 저장은 다른 탭에 반영하고 작성 중인 선택과 PIN은 보존한다", async ({ page, context }) => {
  const employee = await openSettings(page);
  const second = await context.newPage();
  await openSettings(second, employee.employee_code);
  await second.getByRole("button", { name: "접힘 고정", exact: true }).click();
  await second.getByRole("button", { name: "PIN 재설정", exact: true }).click();
  await second.getByLabel("현재 PIN", { exact: true }).fill("1234");
  await saveDarkExpanded(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(second.getByRole("button", { name: "다크 테마", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("button", { name: "접힘 고정", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByLabel("현재 PIN", { exact: true })).toHaveValue("1234");
  expect(await second.evaluate(() => JSON.parse(sessionStorage.getItem("dexcowin_mes_operator")!).sidebar_mode)).toBe("expanded");
});

test("같은 브라우저의 서로 다른 직원 탭은 계정과 화면 설정을 독립적으로 유지한다", async ({ page, context }) => {
  const employee = await openSettings(page);
  const employees = await (await page.request.get("/api/employees?active_only=true")).json() as { employee_id: string; employee_code: string }[];
  const other = employees.find((candidate) => candidate.employee_id !== employee.employee_id);
  expect(other).toBeTruthy();
  const second = await context.newPage();
  await openSettings(second, other!.employee_code);
  await saveDarkExpanded(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await second.evaluate(() => JSON.parse(sessionStorage.getItem("dexcowin_mes_operator")!).employee_id)).toBe(other!.employee_id);
  await expect(second.getByRole("button", { name: "자동 펼침", exact: true })).toHaveAttribute("aria-pressed", "true");
  const otherPair = await (await second.request.get(`/api/employees/${other!.employee_id}/appearance`)).json();
  expect(otherPair).toMatchObject({ theme: "light", sidebar_mode: "hover" });
});

test("데스크톱에서 저장한 같은 직원 테마를 모바일 탭도 반영한다", async ({ page, context }) => {
  const employee = await openSettings(page);
  const mobile = await context.newPage();
  await loginAsOperator(mobile, { code: employee.employee_code });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto("/mes?tab=dashboard");
  await expect(mobile.locator("html")).toHaveAttribute("data-theme", "light");
  await saveDarkExpanded(page);
  await expect(mobile.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await mobile.evaluate(() => JSON.parse(sessionStorage.getItem("dexcowin_mes_operator")!).sidebar_mode)).toBe("expanded");
});

test("저장 실패는 다른 탭을 바꾸지 않고 저장 성공 뒤 조회 실패는 저장 실패로 표시하지 않는다", async ({ page, context }) => {
  const employee = await openSettings(page);
  const second = await context.newPage();
  await openSettings(second, employee.employee_code);
  let failSave = true;
  let failRead = false;
  await page.route(`**/api/employees/${employee.employee_id}/appearance`, async (route) => {
    if ((failSave && route.request().method() === "PUT") || (failRead && route.request().method() === "GET")) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "검증용 연결 실패" }) });
    } else await route.continue();
  });
  await saveDarkExpanded(page);
  const saveError = page.getByRole("alert").filter({ hasText: "설정을 저장하지 못했습니다. 다시 시도해 주세요." });
  await expect(saveError).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  failSave = false;
  failRead = true;
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(saveError).toHaveCount(0);
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  failRead = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: "펼침 고정", exact: true })).toHaveAttribute("aria-pressed", "true");
});
