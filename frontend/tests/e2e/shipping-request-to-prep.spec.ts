import { expect, test } from "@playwright/test";

import { loginAsOperator, readSeed } from "./_helpers";


test.describe("출하 — 요청을 준비 중으로 전환", () => {
  test("작업자가 출하 목록에서 요청을 열고 준비 작업으로 넘긴다", async ({ page }) => {
    const operator = await loginAsOperator(page);
    const { shippingItem: basePf } = readSeed() as ReturnType<typeof readSeed> & {
      shippingItem: { item_id: string };
    };

    const requester = `E2E 출하 ${Date.now()}`;
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
    expect(created.status).toBe("REQUESTED");

    await page.goto("/mes?tab=shipping");
    await page.getByRole("button", { name: /출하 관리/ }).filter({ visible: true }).click();
    await page.getByRole("button", { name: new RegExp(requester) }).click();

    const transitionResponse = page.waitForResponse((response) => (
      response.request().method() === "POST"
      && response.url().endsWith(`/api/shipping/requests/${created.request_id}/send-to-prep`)
    ));
    await page.getByRole("button", { name: "출하 요청", exact: true }).filter({ visible: true }).click();

    const response = await transitionResponse;
    expect(response.ok()).toBe(true);
    const transitioned: { status: string } = await response.json();
    expect(transitioned.status).toBe("PREPARING");
    await expect(page.getByText("준비 체크", { exact: true }).filter({ visible: true })).toBeVisible();

    const persistedResponse = await page.request.get(`/api/shipping/requests/${created.request_id}`);
    expect(persistedResponse.ok()).toBe(true);
    expect((await persistedResponse.json()).status).toBe("PREPARING");
    expect(operator.employee_id).toBeTruthy();
  });
});
