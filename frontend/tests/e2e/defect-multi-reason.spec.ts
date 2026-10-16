import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsOperator, readSeed } from "./_helpers";

async function chooseReason(page: Page, line: Locator, name: string, quantity: number, memo: string): Promise<void> {
  await line.getByRole("spinbutton").fill(String(quantity));
  await line.getByRole("button", { name: "사유 카테고리 선택", exact: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name, exact: true }).click();
  await line.getByRole("textbox").fill(memo);
}

test("DEFECT-OTHER-LIVE 1920x1080 둘째 사유를 기타로 바꿔도 입력 높이와 메모 검증을 유지한다", async ({ page, baseURL }) => {
  // This scenario belongs to the synthetic global-setup pair, never a review server.
  expect(["http://localhost:3100", "http://127.0.0.1:3100"]).toContain(new URL(baseURL!).origin);
  expect(readSeed().rawItem.item_name).toBe("E2E원자재튜브");
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginAsOperator(page, { role: "warehouse" });
  const itemName = `E2E기타입력 ${Date.now().toString(36)}`;
  const created = await page.request.post("/api/items", {
    headers: { "X-Admin-Pin": "0000" },
    data: { item_name: itemName, process_type_code: "AA", unit: "EA", model_slots: [1],
      initial_quantity: 5, initial_locations: [{ department: "조립", quantity: 5 }] },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const item = await created.json();
  const before = await (await page.request.get(`/api/items/${item.item_id}`)).json();
  const submissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.startsWith("/api/defects/quarantine")) submissions.push(request.url());
  });

  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  await page.getByRole("button").filter({ hasText: "격리 등록", visible: true }).click();
  await page.getByRole("button", { name: /^부서 재고/ }).filter({ visible: true }).click();
  await page.getByRole("textbox", { name: "검색", exact: true }).filter({ visible: true }).fill(itemName);
  await page.getByTestId(`defect-picker-row-${item.item_id}`).filter({ visible: true }).getByRole("button").click();
  await page.getByRole("button", { name: "수량·처리 정보 →", exact: true }).click();
  const group = page.getByTestId("defect-quarantine-item-group").filter({ visible: true });
  const lines = group.getByTestId("defect-quarantine-reason-line");
  await chooseReason(page, lines.nth(0), "외관 불량", 1, "첫 사유 입력 보존");
  await lines.nth(0).getByRole("button", { name: "B급", exact: true }).click();
  await group.getByRole("button", { name: "다른 사유 추가", exact: true }).click();
  const second = lines.nth(1);
  await expect(second.getByRole("textbox", { name: "메모", exact: true })).toHaveValue("");
  // Change a live category: remounting this step first would conceal the collapse.
  await second.getByRole("button", { name: "사유 카테고리 선택", exact: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "기타", exact: true }).click();
  const submit = page.getByRole("button", { name: "격리하기 (2건) →", exact: true }).filter({ visible: true });
  await expect(submit).toBeDisabled();
  await expect(second.getByText("기타를 선택하면 메모를 입력하세요.", { exact: true }).first()).toBeVisible();
  for (const control of [
    second.getByRole("spinbutton"),
    second.getByRole("button", { name: "사유 카테고리 선택", exact: true }),
    second.getByRole("textbox", { name: "메모", exact: true }),
    second.getByRole("group", { name: "보관 분류", exact: true }),
    second.getByRole("button", { name: /사유 2 삭제$/ }),
  ]) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);
    expect(box!.width).toBeGreaterThan(0);
  }
  await second.getByRole("textbox", { name: "메모", exact: true }).fill("둘째 기타 상세");
  await expect(second.getByText("기타를 선택하면 메모를 입력하세요.", { exact: true })).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await second.getByRole("button", { name: "구형", exact: true }).click();
  await second.getByRole("spinbutton").fill("2");
  await expect(second.getByRole("button", { name: "구형", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByRole("spinbutton")).toHaveValue("2");
  await expect(submit).toBeEnabled();
  await expect(lines.nth(0).getByRole("spinbutton")).toHaveValue("1");
  await expect(lines.nth(0).getByRole("textbox", { name: "메모", exact: true })).toHaveValue("첫 사유 입력 보존");
  await expect(lines.nth(0).getByRole("button", { name: "B급", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(submissions).toEqual([]);
  const after = await page.request.get(`/api/items/${item.item_id}`);
  expect(after.ok(), await after.text()).toBeTruthy();
  expect(await after.json()).toEqual(before);
});

async function assertReasonLayout(line: Locator, mobile: boolean): Promise<void> {
  const quantity = line.getByRole("spinbutton");
  const category = line.getByRole("button", { name: "사유 카테고리 선택", exact: true });
  const memo = line.getByRole("textbox");
  const management = line.getByRole("group", { name: "보관 분류", exact: true });
  const remove = line.getByRole("button", { name: /사유 \d+ 삭제$/ });
  const boxes = await Promise.all([quantity, category, memo, management, remove].map((control) => control.boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const [q, c, m, g, r] = boxes.map((box) => box!);
  const stackedDesktop = !mobile && await category.evaluate((element) => {
    const fields = element.closest("[data-reason-desktop-fields]");
    if (!fields) throw new Error("사유 입력 영역이 없습니다.");
    return fields.getBoundingClientRect().width <= 380;
  });
  const overlapsVertically = (first: typeof q, second: typeof q): boolean =>
    first.y < second.y + second.height && second.y < first.y + first.height;
  expect(q.height).toBe(44);
  expect(q.width).toBe(mobile ? 44 : 80);
  expect(c.height).toBeGreaterThanOrEqual(44);
  expect(m.height).toBeGreaterThanOrEqual(58);
  expect(r.height).toBe(44);
  expect(r.width).toBe(44);
  for (const button of await management.getByRole("button").all()) {
    const buttonBox = (await button.boundingBox())!;
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    if (!mobile) {
      expect(buttonBox.height).toBe(m.height);
      expect(buttonBox.y).toBe(stackedDesktop ? g.y : m.y);
    }
  }
  const lineBox = (await line.boundingBox())!;
  for (const box of [q, c, m, g, r]) {
    expect(box.x).toBeGreaterThanOrEqual(lineBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(lineBox.x + lineBox.width + 1);
  }
  if (mobile) {
    expect(g.x + g.width).toBeLessThanOrEqual((await line.boundingBox())!.x + (await line.boundingBox())!.width + 1);
    if ((line.page().viewportSize()?.width ?? 0) <= 400) {
      expect(g.y).toBeGreaterThanOrEqual(q.y + q.height);
    } else {
      expect(q.x + q.width).toBeLessThanOrEqual(g.x);
      expect(overlapsVertically(q, g)).toBe(true);
    }
    expect(overlapsVertically(q, r)).toBe(true);
    expect(c.y).toBeGreaterThanOrEqual(Math.max(q.y + q.height, g.y + g.height));
    expect(m.y).toBeGreaterThanOrEqual(c.y + c.height);
    expect(Math.abs(c.x - m.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.width - m.width)).toBeLessThanOrEqual(1);
    const lineBox = (await line.boundingBox())!;
    expect(c.width).toBeGreaterThanOrEqual(lineBox.width - 2);
  } else {
    expect(q.x + q.width).toBeLessThanOrEqual(c.x);
    expect(c.height).toBe(q.height);
    expect(r.height).toBe(q.height);
    expect(overlapsVertically(q, c)).toBe(true);
    expect(overlapsVertically(q, r)).toBe(true);
    expect(c.x + c.width).toBeLessThanOrEqual(r.x + 1);
    expect(m.y).toBeGreaterThanOrEqual(q.y + q.height);
    if (stackedDesktop) {
      expect(g.y).toBeGreaterThanOrEqual(m.y + m.height);
      expect(Math.abs(g.x - m.x)).toBeLessThanOrEqual(1);
    } else {
      expect(overlapsVertically(m, g)).toBe(true);
      expect(m.x + m.width).toBeLessThanOrEqual(g.x + 1);
    }
  }
}

async function assertHideConfirmation(page: Page, line: Locator, categoryId: string, name: string, evidencePath: string): Promise<void> {
  const beforeQuantity = await line.getByRole("spinbutton").inputValue();
  const beforeMemo = await line.getByRole("textbox").inputValue();
  const beforeCategory = await line.getByRole("button", { name: "사유 카테고리 선택", exact: true }).textContent();
  await line.getByRole("button", { name: "사유 카테고리 선택", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "사유 카테고리", exact: true, includeHidden: true });
  const search = picker.getByRole("searchbox", { name: "사유 검색", exact: true });
  await search.fill(name);
  const hide = picker.getByRole("button", { name: `${name} 숨김`, exact: true });
  const confirmation = page.getByRole("dialog", { name: `“${name}” 사유를 숨길까요?`, exact: true });
  const patches: unknown[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname === `/api/defects/reason-categories/${categoryId}`) {
      patches.push(request.postDataJSON());
    }
  });

  for (const dismiss of ["cancel", "escape"] as const) {
    await hide.click();
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(name);
    expect(patches).toHaveLength(0);
    const confirmButton = confirmation.getByRole("button", { name: "숨기기", exact: true });
    expect(await confirmButton.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await page.keyboard.press("Tab");
    expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    if (dismiss === "cancel") await confirmation.getByRole("button", { name: "취소", exact: true }).click();
    else await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(picker).toBeVisible();
    await expect(hide).toBeFocused();
    await expect(search).toHaveValue(name);
    expect(patches).toHaveLength(0);
  }

  await hide.click();
  await expect(confirmation).toBeVisible();
  expect(patches).toHaveLength(0);
  await page.screenshot({ path: evidencePath, fullPage: true });
  const responsePending = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/defects/reason-categories/${categoryId}` && response.request().method() === "PATCH");
  await confirmation.getByRole("button", { name: "숨기기", exact: true }).click();
  const response = await responsePending;
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(await response.json()).toMatchObject({ category_id: categoryId, is_active: false });
  await expect(confirmation).toHaveCount(0);
  await expect(picker).toBeVisible();
  await expect(search).toBeFocused();
  await expect(picker.getByRole("button", { name, exact: true })).toHaveCount(0);
  expect(patches).toEqual([expect.objectContaining({ is_active: false })]);
  await picker.getByRole("button", { name: "숨김 사유 관리", exact: true }).click();
  await expect(picker.getByRole("button", { name: `${name} 복원`, exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "사유 선택 닫기", exact: true }).click();
  await expect(line.getByRole("spinbutton")).toHaveValue(beforeQuantity);
  await expect(line.getByRole("textbox")).toHaveValue(beforeMemo);
  await expect(line.getByRole("button", { name: "사유 카테고리 선택", exact: true })).toHaveText(beforeCategory!);
}

for (const scenario of [
  { name: "PC", width: 1914, height: 878, mobile: false },
  { name: "PC 목표 크기", width: 1915, height: 884, mobile: false },
  { name: "좁은 PC", width: 1280, height: 878, mobile: false },
  { name: "최소 PC", width: 1100, height: 878, mobile: false },
  { name: "모바일", width: 393, height: 852, mobile: true },
  { name: "좁은 모바일", width: 320, height: 740, mobile: true },
]) {
  test(`${scenario.name}: 같은 품목 사유별 입력·삭제·합계 검증·일괄 저장`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    const operator = await loginAsOperator(page, { role: "warehouse" });
    const fixtureId = Date.now().toString(36);
    const itemName = `E2E다중사유 ${scenario.name} ${fixtureId} 텅스텐 필라멘트 긴 품목명 [70kV]`;
    const created = await page.request.post("/api/items", {
      headers: { "X-Admin-Pin": "0000" },
      data: { item_name: itemName, process_type_code: "TR", unit: "EA", model_slots: [1], initial_quantity: 20, min_stock: 0 },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const item = await created.json();
    const categories: string[] = [];
    for (const suffix of ["A", "B", "C"]) {
      const name = `다중사유 ${scenario.name} ${suffix} ${fixtureId}`;
      const response = await page.request.post("/api/defects/reason-categories", {
        data: { requester_employee_id: operator.employee_id, name },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      categories.push(name);
    }
    const hiddenName = `숨김 검증 ${scenario.name} ${fixtureId}`;
    const hiddenCreated = await page.request.post("/api/defects/reason-categories", {
      data: { requester_employee_id: operator.employee_id, name: hiddenName },
    });
    expect(hiddenCreated.ok(), await hiddenCreated.text()).toBeTruthy();
    const hiddenCategory = await hiddenCreated.json();

    await page.goto("/mes?tab=defect");
    await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
    await page.getByRole("button").filter({ hasText: "격리 등록", visible: true }).click();
    await page.getByRole("button", { name: /^창고 재고/ }).filter({ visible: true }).click();
    await page.getByRole("textbox", { name: "검색", exact: true }).filter({ visible: true }).fill(itemName);
    const pickerButton = page.getByTestId(`defect-picker-row-${item.item_id}`).filter({ visible: true }).getByRole("button");
    await pickerButton.click();
    if (scenario.mobile) await page.getByRole("button", { name: /수량 조정/ }).filter({ visible: true }).click();
    else await page.getByRole("button", { name: "수량·처리 정보 →", exact: true }).click();

    const group = page.getByTestId("defect-quarantine-item-group").filter({ visible: true });
    await expect(group).toHaveCount(1);
    const lines = group.getByTestId("defect-quarantine-reason-line");
    await chooseReason(page, lines.nth(0), categories[0], 3, "A 입력 보존");
    await group.getByRole("button", { name: /다른 사유 추가/ }).click();
    await expect(lines.nth(1).getByRole("spinbutton")).toBeFocused();
    await chooseReason(page, lines.nth(1), categories[1], 4, "B 입력");
    await expect(group.getByText(/^사유 \d+$/, { exact: true })).toHaveCount(0);
    await expect(group.getByRole("button", { name: /사유 복사/ })).toHaveCount(0);
    for (let index = 0; index < 2; index += 1) {
      await expect(lines.nth(index)).toHaveAttribute("aria-label", `${itemName} 사유 ${index + 1}`);
      await assertReasonLayout(lines.nth(index), scenario.mobile);
    }
    if (scenario.width === 1915) {
      const panel = page.getByTestId("defect-cart-panel").filter({ visible: true });
      const panelBox = (await panel.boundingBox())!;
      const groupBox = (await group.boundingBox())!;
      const addBox = (await group.getByRole("button", { name: /다른 사유 추가/ }).boundingBox())!;
      expect(groupBox.y).toBeGreaterThanOrEqual(panelBox.y);
      expect(addBox.y + addBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
      expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        await page.screenshot({ path: testInfo.outputPath(`two-reasons-${theme}.png`), fullPage: true });
      }
    }
    await assertHideConfirmation(page, lines.nth(0), hiddenCategory.category_id, hiddenName, testInfo.outputPath("hide-confirmation.png"));
    await group.getByRole("button", { name: /다른 사유 추가/ }).click();
    await chooseReason(page, lines.nth(2), categories[2], 3, "C 입력 보존");
    if (scenario.mobile) await expect(group).toContainText("총 10 EA · 3건");
    else await expect(group.getByLabel("품목 수량 요약").getByRole("definition")).toHaveText(["20EA", "10EA", "3건"]);

    if (scenario.width === 1915) {
      await group.getByRole("button", { name: /다른 사유 추가/ }).click();
      await chooseReason(page, lines.nth(3), categories[0], 1, "");
      await lines.nth(3).getByRole("button", { name: "B급", exact: true }).click();
      await page.getByRole("button", { name: /격리하기 \(4건\)/ }).filter({ visible: true }).click();
      const preview = page.getByRole("dialog", { name: "불량 격리 확인", exact: true });
      await expect(preview).toBeVisible();
      await expect(preview).toContainText("총 11 EA · 4건");
      const panel = preview.locator(":scope > div");
      const panelBox = (await panel.boundingBox())!;
      expect(panelBox.width).toBeGreaterThanOrEqual(900);
      expect(panelBox.width).toBeLessThanOrEqual(scenario.width - 32);
      const rows = preview.getByTestId("defect-confirm-line");
      await expect(rows).toHaveCount(4);
      for (const row of await rows.all()) {
        const rowBox = (await row.boundingBox())!;
        expect(rowBox.y).toBeGreaterThanOrEqual(panelBox.y);
        expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height);
        expect(await row.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        })).toBe(true);
      }
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        await page.screenshot({ path: testInfo.outputPath(`four-reason-confirm-${theme}.png`), fullPage: true });
      }
      await preview.getByRole("button", { name: "취소", exact: true }).click();
      await expect(lines).toHaveCount(4);
      await expect(lines.nth(0).getByRole("textbox")).toHaveValue("A 입력 보존");
      await lines.nth(3).getByRole("button", { name: /사유 4 삭제/ }).click();
      await expect(lines).toHaveCount(3);
    }

    await lines.nth(1).getByRole("button", { name: /사유 2 삭제/ }).click();
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0).getByRole("textbox")).toHaveValue("A 입력 보존");
    await expect(lines.nth(1).getByRole("textbox")).toHaveValue("C 입력 보존");
    if (scenario.mobile) await expect(group).toContainText("총 6 EA · 2건");
    else await expect(group.getByLabel("품목 수량 요약").getByRole("definition")).toHaveText(["20EA", "6EA", "2건"]);
    await group.getByRole("button", { name: /다른 사유 추가/ }).click();
    await expect(lines.nth(2).getByRole("button", { name: "사유 카테고리 선택", exact: true })).toHaveText(scenario.mobile ? "카테고리 선택" : "사유 카테고리를 선택하세요.");
    await chooseReason(page, lines.nth(2), categories[1], 4, "B 재입력");

    const submit = page.getByRole("button", { name: /격리하기 \(3건\)/ }).filter({ visible: true });
    await lines.nth(0).getByRole("spinbutton").fill("15");
    await expect(group).toContainText("가용 20개보다 2개 많습니다.");
    await expect(submit).toBeDisabled();
    await lines.nth(0).getByRole("spinbutton").fill("3");
    await expect(submit).toBeEnabled();

    if (scenario.mobile) {
      await page.getByRole("button", { name: "이전", exact: true }).filter({ visible: true }).click();
      await expect(pickerButton).toHaveText(/담김 · 3건/);
      await pickerButton.click();
      await expect(group).toBeVisible();
      await expect(lines).toHaveCount(3);
    } else {
      await page.getByRole("navigation", { name: "불량 처리 단계" }).getByRole("button", { name: /품목 선택/ }).click();
      await expect(pickerButton).toHaveText("담김");
      await expect(page.getByTestId(`defect-picker-row-${item.item_id}`).filter({ visible: true })).toHaveAttribute("data-added", "true");
      await expect(page.getByText("선택 1품목", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "수량·처리 정보 →", exact: true }).click();
      await expect(lines).toHaveCount(3);
      await expect(lines.nth(0).getByRole("spinbutton")).toHaveValue("3");
      await expect(lines.nth(0).getByRole("textbox")).toHaveValue("A 입력 보존");
      await expect(lines.nth(1).getByRole("textbox")).toHaveValue("C 입력 보존");
      await expect(lines.nth(2).getByRole("textbox")).toHaveValue("B 재입력");
      await expect.poll(async () => {
        const header = await group.getByText(itemName, { exact: true }).boundingBox();
        const panel = await page.getByTestId("defect-cart-panel").boundingBox();
        return Boolean(header && panel && header.y >= panel.y && header.y + header.height <= panel.y + panel.height);
      }).toBe(true);
    }

    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`${theme}.png`), fullPage: true });
    }
    await submit.click();
    const confirmation = page.getByRole("dialog", { name: "불량 격리 확인", exact: true });
    await expect(confirmation).toContainText("총 10");
    for (const name of categories) await expect(confirmation).toContainText(name);
    for (const memo of ["A 입력 보존", "C 입력 보존", "B 재입력"]) await expect(confirmation).toContainText(memo);
    const responsePending = page.waitForResponse((response) => response.url().endsWith("/api/defects/quarantine/bulk") && response.request().method() === "POST");
    await confirmation.getByRole("button", { name: "격리하기", exact: true }).click();
    const response = await responsePending;
    expect(response.ok(), await response.text()).toBeTruthy();
    expect(await response.json()).toMatchObject({ processed_lines: 3 });
    const payload = response.request().postDataJSON();
    expect(payload.lines.map((line: { item_id: string }) => line.item_id)).toEqual([item.item_id, item.item_id, item.item_id]);
    await expect(page.getByRole("button").filter({ hasText: "불량 처리", visible: true })).toBeVisible();
    const records = (await (await page.request.get("/api/defects/locations")).json()).filter((record: { item_id: string }) => record.item_id === item.item_id);
    expect(records).toHaveLength(3);
    expect(records.map((record: { quantity: number }) => Number(record.quantity)).sort()).toEqual([3, 3, 4]);
    expect(records.map((record: { reason_category: string }) => record.reason_category).sort()).toEqual([...categories].sort());
    const inventory = await (await page.request.get(`/api/items/${item.item_id}`)).json();
    expect(Number(inventory.warehouse_qty)).toBe(10);
    const replay = await page.request.post("/api/defects/quarantine/bulk", { data: payload });
    expect(replay.ok(), await replay.text()).toBeTruthy();
    expect(Number((await (await page.request.get(`/api/items/${item.item_id}`)).json()).warehouse_qty)).toBe(10);
  });
}
