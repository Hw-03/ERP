/**
 * P2-1 / 시나리오 6: 라벨 일관성 (P0-1 회귀 방어).
 *
 * V2 작업 화면 / 입출고 내역 / 결재 요청 큐 — 같은 도메인 단어가 같은 라벨로 보이는지.
 * 본 테스트는 시드 없이도 라벨 자체의 존재만 검증하므로 가장 먼저 활성화 가능.
 */
import { expect, test } from "@playwright/test";

test.describe("라벨 일관성 (glossary 단일 사전)", () => {
  test("V2 입출고 화면에 4 work type 라벨이 정확한 단어로 노출된다", async ({ page }) => {
    await page.goto("/legacy");
    await page.getByRole("tab", { name: /입출고/ }).first().click();

    await expect(page.getByRole("button", { name: /원자재 입고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /창고 입출고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /부서 입출고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^불량$/ })).toBeVisible();
  });

  test("폐기된 라벨이 화면에 노출되지 않는다", async ({ page }) => {
    await page.goto("/legacy");
    await page.getByRole("tab", { name: /입출고/ }).first().click();

    // P0-1 캐노니컬 결정으로 폐기된 단어들
    const banned = [
      "재작업",
      "새 격리",
      "격리 해제",
      "격리 폐기",
      "창고 반출",
      "창고 반입",
      "외부 입고",
      "부서 작업",
      "생산 | 입고",
      "분해 | 출고",
    ];
    for (const word of banned) {
      // 정확 일치 (regex /^...$/) — "재작업했다" 같은 자유 텍스트는 통과시킴
      await expect(
        page.locator(`text=/^${word}$/`),
        `폐기된 라벨 "${word}" 가 화면에 노출됨`,
      ).toHaveCount(0);
    }
  });

  test("입출고 내역 탭의 라벨도 단일 사전을 따른다", async ({ page }) => {
    await page.goto("/legacy");
    await page.getByRole("tab", { name: /내역/ }).first().click();

    // 폐기된 라벨이 내역에도 안 보임
    const banned = ["재작업", "새 격리", "격리 해제", "격리 폐기"];
    for (const word of banned) {
      await expect(
        page.locator(`text=/^${word}$/`),
        `내역 화면에 폐기된 라벨 "${word}" 가 노출됨`,
      ).toHaveCount(0);
    }
  });
});
