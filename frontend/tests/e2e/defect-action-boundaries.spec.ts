import { randomUUID } from "crypto";
import type { DefectLocation } from "../../lib/api";
import { test, expect, loginUi, changeEmployee } from "./_common-expectations";

test.use({ trace: "retain-on-failure" });

for (const mobile of [false, true]) {
  test(`8.18-05 ${mobile ? "모바일" : "PC"} 창고 불량은 복귀·폐기·반품이고 조립 반품과 B급·구형 추가처리는 없다`, async ({ page, request, actors }) => {
    const response = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `처리옵션경계${randomUUID().slice(0, 8)}`, process_type_code: "AR", model_slots: [1], unit: "EA",
      initial_quantity: 20, initial_locations: [{ department: "조립", quantity: 5 }],
    } });
    expect(response.status(), await response.text()).toBe(201);
    const item = await response.json() as { item_id: string; item_name: string };
    for (const entry of [
      { department: "창고", category: "DEFECT", memo: "창고 불량 옵션" },
      { department: "조립", category: "DEFECT", memo: "부서 불량 옵션" },
      { department: "창고", category: "B_GRADE", memo: "B급 복귀 옵션" },
      { department: "창고", category: "OBSOLETE", memo: "구형 복귀 옵션" },
    ]) {
      const quarantined = await request.post("/api/defects/quarantine", { data: {
        actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 2,
        source: entry.department === "창고" ? "warehouse" : "production", target_dept: entry.department,
        source_dept: entry.department === "창고" ? null : entry.department,
        management_category: entry.category, reason_category: "외관 불량", reason_memo: entry.memo,
      } });
      expect(quarantined.status(), await quarantined.text()).toBe(200);
    }
    const beforeReply = await request.get("/api/defects/locations");
    expect(beforeReply.ok()).toBeTruthy();
    const before = (await beforeReply.json() as DefectLocation[]).filter((row) => row.item_id === item.item_id);
    await loginUi(page, actors.requester);
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mes?tab=defect");
    for (const entry of [
      { storage: false, memo: "창고 불량 옵션", department: "창고", returnAllowed: true },
      { storage: false, memo: "부서 불량 옵션", department: "조립", returnAllowed: false },
      { storage: true, memo: "B급 복귀 옵션", department: "창고", returnAllowed: false },
      { storage: true, memo: "구형 복귀 옵션", department: "창고", returnAllowed: false },
    ]) {
      await page.getByRole("button").filter({ hasText: entry.storage ? "B급·구형 자재" : "격리 목록", visible: true }).click();
      if (mobile) await page.getByRole("button", { name: "필터 펼치기", exact: true }).click();
      const department = page.getByRole("group", { name: "부서 구분" });
      await department.getByRole("button", { name: "전체", exact: true }).click();
      await department.getByRole("button", { name: entry.department, exact: true }).click();
      if (mobile) {
        const summaries = page.getByTestId("defect-mobile-item-summary").filter({ hasText: item.item_name, visible: true });
        await expect(summaries).toHaveCount(entry.storage ? 2 : 1);
        for (const summary of await summaries.all()) if (await summary.getAttribute("aria-expanded") !== "true") await summary.click();
      }
      const row = page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ hasText: entry.memo, visible: true });
      await row.getByRole("button", { name: entry.storage ? "정상 복귀" : "처리", exact: true }).click();
      await expect(page.getByRole("button", { name: /^정상 복귀(?: 불량 해제|$)/ }).filter({ visible: true })).toBeVisible();
      if (entry.returnAllowed) await expect(page.getByRole("button", { name: /^반품(?: |$)/ }).filter({ visible: true })).toBeVisible();
      else await expect(page.getByRole("button", { name: /^반품(?: |$)/ }).filter({ visible: true })).toHaveCount(0);
      if (entry.storage) {
        await expect(page.getByRole("button", { name: /^전체 폐기|^재작업/ }).filter({ visible: true })).toHaveCount(0);
      } else {
        await expect(page.getByRole("button", { name: /^전체 폐기/ }).filter({ visible: true })).toBeVisible();
      }
      await page.getByRole("button", { name: "목록", exact: true }).filter({ visible: true }).click();
      await page.getByRole("button", { name: /^(?:← )?작업 선택$/, exact: true }).filter({ visible: true }).click();
    }
    const afterReply = await request.get("/api/defects/locations");
    expect(afterReply.ok()).toBeTruthy();
    expect((await afterReply.json() as DefectLocation[]).filter((row) => row.item_id === item.item_id)).toEqual(before);
  });

  for (const code of ["TR", "TA"]) {
    test(`8.18-05 ${mobile ? "모바일" : "PC"} 튜브 ${code} 반품은 실제 원건의 업체 범위와 격리 수량을 보존한다`, async ({ page, request, actors }) => {
      await changeEmployee(request, actors.approver, { department: "튜브" });
      const suppliers: Record<string, { supplier_id: string; name: string }> = {};
      for (const scope of ["warehouse", "tube"]) {
        const response = await request.post("/api/suppliers", { data: { requester_employee_id: actors.approver.employee_id, name: `반품범위${scope}${randomUUID().slice(0, 6)}`, scope } });
        expect(response.status(), await response.text()).toBe(201);
        suppliers[scope] = await response.json();
      }
      const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
        item_name: `튜브반품${code}${randomUUID().slice(0, 6)}`, process_type_code: code, model_slots: [1], unit: "EA",
        initial_quantity: 8, initial_locations: [{ department: "튜브", quantity: 4 }],
      } });
      expect(created.status(), await created.text()).toBe(201);
      const item = await created.json();
      const quarantined = await request.post("/api/defects/quarantine", { data: {
        actor_employee_id: actors.requester.employee_id, item_id: item.item_id, qty: 2,
        source: "production", source_dept: "튜브", target_dept: "튜브", management_category: "DEFECT", reason_category: "외관 불량",
      } });
      expect(quarantined.status(), await quarantined.text()).toBe(200);
      const records = await (await request.get("/api/defects/locations")).json() as DefectLocation[];
      const record = records.find((row) => row.item_id === item.item_id)!;
      const scope = code === "TR" ? "tube" : "warehouse";
      expect(record.return_supplier_scope).toBe(scope);
      const before = await (await request.get(`/api/items/${item.item_id}`)).json();
      await loginUi(page, actors.requester);
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/mes?tab=defect");
      await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).click();
      if (mobile) await page.getByRole("button", { name: "필터 펼치기", exact: true }).click();
      await page.getByRole("group", { name: "부서 구분" }).getByRole("button", { name: "튜브", exact: true }).click();
      if (mobile) await page.getByTestId("defect-mobile-item-summary").filter({ hasText: item.item_name }).click();
      const row = page.getByRole("article", { name: `${item.item_name} 격리 기록` }).filter({ visible: true });
      await row.getByRole("button", { name: "처리", exact: true }).click();
      await page.getByRole("spinbutton").filter({ visible: true }).fill("1");
      await page.getByRole("button", { name: /^반품(?: |$)/ }).filter({ visible: true }).click();
      await page.getByRole("button", { name: "사유 카테고리 선택", exact: true }).filter({ visible: true }).click();
      await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
      await page.getByRole("button", { name: "공급업체 선택 →", exact: true }).click();
      const picker = page.getByRole("region", { name: "공급업체 검색·선택" });
      await expect(picker.getByRole("button", { name: suppliers[scope].name, exact: true })).toBeVisible();
      await expect(picker.getByRole("button", { name: suppliers[scope === "tube" ? "warehouse" : "tube"].name, exact: true })).toHaveCount(0);
      await picker.getByRole("button", { name: suppliers[scope].name, exact: true }).click();
      await page.getByRole("button", { name: "반품 확인", exact: true }).click();
      const submitted = page.waitForResponse((response) => response.url().endsWith("/api/stock-requests") && response.request().method() === "POST");
      await page.getByRole("dialog", { name: "반품 확인", exact: true }).getByRole("button", { name: "즉시 반품", exact: true }).click();
      const result = await submitted;
      expect(result.status(), await result.text()).toBe(201);
      expect(await result.json()).toMatchObject({ status: "completed", supplier_id: suppliers[scope].supplier_id });
      const after = await (await request.get(`/api/items/${item.item_id}`)).json();
      expect(after.warehouse_qty).toBe(before.warehouse_qty);
      expect(after.production_total).toBe(before.production_total);
      expect(Number(after.defective_total)).toBe(Number(before.defective_total) - 1);
      const remaining = await (await request.get("/api/defects/locations")).json() as DefectLocation[];
      expect(Number(remaining.find((row) => row.record_id === record.record_id)!.available_quantity)).toBe(1);
    });
  }
}
