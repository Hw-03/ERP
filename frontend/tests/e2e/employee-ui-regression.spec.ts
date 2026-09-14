import { expect, test, type Page } from "@playwright/test";
import { loginAsOperator } from "./_helpers";

test("불량 통계 첫 실패는 오류에 포커스하고 갱신 실패는 기존 화면을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsOperator(page, { role: "warehouse" });
  let fail = true;
  await page.route("**/api/defects/statistics?**", async (route) => {
    if (fail) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "E2E 통계 조회 실패" }) });
    else await route.continue();
  });
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 통계", visible: true }).click();
  const initial = page.getByRole("alert").filter({ hasText: "불량 통계를 불러오지 못했습니다", visible: true });
  await expect(initial).toBeFocused();
  fail = false;
  await initial.getByRole("button", { name: "다시 시도" }).click();
  await expect(initial).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "기간별 불량 추이", exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "불량 통계", exact: true }).filter({ visible: true })).toBeVisible();
  fail = true;
  const month = page.getByRole("button", { name: "월간", exact: true }).filter({ visible: true });
  await month.focus();
  await expect(month).toBeFocused();
  await month.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "최신 불량 통계를 동기화하지 못했습니다", visible: true })).toBeVisible();
  await expect(month).toBeFocused();
});

async function unlockAdmin(page: Page): Promise<void> {
  await loginAsOperator(page, { code: "E01" });
  await page.goto("/mes?tab=admin");
  const zeroKey = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
  for (let index = 0; index < 4; index += 1) await zeroKey.click();
  await expect(page.getByRole("navigation", { name: "관리자 섹션" })).toBeVisible();
}

test("승인 건수 조회 실패를 알리고 본문을 유지한 채 재시도한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsOperator(page, { role: "warehouse" });

  let failCountRequests = true;
  await page.route("**/api/stock-requests/warehouse-queue/count", async (route) => {
    if (failCountRequests) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "E2E 승인 건수 조회 실패" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 3 }),
    });
  });

  await page.goto("/mes?tab=warehouse&section=queue");
  const alert = page.getByRole("alert").filter({ hasText: "창고 승인 건수 조회 실패", visible: true });
  await expect(alert).toBeVisible();
  await expect(page.getByTestId("warehouse-section-work-area")).toBeVisible();
  await expect(page.getByRole("tab", { name: /창고 승인함/ }).filter({ visible: true })).toHaveAttribute("aria-selected", "true");

  failCountRequests = false;
  await page.getByRole("button", { name: "창고 승인 건수 다시 시도" }).filter({ visible: true }).click();

  await expect(alert).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /창고 승인함.*3/ }).filter({ visible: true })).toBeVisible();
});

test("모델 삭제는 확인창 하나만 사용하고 실패 시 선택과 PIN을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let nativeDialogCount = 0;
  page.on("dialog", async (dialog) => {
    nativeDialogCount += 1;
    await dialog.dismiss();
  });

  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  const deleteBodies: Array<{ pin?: string }> = [];
  await page.route(/\/api\/models\/\d+$/, async (route) => {
    if (route.request().method() !== "DELETE") {
      await route.continue();
      return;
    }
    deleteBodies.push(route.request().postDataJSON() as { pin?: string });
    await deleteGate;
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "E2E 모델 삭제 거절" }),
    });
  });

  await unlockAdmin(page);
  await page.getByRole("button", { name: "모델 관리", exact: true }).click();
  const modelGrid = page.getByRole("grid", { name: "모델 목록" });
  const modelRow = modelGrid.getByRole("row").nth(1);
  await expect(modelRow).toBeVisible();
  await modelRow.click();
  await page.getByRole("button", { name: "이 모델 삭제" }).click();

  const confirmDialog = page.getByRole("dialog", { name: /모델을 삭제하시겠습니까/ });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "삭제", exact: true }).click();

  await expect(confirmDialog.getByRole("button", { name: "삭제 중...", exact: true })).toBeDisabled();
  await expect.poll(() => deleteBodies.length).toBe(1);
  expect(nativeDialogCount).toBe(0);
  expect(deleteBodies[0]).toEqual({ pin: "0000" });

  releaseDelete();
  await expect(page.getByRole("alert").filter({ hasText: "E2E 모델 삭제 거절" })).toBeVisible();
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByRole("button", { name: "삭제", exact: true })).toBeEnabled();
  await expect(modelRow).toHaveAttribute("aria-selected", "true");
  expect(nativeDialogCount).toBe(0);
});

test("주간보고 BOM 상세를 Escape로 닫으면 호출자 포커스를 복구한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsOperator(page);

  const itemId = "e2e-bom-focus-item";
  await page.route("**/api/inventory/weekly-report**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        week_start: "2026-09-07",
        week_end: "2026-09-13",
        groups: [{
          process_code: "TF",
          dept_name: "튜브",
          label: "튜브",
          item_count: 1,
          prev_qty: 1,
          increase_qty: 0,
          decrease_qty: 0,
          produce_qty: 0,
          receive_qty: 0,
          out_qty: 0,
          current_qty: 1,
          delta: 0,
          items: [{
            item_id: itemId,
            mes_code: "E2E-BOM-1",
            item_name: "E2E BOM 포커스 품목",
            prev_qty: 1,
            produce_qty: 0,
            receive_qty: 0,
            out_qty: 0,
            current_qty: 1,
            delta: 0,
          }],
        }],
        summary: {
          total_current_qty: 1,
          total_produce_qty: 0,
          total_receive_qty: 0,
          total_out_qty: 0,
          groups_increasing: 0,
          groups_decreasing: 0,
          groups_unchanged: 1,
        },
        warnings: [],
        production_matrix: [],
        basis_version: 2,
        report_status: "verified",
      }),
    });
  });
  await page.route(`**/api/bom/${itemId}/tree**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        item_id: itemId,
        mes_code: "E2E-BOM-1",
        item_name: "E2E BOM 포커스 품목",
        process_type_code: "TF",
        unit: "EA",
        required_quantity: 1,
        current_stock: 1,
        additional_producible_quantity: 0,
        children: [],
      }),
    });
  });

  await page.goto("/mes?tab=weekly");
  const opener = page.getByRole("button", { name: "E2E BOM 포커스 품목 BOM 구성 보기" }).filter({ visible: true });
  await expect(opener).toBeVisible();
  await opener.focus();
  await opener.press("Enter");

  const bomDialog = page.getByRole("dialog", { name: "BOM 구성 보기" });
  await expect(bomDialog).toBeVisible();
  await expect(bomDialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(bomDialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
