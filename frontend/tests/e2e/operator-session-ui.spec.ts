/**
 * CP3: 인증은 helper API 로그인이 아니라 실제 로그인 UI까지 검증한다.
 * globalSetup 이 남겨 둔 기본 PIN 직원만 이 명세가 사용한다.
 */
import { expect, test } from "@playwright/test";
import { readSeed } from "./_helpers";

const NEW_PIN = "9753";

async function selectEmployeeAndLogin(page: import("@playwright/test").Page, employee: { employee_code: string; name: string }, pin: string): Promise<void> {
  const employeeInput = page.getByRole("combobox", { name: "직원 선택" });
  await employeeInput.fill(employee.employee_code);
  await page.getByRole("option", { name: new RegExp(employee.name) }).click();
  await page.getByLabel("PIN 번호").fill(pin);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}

test.describe("작업자 세션 UI", () => {
  test("기본 PIN 변경부터 세션 복원·로그아웃·강제 폐기 로그인 복귀까지 실제 UI로 처리한다", async ({ page }) => {
    const seed = readSeed();
    const employee = seed.defaultPinEmployee;
    const setupLogin = await page.request.post("/api/operator-session", {
      data: { employee_id: seed.plainEmployee.employee_id, pin: seed.operatorPin },
    });
    expect(setupLogin.status()).toBe(200);
    const reset = await page.request.post(`/api/employees/${employee.employee_id}/reset-pin`, {
      headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" },
      data: { pin: process.env.E2E_ADMIN_PIN ?? "0000" },
    });
    expect(reset.status()).toBe(204);
    expect((await page.request.delete("/api/operator-session")).status()).toBe(204);

    await page.goto("/mes");
    await expect(page.getByRole("combobox", { name: "직원 선택" })).toBeVisible();
    await selectEmployeeAndLogin(page, employee, "0000");

    const newPinInput = page.getByRole("textbox", { name: "새 PIN", exact: true });
    await expect(newPinInput).toBeVisible();
    await newPinInput.fill(NEW_PIN);
    await page.getByRole("textbox", { name: "새 PIN 확인", exact: true }).fill(NEW_PIN);
    await page.getByRole("button", { name: "PIN 설정 및 로그인" }).click();
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await page.getByRole("button", { name: new RegExp(employee.name) }).click();
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await page.getByRole("dialog", { name: "로그아웃" }).getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "직원 선택" })).toBeVisible();

    await selectEmployeeAndLogin(page, employee, NEW_PIN);
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "더보기", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`프로필\\s*${employee.name}`) }).click();
    const userMenu = page.getByRole("dialog", { name: "사용자 메뉴" });
    await userMenu.getByRole("button", { name: "로그아웃", exact: true }).click();
    await userMenu.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "직원 선택" })).toBeVisible();

    await selectEmployeeAndLogin(page, employee, NEW_PIN);
    await expect(page.getByRole("navigation").first()).toBeVisible();

    // UI로 발급한 cookie를 전용 E2E 백엔드에서 폐기해 다음 401 복귀를 확인한다.
    await expect((await page.request.delete("/api/operator-session")).status()).toBe(204);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "직원 선택" })).toBeVisible();
  });
});
