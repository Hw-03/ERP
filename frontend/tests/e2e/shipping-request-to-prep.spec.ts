import { expect, test } from "@playwright/test";

import { loginAsOperator, readSeed } from "./_helpers";


test.describe("출하 — 요청 생성 즉시 준비 시작", () => {
  test("작업자가 새 요청을 준비 중 목록에서 열고 준비 작업을 계속한다", async ({ page }) => {
    const operator = await loginAsOperator(page);
    const { shippingItem: basePf } = readSeed() as ReturnType<typeof readSeed> & {
      shippingItem: { item_id: string };
    };

    const requester = operator.name;
    const createResponse = await page.request.post("/api/shipping/requests", {
      data: {
        base_pf_item_id: basePf.item_id,
        request_quantity: 1,
        requested_by_name: requester,
        invoice_number: `E2E-${Date.now()}`,
      },
    });
    const createBody = await createResponse.text();
    expect(createResponse.status(), createBody).toBe(201);
    const created: { request_id: string; status: string } = JSON.parse(createBody);
    expect(created.status).toBe("PREPARING");

    await page.goto("/mes?tab=shipping");
    await page.getByRole("button", { name: /출하 관리/ }).filter({ visible: true }).click();
    await page.locator(`[data-shipping-request-id="${created.request_id}"]`).click();

    await expect(page.getByTestId("shipping-request-detail")).toBeVisible();
    await expect(page.getByRole("button", { name: "준비 완료", exact: true })).toBeVisible();

    const persistedResponse = await page.request.get(`/api/shipping/requests/${created.request_id}`);
    expect(persistedResponse.ok()).toBe(true);
    expect((await persistedResponse.json()).status).toBe("PREPARING");
    expect(operator.employee_id).toBeTruthy();
  });
});
