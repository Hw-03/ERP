import { expect, test } from "@playwright/test";
import { loginAsOperator } from "./_helpers";

test.describe("관리자 상단 탭", () => {
  test("PIN 잠금 해제 후 모든 섹션을 순회한다", async ({ page }) => {
    await loginAsOperator(page, { code: "E01" });
    await page.goto("/mes?tab=admin");

    const zeroKey = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
    for (let index = 0; index < 4; index += 1) {
      await zeroKey.click();
    }

    const navigation = page.getByRole("navigation", { name: "관리자 섹션" });
    await expect(navigation).toBeVisible();

    for (const label of [
      "모델 관리",
      "품목 관리",
      "직원 관리",
      "부서 관리",
      "BOM 관리",
      "내보내기",
      "외부 제출용 로그",
      "보안",
    ]) {
      const tab = navigation.getByRole("button", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-current", "page");
    }

  });
});
