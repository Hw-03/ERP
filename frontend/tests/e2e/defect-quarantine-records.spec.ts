import { spawnSync } from "child_process";
import * as path from "path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { loginAsOperator, readSeed } from "./_helpers";

const BACKEND_DIR = path.resolve(__dirname, "..", "..", "..", "backend");
const E2E_DATABASE_URL = `sqlite:///${path.join(BACKEND_DIR, "mes_e2e.db").split(path.sep).join("/")}`;

async function postJson(request: APIRequestContext, url: string, body: unknown) {
  const response = await request.post(url, { data: body });
  if (!response.ok()) {
    throw new Error(`POST ${url} → ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

async function openList(page: Page) {
  const listHeading = page.getByRole("heading", { name: "격리 목록" }).filter({ visible: true });
  const defectState = await page.evaluate(() => history.state?.defect ?? null);
  if (defectState === "list") {
    await expect(listHeading).toBeVisible();
    return;
  }
  await page
    .getByRole("button")
    .filter({ hasText: "격리 목록", visible: true })
    .filter({ hasText: "격리 항목" })
    .click();
  await expect(listHeading).toBeVisible();
}

async function expandItemRecords(page: Page, itemName: string) {
  const summary = page
    .getByTestId("defect-item-group-summary")
    .filter({ hasText: itemName });
  await expect(summary).toHaveCount(1);
  if (await summary.getAttribute("aria-expanded") !== "true") {
    await summary.click();
  }
}

function setDistinctQuarantineTimes(firstRecordId: string, secondRecordId: string) {
  const script = [
    "import os",
    "from datetime import datetime",
    "from app.database import SessionLocal",
    "from app.models import DefectQuarantineRecord",
    "db = SessionLocal()",
    "try:",
    "    first = db.query(DefectQuarantineRecord).filter(DefectQuarantineRecord.record_id == os.environ['FIRST_RECORD_ID']).one()",
    "    second = db.query(DefectQuarantineRecord).filter(DefectQuarantineRecord.record_id == os.environ['SECOND_RECORD_ID']).one()",
    "    first.quarantined_at = datetime(2026, 7, 1, 0, 0)",
    "    second.quarantined_at = datetime(2026, 7, 2, 1, 30)",
    "    db.commit()",
    "finally:",
    "    db.close()",
  ].join("\n");
  const result = spawnSync("python", ["-c", script], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      FIRST_RECORD_ID: firstRecordId,
      SECOND_RECORD_ID: secondRecordId,
    },
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`격리 시각 설정 실패\n${result.stdout}\n${result.stderr}`);
  }
}

async function cleanupItemRecords(
  request: APIRequestContext,
  itemId: string,
  department: string,
  actorEmployeeId: string,
) {
  const response = await request.get(`/api/defects/locations?department=${encodeURIComponent(department)}`);
  if (!response.ok()) return;
  const records: Array<Record<string, unknown>> = await response.json();
  for (const record of records.filter((entry) => entry.item_id === itemId)) {
    const available = Number(record.available_quantity ?? 0);
    if (available <= 0) continue;
    await request.post("/api/defects/unquarantine", {
      data: {
        record_id: record.record_id,
        item_id: itemId,
        qty: available,
        dept: department,
        actor_employee_id: actorEmployeeId,
      },
    });
  }
}

test.describe("불량 격리 건별 원장", () => {
  test.afterEach(async ({ request }) => {
    const seed = readSeed();
    await cleanupItemRecords(
      request,
      seed.rawItem.item_id,
      seed.departmentEmployee.department,
      seed.departmentEmployee.employee_id,
    );
  });

  test("같은 품목의 독립 행·부분 처리·메모 이력·승인 예약 생명주기", async ({ page }) => {
    test.setTimeout(120_000);
    const seed = readSeed();
    const operator = await loginAsOperator(page, { role: "department" });
    const item = seed.rawItem;
    const department = operator.department;

    await postJson(page.request, "/api/defects/quarantine", {
      item_id: item.item_id,
      qty: 5,
      source: "warehouse",
      target_dept: department,
      reason_category: "외관 불량",
      reason_memo: "첫 격리 메모",
      actor_employee_id: operator.employee_id,
    });
    await postJson(page.request, "/api/defects/quarantine", {
      item_id: item.item_id,
      qty: 4,
      source: "warehouse",
      target_dept: department,
      reason_category: "기능 불량",
      reason_memo: "둘째 격리 메모",
      actor_employee_id: seed.plainEmployee.employee_id,
    });

    const listResponse = await page.request.get(
      `/api/defects/locations?department=${encodeURIComponent(department)}`,
    );
    expect(listResponse.ok()).toBeTruthy();
    const records: any[] = await listResponse.json();
    const firstRecord = records.find(
      (record) => record.item_id === item.item_id && record.reason_memo === "첫 격리 메모",
    );
    const secondRecord = records.find(
      (record) => record.item_id === item.item_id && record.reason_memo === "둘째 격리 메모",
    );
    expect(firstRecord).toBeTruthy();
    expect(secondRecord).toBeTruthy();
    setDistinctQuarantineTimes(firstRecord.record_id, secondRecord.record_id);

    const recordState = async (recordId: string) => {
      const response = await page.request.get(
        `/api/defects/locations?department=${encodeURIComponent(department)}`,
      );
      expect(response.ok()).toBeTruthy();
      const currentRecords: any[] = await response.json();
      const record = currentRecords.find((entry) => entry.record_id === recordId);
      expect(record).toBeTruthy();
      return record;
    };

    await page.goto("/mes?tab=defect");
    await expect(page.getByRole("button").filter({ hasText: "격리 목록", visible: true })).toBeVisible({ timeout: 30_000 });
    await openList(page);
    await expandItemRecords(page, item.item_name);

    const visibleRows = page
      .getByRole("article", { name: `${item.item_name} 격리 기록` })
      .filter({ visible: true });
    await expect(visibleRows).toHaveCount(2);
    const firstRow = visibleRows.filter({ hasText: "첫 격리 메모" });
    const secondRow = visibleRows.filter({ hasText: "둘째 격리 메모" });
    await expect(firstRow).toContainText("2026-07-01 09:00");
    await expect(firstRow).toContainText(operator.name);
    await expect(secondRow).toContainText("2026-07-02 10:30");
    await expect(secondRow).toContainText(seed.plainEmployee.name);
    await expect(firstRow.getByText("5개", { exact: true })).toBeVisible();
    await expect(secondRow.getByText("4개", { exact: true })).toBeVisible();

    await firstRow.getByRole("button", { name: "처리", exact: true }).click();
    await page.getByRole("spinbutton").fill("2");
    await page.getByRole("button", { name: "정상 복귀 →" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "즉시 복귀", exact: true }).click();
    await expect(page.getByRole("button").filter({ hasText: "격리 목록", visible: true })).toBeVisible();
    await openList(page);
    await expandItemRecords(page, item.item_name);

    const rowsAfterPartial = page
      .getByRole("article", { name: `${item.item_name} 격리 기록` })
      .filter({ visible: true });
    await expect(rowsAfterPartial).toHaveCount(2);
    await expect(rowsAfterPartial.filter({ hasText: "첫 격리 메모" }).getByText("3개", { exact: true })).toBeVisible();
    await expect(rowsAfterPartial.filter({ hasText: "둘째 격리 메모" }).getByText("4개", { exact: true })).toBeVisible();

    const editableRow = rowsAfterPartial.filter({ hasText: "2026-07-02 10:30" });
    await editableRow.getByRole("button", { name: "메모 수정" }).click();
    await editableRow.getByRole("textbox", { name: "격리 메모" }).fill(
      "수정된 긴 메모 — 보관 중 가장 하단에 깔린 제품이라 외관 손상이 확인됨",
    );
    await editableRow.getByRole("textbox", { name: "직원 PIN" }).fill("0000");
    await editableRow.getByRole("button", { name: "저장", exact: true }).click();
    await expect(editableRow).toContainText("수정된 긴 메모");

    await page.reload();
    await openList(page);
    await expandItemRecords(page, item.item_name);
    const refreshedSecondRow = page
      .getByRole("article", { name: `${item.item_name} 격리 기록` })
      .filter({ visible: true })
      .filter({ hasText: "수정된 긴 메모" });
    await expect(refreshedSecondRow).toBeVisible();
    await refreshedSecondRow.getByRole("button", { name: "메모 이력 보기" }).click();
    await expect(refreshedSecondRow).toContainText("변경 전: 둘째 격리 메모");
    await expect(refreshedSecondRow).toContainText("변경 후: 수정된 긴 메모");

    const createReservedRequest = () => postJson(page.request, "/api/stock-requests", {
      requester_employee_id: seed.plainEmployee.employee_id,
      request_type: "defect_scrap",
      reason_category: "외관 불량",
      reason_memo: "승인 예약 검증",
      lines: [{
        record_id: firstRecord.record_id,
        item_id: item.item_id,
        quantity: 1,
        from_bucket: "defective",
        from_department: department,
        to_bucket: "none",
      }],
    });

    const cancelledRequest = await createReservedRequest();
    expect(cancelledRequest.status).toBe("reserved");
    await page.reload();
    await openList(page);
    await expandItemRecords(page, item.item_name);
    let reservedRow = page
      .getByRole("article", { name: `${item.item_name} 격리 기록` })
      .filter({ visible: true })
      .filter({ hasText: "첫 격리 메모" });
    await expect(reservedRow).toContainText("승인 대기 1개");
    let firstRecordState = await recordState(firstRecord.record_id);
    expect(Number(firstRecordState.quantity)).toBe(3);
    expect(Number(firstRecordState.pending_quantity)).toBe(1);
    expect(Number(firstRecordState.available_quantity)).toBe(2);

    const cancelled = await postJson(
      page.request,
      `/api/stock-requests/${cancelledRequest.request_id}/cancel`,
      { actor_employee_id: seed.plainEmployee.employee_id, pin: "0000" },
    );
    expect(cancelled.status).toBe("cancelled");
    await page.reload();
    await openList(page);
    await expandItemRecords(page, item.item_name);
    reservedRow = page
      .getByRole("article", { name: `${item.item_name} 격리 기록` })
      .filter({ visible: true })
      .filter({ hasText: "첫 격리 메모" });
    await expect(reservedRow).not.toContainText("승인 대기");
    firstRecordState = await recordState(firstRecord.record_id);
    expect(Number(firstRecordState.quantity)).toBe(3);
    expect(Number(firstRecordState.pending_quantity)).toBe(0);
    expect(Number(firstRecordState.available_quantity)).toBe(3);

    const approvedRequest = await createReservedRequest();
    const approved = await postJson(
      page.request,
      `/api/stock-requests/${approvedRequest.request_id}/department-approve`,
      { actor_employee_id: operator.employee_id, pin: "0000" },
    );
    expect(approved.status).toBe("completed");
    firstRecordState = await recordState(firstRecord.record_id);
    expect(Number(firstRecordState.quantity)).toBe(2);
    expect(Number(firstRecordState.pending_quantity)).toBe(0);
    expect(Number(firstRecordState.available_quantity)).toBe(2);
    await page.reload();
    await openList(page);
    await expandItemRecords(page, item.item_name);
    const completedRow = page
      .getByRole("article", { name: `${item.item_name} 격리 기록` })
      .filter({ visible: true })
      .filter({ hasText: "첫 격리 메모" });
    await expect(completedRow.getByText("2개", { exact: true })).toBeVisible();
    firstRecordState = await recordState(firstRecord.record_id);
    expect(Number(firstRecordState.quantity)).toBe(2);
    expect(Number(firstRecordState.pending_quantity)).toBe(0);
    expect(Number(firstRecordState.available_quantity)).toBe(2);
  });
});
