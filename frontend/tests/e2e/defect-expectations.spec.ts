import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsOperator, readSeed } from "./_helpers";

// The eight full/partial B_GRADE/OBSOLETE PC/mobile navigation combinations stay
// in defect-quarantine-records.spec.ts. This file covers independent conditions.
async function readJson(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.ok(), `${url}: ${response.status()}`).toBeTruthy();
  return response.json();
}

async function stockEvidence(request: APIRequestContext, itemId: string) {
  return {
    item: await readJson(request, `/api/items/${itemId}`),
    locations: await readJson(request, `/api/inventory/locations/${itemId}`),
    records: (await readJson(request, "/api/defects/locations")).filter((row: { item_id: string }) => row.item_id === itemId),
    transactions: await readJson(request, `/api/inventory/transactions?item_id=${itemId}&limit=1000`),
  };
}

async function openCart(page: Page, action: "격리 등록" | "즉시 폐기", source: "창고 재고" | "부서 재고") {
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
  await expect(choices).toBeVisible();
  await choices.getByRole("button", { name: new RegExp(`^${action}`) }).click();
  await choices.getByRole("button", { name: new RegExp(`^${source}`) }).click();
  await expect(page.getByTestId("defect-picker-pane").filter({ visible: true })).toBeVisible();
}

async function addItem(page: Page, item: { item_name: string; mes_code: string }) {
  const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
  await picker.getByRole("combobox").nth(0).click();
  await page.getByRole("listbox").getByRole("option", { name: "전체", exact: true }).click();
  await picker.getByPlaceholder("품목명 · 품목 코드").fill(item.mes_code);
  await picker.getByRole("button", { name: `${item.item_name} 장바구니에 추가`, exact: true }).click();
}

async function selectReason(page: Page, name: string) {
  await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name, exact: true }).click();
}

