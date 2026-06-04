/**
 * P2-1 / 시나리오 6: 라벨 일관성 (P0-1 회귀 방어).
 *
 * V2 작업 화면 / 입출고 내역 — 같은 도메인 단어가 같은 라벨로 보이는지.
 * 시드 없이 라벨 자체의 존재만 검증하므로 가장 먼저 활성화 가능(읽기 baseline).
 *
 * 라이브 UI 기준(2026-06-04 확인):
 *  - work type 은 3개(원자재 입고/창고 입출고/부서 입출고). "불량"은 별도 최상위 탭.
 *  - "원자재 입고"(receive)는 창고 정/부 직원에게만 노출 → 창고 역할로 로그인.
 */
import { expect, test } from "@playwright/test";
import { loginAsOperator } from "./_helpers";

// "생산 | 입고" 처럼 정규식 메타문자(|)가 든 단어는 text=/.../ 가 alternation 으로
// 오해석한다(=오매칭). 정확 일치는 getByText(word,{exact:true}) 로 검증한다.
async function expectLabelAbsent(page: import("@playwright/test").Page, word: string) {
  await expect(
    page.getByText(word, { exact: true }),
    `폐기된 라벨 "${word}" 가 화면에 노출됨`,
  ).toHaveCount(0);
}

test.describe("라벨 일관성 (glossary 단일 사전)", () => {
  test.beforeEach(async ({ page }) => {
    // 창고 역할로 로그인해야 "원자재 입고" work type 까지 노출된다.
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("V2 입출고 화면에 3 work type 라벨이 정확한 단어로 노출된다", async ({ page }) => {
    await page.goto("/legacy");
    await page.getByRole("navigation").getByRole("button", { name: /입출고/ }).first().click();

    await expect(page.getByRole("button", { name: /원자재 입고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /창고 입출고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /부서 입출고/ })).toBeVisible();
  });

  test("폐기된 라벨이 화면에 노출되지 않는다", async ({ page }) => {
    await page.goto("/legacy");
    await page.getByRole("navigation").getByRole("button", { name: /입출고/ }).first().click();

    // P0-1 캐노니컬 결정으로 폐기된 단어들
    const banned = [
      "재작업",
      "새 격리",
      "격리 해제",
      "폐기",
      "격리 폐기",
      "창고 반출",
      "창고 반입",
      "외부 입고",
      "부서 작업",
      "생산 | 입고",
      "분해 | 출고",
    ];
    for (const word of banned) {
      await expectLabelAbsent(page, word);
    }
  });

  test("입출고 내역 탭의 라벨도 단일 사전을 따른다", async ({ page }) => {
    await page.goto("/legacy");
    await page.getByRole("navigation").getByRole("button", { name: /내역/ }).first().click();

    const banned = ["재작업", "새 격리", "격리 해제", "폐기", "격리 폐기"];
    for (const word of banned) {
      await expectLabelAbsent(page, word);
    }
  });
});
