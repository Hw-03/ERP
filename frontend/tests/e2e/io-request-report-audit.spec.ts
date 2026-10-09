import { randomUUID } from "crypto";
import type { APIRequestContext } from "@playwright/test";
import type { Item, TransactionLog } from "../../lib/api";
import type { DailyWorkActivity } from "../../lib/api/types/daily-work-reports";
import { test, expect, loginUi, changeEmployee } from "./_common-expectations";

async function read<T>(request: APIRequestContext, url: string): Promise<T> {
  const response = await request.get(url);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
const today = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

test.use({ trace: "retain-on-failure" });

for (const scenario of [{ process: "TR", department: "튜브", other: "고압" }, { process: "HR", department: "고압", other: "튜브" }]) {
  test(`8.2-08/8.24-06 실제 ${scenario.department} 입고의 내요청 완료·승인자와 같은거래 일보·내역의 수량·메모를 대조한다`, async ({ page, request, actors }) => {
    const suffix = randomUUID().slice(0, 8);
    const memo = `부서일보연계 메모 ${suffix}`;
    const created = await request.post("/api/items", { headers: { "X-Admin-Pin": "0000" }, data: {
      item_name: `부서일보품${suffix}`, process_type_code: scenario.process, model_slots: [1], unit: "EA", initial_quantity: 34,
      initial_locations: [{ department: scenario.department, quantity: 7 }, { department: scenario.other, quantity: 7 }],
    } });
    expect(created.status(), await created.text()).toBe(201);
    const item = await created.json() as Item;
    const requester = await changeEmployee(request, actors.requester, { warehouse_role: "none", department_role: "none" });
    const approver = await changeEmployee(request, actors.approver, { department: scenario.department, department_role: "primary", warehouse_role: "none" });
    const before = await read<Item>(request, `/api/items/${item.item_id}`);
    const preview = await request.post("/api/io/preview", { data: {
      requester_employee_id: requester.employee_id, work_type: "process", sub_type: "adjust_in",
      targets: [{ item_id: item.item_id, source_kind: "manual", quantity: 1 }],
    } });
    expect(preview.status(), await preview.text()).toBe(200);
    const submitted = await request.post("/api/io/submit", { data: {
      requester_employee_id: requester.employee_id, work_type: "process", sub_type: "adjust_in", notes: memo,
      bundles: (await preview.json()).bundles,
    } });
    expect(submitted.status(), await submitted.text()).toBe(201);
    const result = await submitted.json() as { stock_request_id: string; batch: { batch_id: string }; requires_approval: boolean };
    expect(result.requires_approval).toBe(true);
    expect(result.stock_request_id).toBeTruthy();
    try {
      expect(await read<Item>(request, `/api/items/${item.item_id}`)).toEqual(before);
      await loginUi(page, requester);
      await page.goto("/mes?tab=warehouse&section=mine");
      const mine = page.locator(`[data-stock-request-id="${result.stock_request_id}"]`).filter({ visible: true });
      await expect(mine).toContainText("대기");
      await expect(mine).toContainText(item.item_name);
      await expect(mine).toContainText(item.mes_code!);
      await expect(mine).toContainText(scenario.department);
      await expect(mine.getByText(`${scenario.department} 입고`, { exact: true })).toBeVisible();
      await expect(mine.getByText("+1개", { exact: true })).toBeVisible();
      await expect(mine).toContainText(memo);
      const approved = await request.post(`/api/stock-requests/${result.stock_request_id}/department-approve`, { data: { actor_employee_id: approver.employee_id, pin: "0000" } });
      expect(approved.status(), await approved.text()).toBe(200);
      await expect(mine.getByTestId("my-request-heading")).toContainText("완료");
      await expect(mine.getByTestId("my-request-approvals")).toContainText(`부서 승인·승인·${approver.name}`);
      await expect(mine).toContainText(memo);
      const after = await read<Item>(request, `/api/items/${item.item_id}`);
      expect(after.warehouse_qty).toBe(before.warehouse_qty);
      expect(Number(after.locations?.find((cell) => cell.department === scenario.department && cell.status === "PRODUCTION")?.quantity)).toBe(8);
      expect(Number(after.locations?.find((cell) => cell.department === scenario.other && cell.status === "PRODUCTION")?.quantity)).toBe(7);
      const logs = await read<TransactionLog[]>(request, `/api/inventory/transactions?item_id=${item.item_id}&limit=1000`);
      const log = logs.find((row) => row.operation_batch_id === result.batch.batch_id)!;
      expect(log).toBeTruthy();
      expect(log).toMatchObject({ requester_name: requester.name, approver_name: approver.name, notes: memo });
      expect(log.inventory_effect).toHaveLength(1);
      expect(log.inventory_effect![0]).toMatchObject({ scope: "location", department: scenario.department, status: "PRODUCTION", quantity_before: 7, quantity_after: 8 });
      await page.getByRole("navigation").getByRole("button", { name: "입출고 내역 입출고 이력 조회", exact: true }).click();
      await page.getByPlaceholder("작업 · 품명 · 코드 · 담당자 · 메모").fill(memo);
      const row = page.locator(`[data-log-id="${log.log_id}"]`).filter({ visible: true }).first();
      await expect(row).toContainText("부서 입출고");
      await expect(row.getByLabel(/재고 변동:/)).toHaveAttribute("aria-label", new RegExp(`${scenario.department} 7 \\+1→8`));
      await row.click();
      const detail = page.locator(`[data-history-detail-log-id="${log.log_id}"]`).filter({ visible: true });
      await expect(detail.getByTestId("history-participant-row").filter({ hasText: "요청자" })).toContainText(requester.name);
      await expect(detail.getByTestId("history-participant-row").filter({ hasText: "승인자" })).toContainText(approver.name);
      await expect(detail.getByText("메모", { exact: true }).locator("..")).toContainText(memo);
      const activity = await read<DailyWorkActivity>(request, `/api/daily-work-reports/${requester.employee_id}/${today()}/activity`);
      const reportLog = activity.details.flatMap((group) => group.logs).find((entry) => entry.log_id === log.log_id);
      expect(reportLog).toMatchObject({ log_id: log.log_id, requester_name: requester.name, approver_name: approver.name, notes: memo });
      expect(reportLog?.inventory_effect).toEqual(log.inventory_effect);
      await page.goto("/mes?tab=dailyReport");
      await expect(page.getByRole("textbox", { name: "작업 내역", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "공정 거래 상세 펼치기", exact: true }).click();
      const card = page.getByTestId("daily-work-activity-card").filter({ hasText: item.item_name, visible: true });
      await expect(card).toContainText("부서 입출고");
      await expect(card).not.toContainText("수량 조정");
      await expect(card.getByTestId("daily-work-activity-status")).toHaveText("완료");
      await expect(card.getByTestId("daily-work-activity-meta")).toContainText(requester.name);
      await expect(card.getByTestId("daily-work-activity-meta")).toContainText(approver.name);
      await expect(card).toContainText(memo);
      await expect(card.getByTestId("daily-work-activity-stock-flow")).toContainText(scenario.department);
      await expect(card.getByTestId("daily-work-activity-stock-flow")).toContainText("7 EA → 8 EA");
      await expect(card.getByTestId("daily-work-activity-stock-flow")).not.toContainText(scenario.other);
      await expect(card.getByTestId("daily-work-activity-stock-flow")).not.toContainText(/14.*15/);
    } finally {
      const current = await read<{ status: string }>(request, `/api/stock-requests/${result.stock_request_id}`);
      if (["submitted", "reserved"].includes(current.status)) {
        const cancelled = await request.post(`/api/stock-requests/${result.stock_request_id}/cancel`, { data: { actor_employee_id: requester.employee_id, pin: "0000" } });
        expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
      }
    }
  });
}