test.describe("불량 확정 기대값의 독립 브라우저 조건", () => {
  for (const source of ["창고 재고", "부서 재고"] as const) {
    for (const action of ["격리 등록", "즉시 폐기"] as const) {
      test(`8.5-01 8.5-03 8.7-01 8.7-03 작업·출처·가용 ${action} ${source}`, async ({ page }) => {
        const seed = readSeed();
        await loginAsOperator(page, { code: seed.plainEmployee.employee_code });
        const before = await stockEvidence(page.request, seed.rawItem.item_id);
        await openCart(page, action, source);
        const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
        await expect(picker.getByRole("columnheader", { name: source === "창고 재고" ? "창고 가용" : "부서 가용" })).toBeVisible();
        await addItem(page, seed.rawItem);
        const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
        await expect(cart).toContainText(`자동 부서 · ${source === "창고 재고" ? "창고" : "튜브"}`);
        expect(await page.evaluate(() => history.state.source)).toBe(source === "창고 재고" ? "warehouse" : "production");
        const row = picker.getByTestId(`defect-picker-row-${seed.rawItem.item_id}`);
        const available = source === "창고 재고"
          ? Number(before.item.warehouse_qty) - Number(before.item.pending_quantity ?? 0)
          : Number(before.locations.find((location: { department: string; status: string }) => location.department === "튜브" && location.status === "PRODUCTION")?.available_quantity ?? 0);
        await expect(row.getByRole("cell").nth(2)).toHaveText(String(available));
        expect(await stockEvidence(page.request, seed.rawItem.item_id)).toEqual(before);
      });
    }
  }

  test("8.5-07 8.10-02 8.10-05 제출 사유·기타 메모·초과량은 확인 전 차단", async ({ page }) => {
    const seed = readSeed();
    await loginAsOperator(page, { code: seed.plainEmployee.employee_code });
    const before = await stockEvidence(page.request, seed.rawItem.item_id);
    await openCart(page, "격리 등록", "창고 재고");
    await addItem(page, seed.rawItem);
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    const submit = page.getByRole("button", { name: /^격리하기 \(\d+건\) →$/ }).filter({ visible: true });
    await cart.getByRole("spinbutton").fill("1");
    await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill("메모만 있음");
    await expect(submit).toBeDisabled();
    await selectReason(page, "기타");
    await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill("");
    await expect(submit).toBeDisabled();
    await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill("기타 상세");
    await expect(submit).toBeEnabled();
    await cart.getByRole("spinbutton").fill(String(Number(before.item.warehouse_qty) + 1));
    await expect(submit).toBeDisabled();
    await expect(cart).toContainText(/부족|가용/);
    await expect(page.getByRole("dialog", { name: "불량 격리 확인" })).toHaveCount(0);
    expect(await stockEvidence(page.request, seed.rawItem.item_id)).toEqual(before);
  });

  test("8.7-05 PC-DELTA-DEFECT-03 확인 취소·이탈 머무르기·나가기는 서버 무변경", async ({ page }) => {
    const seed = readSeed();
    await loginAsOperator(page, { code: seed.plainEmployee.employee_code });
    const before = await stockEvidence(page.request, seed.rawItem.item_id);
    await openCart(page, "즉시 폐기", "창고 재고");
    await addItem(page, seed.rawItem);
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    await cart.getByRole("spinbutton").fill("1");
    await selectReason(page, "외관 불량");
    await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill("보존할 폐기 입력");
    await page.getByRole("button", { name: /^즉시 폐기 \(\d+건\) →$/ }).filter({ visible: true }).click();
    const confirmation = page.getByRole("dialog", { name: "즉시 폐기 확인" });
    await expect(confirmation).toContainText(seed.rawItem.item_name);
    await expect(confirmation).toContainText("창고");
    await expect(confirmation).toContainText("수량 1");
    await confirmation.getByRole("button", { name: "취소", exact: true }).click();
    expect(await stockEvidence(page.request, seed.rawItem.item_id)).toEqual(before);
    await page.getByRole("complementary").getByRole("button").filter({ has: page.getByText("대시보드", { exact: true }) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "계속 머무르기", exact: true }).click();
    await expect(cart.getByRole("spinbutton")).toHaveValue("1");
    await expect(cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단")).toHaveValue("보존할 폐기 입력");
    await page.getByRole("complementary").getByRole("button").filter({ has: page.getByText("대시보드", { exact: true }) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "나가기", exact: true }).click();
    await expect(page.getByTestId("defect-cart-panel").filter({ visible: true })).toHaveCount(0);
    expect(await stockEvidence(page.request, seed.rawItem.item_id)).toEqual(before);
  });

  test("8.10-05 8.10-06 복수 행 로컬 오류·서버 거부를 모두 표시하고 입력·재고 보존", async ({ page }) => {
    const seed = readSeed();
    await loginAsOperator(page, { code: seed.plainEmployee.employee_code });
    const items = [seed.rawItem, seed.parentItem];
    const before = await Promise.all(items.map((item) => stockEvidence(page.request, item.item_id)));
    await openCart(page, "격리 등록", "창고 재고");
    for (const item of items) await addItem(page, item);
    const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
    const submit = page.getByRole("button", { name: /^격리하기 \(\d+건\) →$/ }).filter({ visible: true });
    await cart.getByRole("spinbutton").nth(0).fill("0");
    await cart.getByRole("spinbutton").nth(1).fill("0");
    await expect(cart.getByText("수량은 1개 이상 입력하세요.", { exact: true })).toHaveCount(2);
    await expect(submit).toBeDisabled();
    await expect(page.getByRole("dialog", { name: "불량 격리 확인" })).toHaveCount(0);
    for (let index = 0; index < items.length; index += 1) {
      await cart.getByRole("spinbutton").nth(index).fill("1");
      await cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).nth(index).click();
      await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
    }
    await page.route("**/api/defects/quarantine/bulk", async (route) => {
      const payload = route.request().postDataJSON();
      expect(payload.lines.map((line: { item_id: string }) => line.item_id)).toEqual(items.map((item) => item.item_id));
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({
        detail: { code: "VALIDATION_ERROR", message: `${items[0].item_name}: 첫째 재고 부족\n${items[1].item_name}: 둘째 재고 부족` },
      }) });
    });
    await submit.click();
    await page.getByRole("dialog", { name: "불량 격리 확인" }).getByRole("button", { name: "격리하기", exact: true }).click();
    await expect(cart).toContainText("첫째 재고 부족");
    await expect(cart).toContainText("둘째 재고 부족");
    await expect(cart.getByRole("spinbutton").nth(0)).toHaveValue("1");
    await expect(cart.getByRole("spinbutton").nth(1)).toHaveValue("1");
    for (let index = 0; index < items.length; index += 1) {
      expect(await stockEvidence(page.request, items[index].item_id)).toEqual(before[index]);
    }
  });

  test("8.11-05 기간만 변경하면 부서·모델·공정 필터 유지, 명시 초기화만 제거", async ({ page }) => {
    const seed = readSeed();
    await loginAsOperator(page, { code: seed.plainEmployee.employee_code });
    const before = await stockEvidence(page.request, seed.rawItem.item_id);
    const originalIds = new Set(before.records.map((record: { record_id: string }) => record.record_id));
    const fixture = await page.request.post("/api/defects/quarantine", { data: {
      actor_employee_id: seed.plainEmployee.employee_id, item_id: seed.rawItem.item_id,
      qty: 1, source: "production", source_dept: "튜브", target_dept: "튜브",
      reason_category: "외관 불량", reason_memo: "E2E 통계 필터 유지",
    } });
    expect(fixture.status(), await fixture.text()).toBe(200);
    const origins = await readJson(page.request, "/api/defects/locations");
    const origin = origins.find((record: { record_id: string; item_id: string }) => record.item_id === seed.rawItem.item_id && !originalIds.has(record.record_id));
    expect(origin).toBeTruthy();
    try {
    await page.goto("/mes?tab=defect");
    await page.getByRole("button").filter({ hasText: "불량 통계", visible: true }).click();
    await page.getByRole("button", { name: "분류 조건 펼치기", exact: true }).filter({ visible: true }).click();
    const filters = page.locator("#statistics-category-filters").filter({ visible: true });
    const department = filters.getByRole("group", { name: "부서 구분" }).getByRole("button").filter({ hasNotText: "전체" }).first();
    await expect(department).toBeVisible();
    const departmentName = (await department.innerText()).trim();
    await department.click();
    const model = filters.getByRole("group", { name: "모델 구분" }).getByRole("button").filter({ hasNotText: "전체" }).first();
    await expect(model).toBeVisible();
    const modelName = (await model.innerText()).trim();
    await model.click();
    await filters.getByRole("group", { name: "공정 구분" }).getByRole("button", { name: "원자재", exact: true }).click();
    for (const period of ["주간", "연간", "월간"]) {
      const response = page.waitForResponse((reply) => {
        const url = new URL(reply.url());
        return url.pathname.includes("/api/defects/statistics/report") && reply.ok()
          && url.searchParams.get("period") === ({ 주간: "week", 연간: "year", 월간: "month" } as Record<string, string>)[period]
          && url.searchParams.get("department") === departmentName
          && url.searchParams.get("model") === modelName
          && url.searchParams.get("process_step") === "R";
      });
      await page.getByRole("group", { name: "조회 기간" }).filter({ visible: true }).getByRole("button", { name: period, exact: true }).click();
      const url = new URL((await response).url());
      expect(url.searchParams.getAll("department")).toEqual([departmentName]);
      expect(url.searchParams.getAll("model")).toEqual([modelName]);
      expect(url.searchParams.getAll("process_step")).toEqual(["R"]);
      await expect(filters.getByRole("button", { name: departmentName, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(filters.getByRole("button", { name: modelName, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(filters.getByRole("button", { name: "원자재", exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    const resetResponse = page.waitForResponse((reply) => reply.url().includes("/api/defects/statistics/report") && reply.ok());
    await page.getByRole("button", { name: "전체 초기화", exact: true }).filter({ visible: true }).first().click();
    const reset = new URL((await resetResponse).url());
    expect(reset.searchParams.getAll("department")).toEqual([]);
    expect(reset.searchParams.getAll("model")).toEqual([]);
    expect(reset.searchParams.getAll("process_step")).toEqual([]);
    } finally {
      const restored = await page.request.post("/api/defects/unquarantine", { data: {
        actor_employee_id: seed.plainEmployee.employee_id, item_id: seed.rawItem.item_id,
        record_id: origin.record_id, dept: "튜브", qty: 1, reason_category: "외관 불량",
        reason_memo: "E2E 통계 필터 fixture 정상 복귀",
      } });
      expect(restored.status(), await restored.text()).toBe(200);
      const after = await stockEvidence(page.request, seed.rawItem.item_id);
      expect(after.item.warehouse_qty).toEqual(before.item.warehouse_qty);
      for (const location of after.locations) {
        const original = before.locations.find((entry: { department: string; status: string }) => entry.department === location.department && entry.status === location.status);
        expect(Number(location.quantity)).toBe(Number(original?.quantity ?? 0));
        expect(Number(location.pending_quantity)).toBe(Number(original?.pending_quantity ?? 0));
      }
    }
  });
});
