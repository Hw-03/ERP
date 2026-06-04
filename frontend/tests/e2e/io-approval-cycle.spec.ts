/**
 * P2-1 / 결재 풀사이클(2-세션): 제출 → 승인함 → PIN 승인 → 큐 소멸.
 *
 * 라이브 정책(2026-06-04 확인):
 *  - 창고 정/부가 창고-결재 요청을 제출하면 **자가승인되어 즉시 반영**(큐 미적재).
 *    → 풀사이클 검증은 제출자=일반직원(E01), 승인자=창고 정(E22) 으로 분리해야 한다.
 *  - 승인은 "승인" → 승인 PIN(기본 0000) → "승인 확정" 2단계.
 *  - 창고 승인함에는 E01 의 warehouse_to_dept 요청만 적재됨(다른 spec 은 E22 자가승인) → 큐 소멸 검증 안전.
 */
import { expect, test } from "@playwright/test";
import { gotoWarehouseCompose, loginAsOperator, pickWorkType } from "./_helpers";

test.describe("결재 풀사이클 — 창고 승인", () => {
  test("E01 제출(창고→부서) → E22 창고 승인함 PIN 승인 → 큐 소멸", async ({ browser }) => {
    // ── context A: 일반직원 E01 이 창고→부서 결재 요청 제출(큐 적재) ──
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    await loginAsOperator(a, { code: "E01" });
    await gotoWarehouseCompose(a);
    await pickWorkType(a, /창고 입출고/);
    await a.getByRole("button", { name: /창고 → 부서/ }).first().click();
    await a.getByRole("button", { name: "조립", exact: true }).click();
    await a.getByRole("button", { name: /다음 단계로/ }).click();
    await a
      .getByRole("row", { name: /E2E원자재튜브/ })
      .getByRole("button", { name: "낱개", exact: true })
      .click();
    await a.getByRole("button", { name: /제출확인/ }).click();
    await a.getByRole("button", { name: /창고 결재 요청/ }).click();
    await a.getByRole("button", { name: "결재 요청", exact: true }).click();
    await expect(a.getByRole("dialog", { name: /창고 결재 요청 완료/ })).toBeVisible();
    await ctxA.close();

    // ── context B: 창고 정 E22 가 창고 승인함에서 PIN 승인 ──
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await loginAsOperator(b, { code: "E22" });
    await b.goto("/legacy?tab=warehouse");
    await b.getByRole("tab", { name: /창고 승인함/ }).click();

    // 대기 요청(창고 → 부서 · 김민재) 등장
    await expect(b.getByText("창고 → 부서")).toBeVisible();
    await expect(b.getByText(/김민재/)).toBeVisible();

    // 승인 → PIN 0000 → 승인 확정
    await b.getByRole("button", { name: "승인", exact: true }).click();
    await b.getByRole("textbox", { name: "0000" }).fill("0000");
    await b.getByRole("button", { name: "승인 확정" }).click();

    // 승인 반영 → 창고 승인함 비워짐
    await expect(b.getByText("승인 대기 중인 요청이 없습니다.")).toBeVisible();
    await ctxB.close();
  });
});
