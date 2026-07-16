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
import { advanceToQuantityStep, clickNextStep, gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

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
    await page.goto("/mes");
    await page.getByRole("navigation").getByRole("button", { name: /입출고/ }).first().click();

    await expect(page.getByRole("button", { name: /원자재 입고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /창고 입출고/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /부서 입출고/ })).toBeVisible();
  });

  test("폐기된 라벨이 화면에 노출되지 않는다", async ({ page }) => {
    await page.goto("/mes");
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
    await page.goto("/mes");
    await page.getByRole("navigation").getByRole("button", { name: /내역/ }).first().click();

    const banned = ["새 격리", "격리 해제", "폐기", "격리 폐기"];
    for (const word of banned) {
      await expectLabelAbsent(page, word);
    }
  });
});

test.describe("입출고 내역 PC 정보 위계", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsOperator(page, { role: "warehouse" });
  });

  test("목록 테이블에 현장 판단 컬럼을 노출한다", async ({ browser }) => {
    const submitContext = await browser.newContext();
    const submitPage = await submitContext.newPage();
    await loginAsOperator(submitPage, { code: "E01" });
    await gotoWarehouseCompose(submitPage);
    await pickWorkType(submitPage, /창고 입출고/);
    await submitPage.getByRole("button", { name: /창고 → 부서/ }).first().click();
    await submitPage.getByRole("button", { name: "조립", exact: true }).click();
    await clickNextStep(submitPage);
    await submitPage
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "낱개", exact: true })
      .click();
    await advanceToQuantityStep(submitPage);
    await submitPage.getByRole("button", { name: /제출확인/ }).click();
    await submitPage.getByRole("button", { name: /창고 결재 요청/ }).click();
    await submitPage.getByRole("button", { name: "결재 요청", exact: true }).click();
    await expect(submitPage.getByRole("dialog", { name: /창고 결재 요청 완료/ })).toBeVisible();
    await submitContext.close();

    const approveContext = await browser.newContext();
    const approvePage = await approveContext.newPage();
    await loginAsOperator(approvePage, { code: "E22" });
    await approvePage.goto("/mes?tab=warehouse");
    await approvePage.getByRole("tab", { name: /창고 승인함/ }).click();
    await approvePage.getByRole("button", { name: "승인", exact: true }).click();
    await approvePage.getByRole("textbox", { name: "0000" }).fill("0000");
    await approvePage.getByRole("button", { name: "승인 확정" }).click();
    await expect(approvePage.getByText("승인 대기 중인 요청이 없습니다.")).toBeVisible();

    await approvePage.goto("/mes?tab=history");

    const table = approvePage.locator("table").filter({
      has: approvePage.getByRole("columnheader", { name: "수량" }),
    });
    await expect(table).toBeVisible();

    for (const name of ["일시", "작업", "대상", "품목코드", "수량", "상태 · 처리"]) {
      await expect(table.getByRole("columnheader", { name })).toBeVisible();
    }
    await approveContext.close();
  });
});
