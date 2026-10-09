import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect, loginUi } from "./_common-expectations";
import { readSeed } from "./_helpers";

type Part = { item_id: string; item_name: string; mes_code: string };
async function read(request: APIRequestContext, url: string) {
  const reply = await request.get(url);
  expect(reply.ok(), await reply.text()).toBeTruthy();
  return reply.json();
}

test("DEFECT-REWORK 8.5-01/03 8.8-01/02/03 PC-DELTA-DEFECT-04 실제 단일 상위·전체 오류·최종 하위 배분과 실행 위치", async ({ page, request, actors }) => {
  const seed = await read(request, `/api/items/${readSeed().parentItem.item_id}`);
  const family = `재작업검수${randomUUID().slice(0, 7)}`;
  const memo = `${family} 전체 하위 배분 검수`;
  const parts: Part[] = [];
  for (const [index, process] of ["AA", "AA", "AR", "TR", "HR"].entries()) {
    const parent = index < 2;
    const reply = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `${family}-${index}`, process_type_code: process, model_slots: seed.model_slots, unit: "EA",
      initial_quantity: parent ? 8 : 0, initial_locations: parent ? [{ department: "조립", quantity: 3 }] : [],
    } });
    expect(reply.status(), await reply.text()).toBe(201);
    parts.push(await reply.json());
  }
  for (const parent of parts.slice(0, 2)) for (const child of parts.slice(2)) {
    const reply = await request.post("/api/bom", { headers: { "X-Admin-Pin": "0000" }, data: {
      parent_item_id: parent.item_id, child_item_id: child.item_id, quantity: 3, unit: "EA",
    } });
    expect(reply.status(), await reply.text()).toBe(201);
  }
  const before = await Promise.all(parts.map(part => read(request, `/api/items/${part.item_id}`)));
  expect(before[1].warehouse_qty).toBe(5);
  expect(Number(before[1].locations.find((cell: { department: string; status: string }) => cell.department === "조립" && cell.status === "PRODUCTION").available_quantity)).toBe(3);
  await loginUi(page, actors.requester);
  await page.getByRole("navigation").getByRole("button", { name: "불량 격리·폐기·반품 처리", exact: true }).click();
  await page.getByRole("button").filter({ hasText: "불량 처리", visible: true }).click();
  const choices = page.getByTestId("defect-work-choice").filter({ visible: true });
  for (const action of ["격리 등록", "즉시 폐기", "즉시 재작업"]) await expect(choices.getByRole("button", { name: new RegExp(`^${action}`) })).toBeVisible();
  await choices.getByRole("button", { name: /^즉시 재작업/ }).click();
  const picker = page.getByTestId("defect-picker-pane").filter({ visible: true });
  await expect(picker).toBeVisible();
  expect(await page.evaluate(() => history.state.source)).toBe("production");
  await picker.getByPlaceholder("품목명 · 품목 코드").fill(family);
  await expect(picker.getByRole("columnheader", { name: "부서 가용", exact: true })).toBeVisible();
  for (const child of parts.slice(2)) await expect(picker.getByTestId(`defect-picker-row-${child.item_id}`)).toHaveCount(0);
  for (const parent of parts.slice(0, 2)) {
    const option = picker.getByTestId(`defect-picker-row-${parent.item_id}`);
    await expect(option.getByRole("cell").nth(2)).toHaveText("3");
    await option.getByRole("button", { name: `${parent.item_name} 장바구니에 추가`, exact: true }).click();
  }
  const cart = page.getByTestId("defect-cart-panel").filter({ visible: true });
  await expect(cart.getByRole("spinbutton")).toHaveCount(1);
  await expect(cart).toContainText(parts[1].item_name);
  await expect(cart).not.toContainText(parts[0].item_name);
  await expect(cart).toContainText("자동 부서 · 조립");
  await expect(cart.getByRole("combobox")).toHaveCount(0);
  await cart.getByRole("spinbutton").fill("4");
  await expect(page.getByRole("button", { name: "BOM 확인 →", exact: true })).toBeDisabled();
  await cart.getByRole("spinbutton").fill("1");
  await cart.getByRole("button", { name: "사유 카테고리 선택", exact: true }).click();
  await page.getByRole("dialog", { name: "사유 카테고리", exact: true }).getByRole("button", { name: "외관 불량", exact: true }).click();
  await cart.getByPlaceholder("예: 스크래치 다수 / 우측 끝단").fill(memo);
  await page.getByRole("button", { name: "BOM 확인 →", exact: true }).click();
  const children = parts.slice(2);
  for (const child of children) {
    await expect(page.getByLabel(`${child.item_name} 정상 수량`, { exact: true }).filter({ visible: true })).toHaveValue("3");
    await expect(page.getByLabel(`${child.item_name} 격리 수량`, { exact: true }).filter({ visible: true })).toHaveValue("0");
    await expect(page.getByLabel(`${child.item_name} 폐기 수량`, { exact: true }).filter({ visible: true })).toHaveValue("0");
  }
  await page.getByLabel(`${children[0].item_name} 정상 수량`, { exact: true }).filter({ visible: true }).fill("2");
  await page.getByLabel(`${children[1].item_name} 정상 수량`, { exact: true }).filter({ visible: true }).fill("4");
  await expect(page.getByText("합계가 총 수량과 같아야 합니다.", { exact: true }).filter({ visible: true })).toHaveCount(2);
  const submit = page.getByRole("button", { name: "즉시 재작업 (1건) →", exact: true }).filter({ visible: true });
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "즉시 재작업 확인", exact: true })).toHaveCount(0);
  expect(await Promise.all(parts.map(part => read(request, `/api/items/${part.item_id}`)))).toEqual(before);
  const allocations = [{ normal: 1, defective: 1, scrap: 1 }, { normal: 0, defective: 1, scrap: 2 }, { normal: 3, defective: 0, scrap: 0 }];
  for (const [index, child] of children.entries()) {
    const split = allocations[index];
    for (const [label, value] of [["정상", split.normal], ["격리", split.defective], ["폐기", split.scrap]] as const) await page.getByLabel(`${child.item_name} ${label} 수량`, { exact: true }).filter({ visible: true }).fill(String(value));
  }
  await expect(page.getByText("합계가 총 수량과 같아야 합니다.", { exact: true }).filter({ visible: true })).toHaveCount(0);
  await submit.click();
  const dialog = page.getByRole("dialog", { name: "즉시 재작업 확인", exact: true });
  await expect(dialog.getByTestId("defect-confirm-line")).toContainText(parts[1].item_name);
  await expect(dialog.getByTestId("defect-confirm-line")).toContainText("수량 1");
  await expect(dialog.getByTestId("defect-confirm-line")).toContainText("조립");
  await expect(dialog.getByTestId("defect-confirm-child")).toHaveCount(3);
  for (const [index, child] of children.entries()) {
    const line = dialog.getByTestId("defect-confirm-child").filter({ hasText: child.item_name });
    await expect(line).toContainText(child.mes_code);
    await expect(line).toContainText(`정상 ${allocations[index].normal} · 격리 ${allocations[index].defective} · 폐기 ${allocations[index].scrap}`);
  }
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  for (const [index, child] of children.entries()) await expect(page.getByLabel(`${child.item_name} 정상 수량`, { exact: true }).filter({ visible: true })).toHaveValue(String(allocations[index].normal));
  expect(await Promise.all(parts.map(part => read(request, `/api/items/${part.item_id}`)))).toEqual(before);
  await submit.click();
  const submitted = page.waitForResponse(reply => reply.request().method() === "POST" && reply.url().endsWith("/api/stock-requests"));
  await dialog.getByRole("button", { name: "즉시 재작업", exact: true }).click();
  const reply = await submitted;
  expect(reply.status(), await reply.text()).toBe(201);
  const payload = reply.request().postDataJSON();
  expect(payload.request_type).toBe("rework_normal");
  expect(payload.lines).toHaveLength(1);
  expect(payload.lines[0]).toMatchObject({ item_id: parts[1].item_id, quantity: 1, from_bucket: "production", from_department: "조립" });
  const decisions = JSON.parse(payload.notes).child_decisions;
  expect(decisions).toHaveLength(3);
  for (const [index, child] of children.entries()) expect(decisions.find((decision: { item_id: string }) => decision.item_id === child.item_id)).toMatchObject({ normal_qty: allocations[index].normal, defective_qty: allocations[index].defective, scrap_qty: allocations[index].scrap });
  const result = await reply.json();
  expect(result.status).toBe("completed");
  expect(result.requires_warehouse_approval).toBe(false);
  expect(result.requires_department_approval).toBe(false);
  const after = await Promise.all(parts.map(part => read(request, `/api/items/${part.item_id}`)));
  expect(after[0]).toEqual(before[0]);
  expect(after[1].warehouse_qty).toBe(5);
  expect(after[1].production_total).toBe(2);
  for (const [index, child] of children.entries()) {
    const current = after[index + 2];
    const department = ["조립", "튜브", "고압"][index];
    expect(current.warehouse_qty).toBe(before[index + 2].warehouse_qty);
    expect(Number(current.locations.find((cell: { department: string; status: string }) => cell.department === department && cell.status === "PRODUCTION")?.quantity ?? 0)).toBe(allocations[index].normal);
    expect(Number(current.locations.find((cell: { department: string; status: string }) => cell.department === department && cell.status === "DEFECTIVE")?.quantity ?? 0)).toBe(allocations[index].defective);
  }
  const logs = (await Promise.all(parts.map(part => read(request, `/api/inventory/transactions?item_id=${part.item_id}&limit=1000`)))).flat().filter(log => log.reason_memo === memo);
  expect(logs).toHaveLength(7);
  expect(new Set(logs.map(log => log.operation_id)).size).toBe(1);
  expect(logs.every(log => log.operation_id != null)).toBe(true);
  expect(logs.filter(log => log.operation_role === "REWORK_PARENT_NORMAL")).toHaveLength(1);
  expect(logs.filter(log => log.operation_role === "REWORK_CHILD_NORMAL")).toHaveLength(2);
  expect(logs.filter(log => log.operation_role === "REWORK_CHILD_DEFECTIVE")).toHaveLength(2);
  expect(logs.filter(log => log.operation_role === "REWORK_CHILD_SCRAP")).toHaveLength(2);
  await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
  await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(memo);
  const history = page.locator('[data-history-main-row="true"]').filter({ hasText: "재작업", visible: true });
  await expect(history).toHaveCount(1);
  const expand = history.getByRole("button", { name: /^작업 구성 (펼치기|접기)$/ });
  if (await expand.getAttribute("aria-expanded") !== "true") await expand.click();
  for (const log of logs) {
    let line = log.operation_role === "REWORK_PARENT_NORMAL" ? history : page.locator("tr").filter({ hasText: log.item_name, visible: true });
    if (log.operation_role === "REWORK_CHILD_NORMAL") line = line.filter({ has: page.getByLabel(new RegExp(`재고 변동:.*(?:조립|고압) 0 \\+${Number(log.quantity_change)}→${Number(log.quantity_change)}`)) });
    if (log.operation_role === "REWORK_CHILD_DEFECTIVE") line = line.filter({ has: page.getByLabel(/재고 변동:.*불량 0 \+1→1/) });
    if (log.operation_role === "REWORK_CHILD_SCRAP") line = line.filter({ hasText: "폐기" });
    await expect(line).toHaveCount(1);
    await expect(line).toContainText(log.item_name);
    await expect(line).toContainText(log.mes_code);
    if (log.operation_role === "REWORK_PARENT_NORMAL") await expect(line.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /조립 3 [−-]1→2/);
    if (log.operation_role === "REWORK_CHILD_NORMAL") await expect(line.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`0 \\+${Number(log.quantity_change)}→${Number(log.quantity_change)}`));
    if (log.operation_role === "REWORK_CHILD_DEFECTIVE") await expect(line.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", /불량 0 \+1→1/);
    if (log.operation_role === "REWORK_CHILD_SCRAP") await expect(line).toContainText(`폐기 ${Math.abs(Number(log.quantity_change))} EA`);
  }
  await history.click();
  const detail = page.getByTestId("history-key-point-summary").filter({ visible: true });
  await expect(detail.getByText("창고 재고 변동 없음", { exact: true })).toBeVisible();
  const flow = detail.getByTestId("history-stock-movement-summary").locator(":scope > div").first();
  await expect(flow.getByText("조립 재고", { exact: true })).toBeVisible();
  await expect(flow.getByText("불량 재고", { exact: true })).toHaveCount(0);
  const groups = detail.getByRole("button", { name: /재고 ·/ });
  await expect(groups).toHaveCount(3);
  for (const group of await groups.all()) if (await group.getAttribute("aria-expanded") !== "true") await group.click();
  await expect(detail.getByLabel("조립 재고 3 -1→2 EA", { exact: true })).toBeVisible();
  await expect(detail.getByLabel("조립 재고 0 +1→1 EA", { exact: true })).toBeVisible();
  await expect(detail.getByLabel("고압 재고 0 +3→3 EA", { exact: true })).toBeVisible();
  await expect(detail.getByLabel("불량 재고 0 +1→1 EA", { exact: true })).toHaveCount(2);
  await expect(page.getByText("불량 사유", { exact: true }).locator("..")).toContainText("외관 불량");
  await expect(page.getByText("메모", { exact: true }).filter({ visible: true }).locator("..").filter({ has: page.getByText(memo, { exact: true }) })).toContainText(memo);
});
