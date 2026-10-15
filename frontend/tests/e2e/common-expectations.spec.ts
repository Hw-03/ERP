import { test, expect, changeEmployee, chooseEmployee, identity, loginUi, logoutUi, notes, openNotifications, seedNotes, submitWarehouseRequest } from "./_common-expectations";
import { advanceToQuantityStep, clickNextStep, readSeed } from "./_helpers";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import type { Employee } from "../../lib/api/types/employees";

async function sidebar(page: Page, label: string) {
  await page.getByRole("complementary").getByRole("button").filter({ has: page.getByText(label, { exact: true }) }).click();
}
async function warehouseDraft(page: Page, navigation: "document" | "sidebar" = "document") {
  if (navigation === "sidebar") await sidebar(page, "입출고");
  else await page.goto("/mes?tab=warehouse");
  await page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).first().click();
  await clickNextStep(page);
  await page.getByRole("row", { name: new RegExp(readSeed().rawItem.item_name) }).getByRole("button", { name: "낱개", exact: true }).click();
  await advanceToQuantityStep(page);
  return page.getByRole("spinbutton").filter({ visible: true }).first();
}
async function shippingDraft(page: Page) {
  await page.goto("/mes?tab=shipping");
  await page.getByRole("button").filter({ hasText: "출하 관리", visible: true }).first().click();
  await page.getByRole("button", { name: "새 출하 요청 만들기", exact: true }).click();
  const input = page.getByRole("textbox", { name: "인보이스 번호", exact: true });
  await input.fill("QA-초안-13");
  await expect(page).toHaveURL(/shippingView=requestWork.*shippingStep=1/);
  return input;
}
async function settings(page: Page) {
  await page.goto("/mes?tab=settings");
  await expect(page.getByRole("button", { name: "라이트 테마", exact: true })).toBeVisible();
}
async function focusFrom(page: Page, other: Page) {
  await other.bringToFront();
  await page.bringToFront();
  // Headless Chromium does not emit native tab visibility events reliably.
  // Drive the browser event only; production handlers still fetch the real server.
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
}
async function expectEmployee(page: Page, employee: Employee) {
  await expect(page.getByRole("button", { name: new RegExp(employee.name) }).filter({ visible: true }).first()).toBeVisible();
  expect((await identity(page)).operator.employee_id).toBe(employee.employee_id);
}

test("AUTH01 실제 PIN 오류·로그인·저장·새로고침", async ({ page, actors }) => {
  await page.goto("/mes?tab=dashboard");
  await chooseEmployee(page, actors.requester);
  await page.getByLabel("PIN 번호", { exact: true }).fill("1111");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("PIN 번호가 올바르지 않습니다.");
  expect((await identity(page)).operator).toBeNull();
  await page.getByLabel("PIN 번호", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expectEmployee(page, actors.requester);
  const saved = await identity(page);
  expect(saved.operator.employee_id).toBe(actors.requester.employee_id);
  expect(saved.audit).toBeTruthy();
  await page.reload();
  await expectEmployee(page, actors.requester);
  expect((await identity(page)).audit).toBe(saved.audit);
});

test("AUTH01 선택 뒤 실제 비활성은 PIN 오류와 구분", async ({ page, request, actors }) => {
  await page.goto("/mes?tab=dashboard");
  await chooseEmployee(page, actors.requester);
  await changeEmployee(request, actors.requester, { is_active: false });
  await page.getByLabel("PIN 번호", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("비활성 직원");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).not.toContainText("PIN 번호가 올바르지 않습니다.");
  expect((await identity(page)).operator).toBeNull();
});

test("AUTH01 없는 직원·횟수제한 UI는 주입 응답을 별도로 표시", async ({ page, actors }) => {
  let status = 404;
  await page.route(`**/api/employees/${actors.requester.employee_id}/verify-pin`, (route) => route.fulfill({ status, json: { detail: status === 404 ? "직원을 찾을 수 없습니다." : "PIN 시도가 너무 많습니다." } }));
  await page.goto("/mes?tab=dashboard");
  await chooseEmployee(page, actors.requester);
  await page.getByLabel("PIN 번호", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("직원을 찾을 수 없습니다.");
  status = 429;
  await page.getByLabel("PIN 번호", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("로그인 시도가 너무 많습니다.");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).not.toContainText("PIN 번호가 올바르지 않습니다.");
  expect((await identity(page)).operator).toBeNull();
});

test("AUTH02 SESSION01 취소·현재탭 로그아웃·다른 실제탭 유지", async ({ page, context, actors }) => {
  await loginUi(page, actors.requester);
  const second = await context.newPage();
  await loginUi(second, actors.requester);
  const firstBefore = await identity(page);
  const otherBefore = await identity(second);
  await page.bringToFront();
  await logoutUi(page, actors.requester, false);
  expect(await identity(page)).toEqual(firstBefore);
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
  await logoutUi(page, actors.requester);
  expect(await identity(page)).toEqual({ operator: null, audit: null });
  await second.bringToFront();
  await expectEmployee(second, actors.requester);
  expect(await identity(second)).toEqual(otherBefore);
  await loginUi(page, actors.other);
  await expectEmployee(page, actors.other);
  await expect(page.getByRole("button", { name: new RegExp(actors.other.name) }).filter({ visible: true }).first()).toBeVisible();
});

test("AUTH03 PIN 검증·성공 뒤 이전PIN 거부와 새PIN UI 로그인", async ({ page, actors }) => {
  await loginUi(page, actors.requester);
  await settings(page);
  await page.getByRole("button", { name: "PIN 재설정", exact: true }).click();
  const save = page.getByRole("button", { name: "PIN 변경 저장", exact: true });
  await page.getByLabel("현재 PIN", { exact: true }).fill("0000");
  await page.getByLabel("새 PIN", { exact: true }).fill("1234");
  await page.getByLabel("새 PIN 확인", { exact: true }).fill("5678");
  await save.click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("일치하지 않습니다");
  await page.getByLabel("새 PIN", { exact: true }).fill("0000");
  await page.getByLabel("새 PIN 확인", { exact: true }).fill("0000");
  await save.click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("현재 PIN과 달라야 합니다");
  await page.getByLabel("현재 PIN", { exact: true }).fill("1111");
  await page.getByLabel("새 PIN", { exact: true }).fill("1234");
  await page.getByLabel("새 PIN 확인", { exact: true }).fill("1234");
  await save.click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("현재 PIN이 올바르지 않습니다");
  await page.getByLabel("현재 PIN", { exact: true }).fill("0000");
  await save.click();
  await expect(page.getByText("PIN이 변경되었습니다.", { exact: true })).toBeVisible();
  await logoutUi(page, actors.requester);
  await chooseEmployee(page, actors.requester);
  await page.getByLabel("PIN 번호", { exact: true }).fill("0000");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("PIN 번호가 올바르지 않습니다.");
  await page.getByLabel("PIN 번호", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expectEmployee(page, actors.requester);
  await expect(page.getByRole("button", { name: new RegExp(actors.requester.name) }).filter({ visible: true }).first()).toBeVisible();
});

test("ADMINSESSION01 UI 해제 뒤 reload·새탭은 PIN잠금 유지", async ({ page, context, actors }) => {
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=admin");
  const zero = page.getByRole("button", { name: "0", exact: true }).filter({ visible: true });
  for (let i = 0; i < 4; i++) await zero.click();
  await expect(page.getByRole("navigation", { name: "관리자 섹션" })).toBeVisible();
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(storage)).not.toContain("admin_pin");
  await page.reload();
  await expect(zero).toBeVisible();
  await expect(page.getByRole("navigation", { name: "관리자 섹션" })).toHaveCount(0);
  const second = await context.newPage();
  await loginUi(second, actors.requester);
  await second.goto("/mes?tab=admin");
  await expect(second.getByRole("button", { name: "0", exact: true }).filter({ visible: true })).toBeVisible();
  await expect(second.getByRole("navigation", { name: "관리자 섹션" })).toHaveCount(0);
});

test("SHELL01 숨김 탭 URL·Back·알림 링크는 접근을 우회하지 않음", async ({ page, request, actors }) => {
  await changeEmployee(request, actors.requester, { hidden_sidebar_tabs: ["shipping", "warehouseMap"] });
  seedNotes(actors.requester, [{ title: "숨김 업무 링크", target_tab: "shipping" }]);
  await loginUi(page, actors.requester);
  const before = await identity(page);
  await expect(page.getByRole("button", { name: "출하", exact: true }).filter({ visible: true })).toHaveCount(0);
  await page.goto("/mes?tab=shipping");
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tab=dashboard/);
  await page.goto("/mes?tab=history");
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
  const dialog = await openNotifications(page);
  await dialog.getByRole("button", { name: /숨김 업무 링크/ }).click();
  await expect(page).toHaveURL(/tab=dashboard/);
  expect(await identity(page)).toEqual(before);
});

async function exerciseDraft(page: Page, employee: Employee, work: "warehouse" | "shipping") {
    await loginUi(page, employee);
    const input = work === "warehouse" ? await warehouseDraft(page) : await shippingDraft(page);
    if (work === "warehouse") await input.fill("13");
    const value = await input.inputValue();
    const url = page.url();
    await sidebar(page, work === "warehouse" ? "입출고" : "출하");
    await expect(input).toHaveValue(value);
    const sameMenuValue = await input.inputValue();
    const keep = page.getByRole("button", { name: work === "shipping" ? "계속 머무르기" : "계속 작성", exact: true });
    await expect(keep).toBeVisible();
    await keep.click();
    await sidebar(page, "대시보드");
    await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
    const menuGuardVisible = await page.getByText("이 화면에서 나갈까요?", { exact: true }).isVisible();
    await keep.click();
    await expect(input).toHaveValue(value);
    await expect(page).toHaveURL(url);
    const keptMenuValue = await input.inputValue();
    const keptMenuUrl = page.url();
    await page.goBack();
    let backGuardVisible: boolean | null = null;
    if (work === "warehouse") {
      // Back within the same IO wizard changes a step without discarding the draft.
      await expect(page).not.toHaveURL(url);
      await expect(page).toHaveURL(/tab=warehouse/);
      await page.goForward();
      await expect(page).toHaveURL(url);
    } else {
      await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
      backGuardVisible = await page.getByText("이 화면에서 나갈까요?", { exact: true }).isVisible();
      await keep.click();
    }
    await expect(input).toHaveValue(value);
    const keptBackValue = await input.inputValue();
    await sidebar(page, "대시보드");
    await page.getByRole("button", { name: work === "shipping" ? "나가기" : "저장 안 하고 나가기", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
    return { value, sameMenuValue, menuGuardVisible, keptMenuValue, keptMenuUrl, url, backGuardVisible, keptBackValue, discardedToDashboard: await page.getByRole("textbox", { name: "자재 검색", exact: true }).isVisible() };
}

test("SHELL02 warehouse 실제 초안 메뉴·같은메뉴·계속·폐기·내부Back 보존", async ({ page, actors }) => {
  const observed = await exerciseDraft(page, actors.requester, "warehouse");
  expect(observed.sameMenuValue).toBe("13");
  expect(observed.menuGuardVisible).toBe(true);
  expect(observed.keptMenuValue).toBe("13");
  expect(observed.keptMenuUrl).toBe(observed.url);
  expect(observed.keptBackValue).toBe("13");
  expect(observed.discardedToDashboard).toBe(true);
});

test("SHELL02 shipping 실제 초안 메뉴·Back·같은메뉴·계속·폐기", async ({ page, actors }) => {
  const observed = await exerciseDraft(page, actors.requester, "shipping");
  expect(observed.sameMenuValue).toBe("QA-초안-13");
  expect(observed.menuGuardVisible).toBe(true);
  expect(observed.keptMenuValue).toBe("QA-초안-13");
  expect(observed.keptMenuUrl).toBe(observed.url);
  expect(observed.backGuardVisible).toBe(true);
  expect(observed.keptBackValue).toBe("QA-초안-13");
  expect(observed.discardedToDashboard).toBe(true);
});

test("SHELL02 warehouse 실제 history 이탈 Back은 확인·계속초안·버리기를 보장", async ({ page, actors }) => {
  await loginUi(page, actors.requester);
  const before = await page.evaluate(() => history.length);
  const input = await warehouseDraft(page, "sidebar"); await input.fill("13");
  const draftUrl = page.url();
  const exitDepth = (await page.evaluate(() => history.length)) - before;
  expect(exitDepth).toBeGreaterThan(0);
  // Native history traversal to the preceding dashboard entry crosses the wizard.
  await page.evaluate((depth) => history.go(-depth), exitDepth);
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "계속 작성", exact: true }).click();
  await expect(page).toHaveURL(draftUrl); await expect(input).toHaveValue("13");
  // Cancelling traversal pushes the restored entry and replaces the forward branch.
  const secondExitDepth = (await page.evaluate(() => history.length)) - before;
  expect(secondExitDepth).toBeGreaterThan(0);
  await test.info().attach("warehouse-back-history-depth", { body: JSON.stringify({ before, exitDepth, secondExitDepth, restoredUrl: page.url() }), contentType: "application/json" });
  await page.evaluate((depth) => history.go(-depth), secondExitDepth);
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "저장 안 하고 나가기", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
});

test("SHELL03 깨끗한 동기화·작성중 확인·계속보존·폐기갱신", async ({ page, request, actors }) => {
  await loginUi(page, actors.requester);
  const itemName = `동기화검수${actors.requester.employee_code}`;
  const itemResponse = await request.post("/api/items", { headers: { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" }, data: { item_name: itemName, process_type_code: "TR", unit: "EA", model_slots: [1], legacy_item_type: "원자재", initial_quantity: 20 } });
  expect(itemResponse.ok(), await itemResponse.text()).toBeTruthy();
  const fetched = page.waitForResponse((response) => response.url().includes("/api/items?") && response.ok());
  await page.getByRole("button", { name: "동기화", exact: true }).click();
  await fetched;
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "자재 검색", exact: true }).fill(itemName);
  await expect(page.getByText(itemName, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const input = await warehouseDraft(page);
  await input.fill("13");
  await page.getByRole("button", { name: "동기화", exact: true }).click();
  await expect(input).toHaveValue("13");
  await expect(page.getByText("이 화면에서 나갈까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "계속 작성", exact: true }).click();
  await expect(input).toHaveValue("13");
  await page.getByRole("button", { name: "동기화", exact: true }).click();
  await page.getByRole("button", { name: "저장 안 하고 나가기", exact: true }).click();
  await expect(page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
  await expect(input).toHaveCount(0);
  await page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: /창고 → 부서/ }).filter({ visible: true }).first().click();
  await clickNextStep(page);
  await expect(page.getByRole("row", { name: new RegExp(itemName) })).toBeVisible();
});

test("SHELL04 CtrlS는 저장 동작 차단하고 일반s는 실제검색 입력", async ({ page, actors }) => {
  await loginUi(page, actors.requester);
  await page.evaluate(() => { window.addEventListener("keydown", (event) => { (window as Window & { savePrevented?: boolean }).savePrevented = event.defaultPrevented; }); });
  await page.keyboard.press("Control+s");
  expect(await page.evaluate(() => (window as Window & { savePrevented?: boolean }).savePrevented)).toBe(true);
  const input = page.getByRole("textbox", { name: "자재 검색", exact: true });
  await input.fill("");
  await input.press("s");
  await expect(input).toHaveValue("s");
  await expect(page.getByRole("button", { name: "검색 지우기", exact: true })).toBeVisible();
});

test("SETTINGS01 취소는 설정을 적용하지 않고 실패는 쌍 모두 보존", async ({ page, actors }) => {
  await loginUi(page, actors.requester);
  await settings(page);
  const before = await identity(page);
  await page.getByRole("button", { name: "다크 테마", exact: true }).click();
  await page.getByRole("button", { name: "펼침 고정", exact: true }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await identity(page)).toEqual(before);
  await settings(page);
  await page.route(`**/api/employees/${actors.requester.employee_id}/appearance`, async (route) => route.request().method() === "PUT" ? route.fulfill({ status: 422, json: { detail: "검수용 쌍 저장 오류" } }) : route.continue());
  await page.getByRole("button", { name: "다크 테마", exact: true }).click();
  await page.getByRole("button", { name: "펼침 고정", exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("설정을 저장하지 못했습니다");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await identity(page)).toEqual(before);
});

test("SETTINGS02 G10 같은직원 두탭 자동반영·초안PIN·역할audit보존", async ({ page, context, actors }) => {
  const loginEvents: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/client-events") && request.method() === "POST" && request.postData()?.includes('"ui_login"')) loginEvents.push(request.postData()!); });
  await loginUi(page, actors.approver);
  await settings(page);
  const second = await context.newPage();
  await loginUi(second, actors.approver);
  await settings(second);
  const firstBefore = await identity(page);
  const otherBefore = await identity(second);
  const loginEventCount = loginEvents.length;
  await second.getByRole("button", { name: "접힘 고정", exact: true }).click();
  await second.getByRole("button", { name: "PIN 재설정", exact: true }).click();
  await second.getByLabel("현재 PIN", { exact: true }).fill("1234");
  await page.bringToFront();
  await page.getByRole("button", { name: "다크 테마", exact: true }).click();
  await page.getByRole("button", { name: "펼침 고정", exact: true }).click();
  const saved = page.waitForRequest((request) => request.url().includes("/appearance") && request.method() === "PUT");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({ theme: "dark", sidebar_mode: "expanded" });
  await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(second.getByRole("button", { name: "접힘 고정", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(second.getByLabel("현재 PIN", { exact: true })).toHaveValue("1234");
  const firstAfter = await identity(page);
  const otherAfter = await identity(second);
  expect(firstAfter.audit).toBe(firstBefore.audit);
  expect(otherAfter.audit).toBe(otherBefore.audit);
  expect(firstAfter.operator).toMatchObject({ employee_id: actors.approver.employee_id, warehouse_role: "primary", department_role: "primary", as_research_approver: true, theme: "dark", sidebar_mode: "expanded" });
  expect(otherAfter.operator).toMatchObject({ employee_id: actors.approver.employee_id, warehouse_role: "primary", department_role: "primary", as_research_approver: true, theme: "dark", sidebar_mode: "expanded" });
  expect(loginEvents).toHaveLength(loginEventCount);
  await second.getByRole("button", { name: "PIN 재설정 닫기", exact: true }).click();
  await second.getByRole("button", { name: "라이트 테마", exact: true }).click();
  await page.getByRole("button", { name: "접힘 고정", exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(async () => (await identity(second)).operator.sidebar_mode).toBe("collapsed");
  await expect(second.getByRole("button", { name: "라이트 테마", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect((await identity(second)).operator.theme).toBe("dark");
});

test("G10 같은context 다른직원 두탭 저장실패·성공 격리", async ({ page, context, actors }) => {
  await loginUi(page, actors.requester);
  await settings(page);
  const second = await context.newPage();
  await loginUi(second, actors.other);
  await settings(second);
  const otherBefore = await identity(second);
  let failing = true;
  await page.route(`**/api/employees/${actors.requester.employee_id}/appearance`, async (route) => failing && route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { detail: "검수용 저장 실패" } }) : route.continue());
  await page.getByRole("button", { name: "다크 테마", exact: true }).click();
  await page.getByRole("button", { name: "펼침 고정", exact: true }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("설정을 저장하지 못했습니다");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await identity(second)).toEqual(otherBefore);
  failing = false;
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(second.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await identity(second)).toEqual(otherBefore);
});

test("SETTINGS04 본인팝업 실패복원·성공저장·다음실제로그인", async ({ page, actors }) => {
  seedNotes(actors.requester, [{ title: "다음 로그인 알림" }]);
  await loginUi(page, actors.requester);
  const dialog = await openNotifications(page);
  const toggle = dialog.getByRole("switch", { name: "로그인 팝업", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.route(`**/api/employees/${actors.requester.employee_id}/login-popup`, (route) => route.fulfill({ status: 503, json: { detail: "검수용 팝업 저장 실패" } }));
  await toggle.click();
  await expect(dialog.getByRole("alert")).toContainText("설정을 저장하지 못했습니다");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.unroute(`**/api/employees/${actors.requester.employee_id}/login-popup`);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("button", { name: "알림 닫기" }).click();
  await logoutUi(page, actors.requester);
  await loginUi(page, actors.requester);
  await expect(page.getByRole("dialog", { name: "알림", exact: true })).toBeVisible();
});

test("SETTINGS04 SETTINGS05 타대상 실API 거부·현재UI와 상대설정보존", async ({ page, request, actors }) => {
  await loginUi(page, actors.requester);
  await settings(page);
  const before = await identity(page);
  const other = await (await request.get(`/api/employees/${actors.other.employee_id}/appearance`)).json();
  for (const [endpoint, payload] of [["appearance", { theme: "dark", sidebar_mode: "expanded" }], ["login-popup", { login_notification_popup_enabled: true }]] as const) {
    const rejected = await request.put(`/api/employees/${actors.other.employee_id}/${endpoint}`, { headers: { "X-MES-Employee-Code": actors.requester.employee_code }, data: payload });
    expect(rejected.status()).toBe(403);
  }
  expect(await (await request.get(`/api/employees/${actors.other.employee_id}/appearance`)).json()).toEqual(other);
  expect(await identity(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "라이트 테마", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("SHELL02 일보 자동저장은 이탈전 완료를 기다리고 실패는 입력유지", async ({ page, actors }) => {
  await loginUi(page, actors.requester);
  await page.goto("/mes?tab=dailyReport");
  const input = page.getByRole("textbox", { name: "작업 내역", exact: true });
  await expect(input).toBeEnabled();
  let release!: () => void; let fail = true;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/daily-work-reports/**", async (route) => {
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    await pending;
    if (fail) await route.fulfill({ status: 503, json: { detail: "검수용 자동저장 실패" } });
    else await route.continue();
  });
  await input.fill("공통검수 일보 초안13");
  const saving = page.waitForRequest((request) => request.method() === "PUT" && request.url().includes("/daily-work-reports/"));
  await sidebar(page, "대시보드");
  await saving;
  await expect(input).toHaveValue("공통검수 일보 초안13");
  await expect(page).toHaveURL(/tab=dailyReport/);
  release();
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText(/저장|실패/);
  await expect(input).toHaveValue("공통검수 일보 초안13");
  fail = false;
  const saved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().includes("/daily-work-reports/") && response.ok());
  await sidebar(page, "대시보드");
  await saved;
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
  await page.goto("/mes?tab=dailyReport");
  await expect(input).toHaveValue("공통검수 일보 초안13");
});

test("NOTIFY01 클릭한 실제요청만 읽음·정확한탭섹션요청·실패재시도", async ({ page, request, actors }) => {
  const submitted = await submitWarehouseRequest(request, actors.requester);
  seedNotes(actors.approver, [{ title: "보존할 다른 알림" }]);
  try {
    await loginUi(page, actors.approver);
    const before = await notes(request, actors.approver);
    const target = before.items.find((note) => note.related_request_id === submitted.requestId)!;
    expect(target).toBeTruthy();
    await page.route("**/api/notifications/mark-read", (route) => route.fulfill({ status: 503, json: { detail: "검수용 읽음 실패" } }));
    const dialog = await openNotifications(page);
    await dialog.getByRole("button", { name: new RegExp(submitted.itemName) }).click();
    await expect(dialog.getByRole("alert")).toContainText("읽음 처리하지 못했습니다");
    await expect(dialog.getByRole("button", { name: new RegExp(submitted.itemName) })).toBeVisible();
    expect((await notes(request, actors.approver)).items.find((note) => note.notification_id === target.notification_id)?.is_read).toBe(false);
    await page.unroute("**/api/notifications/mark-read");
    await dialog.getByRole("button", { name: new RegExp(submitted.itemName) }).click();
    await expect(page).toHaveURL(new RegExp(`tab=warehouse.*section=queue.*stockRequestId=${submitted.requestId}`));
    await expect(page.locator(`[data-stock-request-id="${submitted.requestId}"]`)).toContainText(submitted.itemName);
    const after = await notes(request, actors.approver);
    expect(after.items.find((note) => note.notification_id === target.notification_id)?.is_read).toBe(true);
    expect(after.items.find((note) => note.title === "보존할 다른 알림")?.is_read).toBe(false);
    await expect(page.getByRole("button", { name: `알림 ${before.unread_count - 1}건`, exact: true })).toBeVisible();
  } finally {
    await request.post(`/api/stock-requests/${submitted.requestId}/cancel`, { data: { actor_employee_id: actors.requester.employee_id, pin: "0000" } });
  }
});

test("NOTIFY02 실제승인 뒤 다른결재자 배지·승인함 자동갱신·요청자결과보존", async ({ page, context, request, actors }) => {
  test.setTimeout(120_000);
  const submitted = await submitWarehouseRequest(request, actors.requester);
  await loginUi(page, actors.approver);
  const other = await context.newPage();
  await loginUi(other, actors.other);
  const requester = await context.newPage();
  await loginUi(requester, actors.requester);
  await other.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${submitted.requestId}`);
  await expect(other.locator(`[data-stock-request-id="${submitted.requestId}"]`)).toBeVisible();
  await page.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${submitted.requestId}`);
  const row = page.locator(`[data-stock-request-id="${submitted.requestId}"]`);
  await row.getByRole("button", { name: "승인", exact: true }).click();
  await row.getByPlaceholder("0000").fill("0000");
  await row.getByRole("button", { name: "승인 확정", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(other.locator(`[data-stock-request-id="${submitted.requestId}"]`)).toHaveCount(0, { timeout: 45_000 });
  await expect(other.getByRole("button", { name: "알림", exact: true })).toBeVisible({ timeout: 45_000 });
  const one = await notes(request, actors.approver); const two = await notes(request, actors.other);
  expect(one.items.filter((note) => note.related_request_id === submitted.requestId).length).toBeGreaterThan(0);
  expect(two.items.filter((note) => note.related_request_id === submitted.requestId).length).toBeGreaterThan(0);
  expect(one.items.filter((note) => note.related_request_id === submitted.requestId).every((note) => note.is_read)).toBe(true);
  expect(two.items.filter((note) => note.related_request_id === submitted.requestId).every((note) => note.is_read)).toBe(true);
  const result = await notes(request, actors.requester);
  expect(result.items.some((note) => note.related_request_id === submitted.requestId && !note.is_read)).toBe(true);
  await expect(requester.getByRole("button", { name: /^알림 [1-9]\d*건$/ })).toBeVisible({ timeout: 45_000 });
});

test("NOTIFY03 실제화면 초기로딩·조회오류·빈목록·재시도최신복구 구분", async ({ page, actors }) => {
  seedNotes(actors.requester, [{ title: "재시도 후 표시할 알림" }]);
  let release!: () => void; let mode: "loading" | "failed" | "actual" | "empty" = "loading";
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/notifications?**", async (route) => {
    if (mode === "loading") await pending;
    if (mode === "failed") await route.fulfill({ status: 503, json: { detail: "검수용 알림조회 실패" } });
    else if (mode === "empty") await route.fulfill({ json: { items: [], unread_count: 0 } });
    else await route.continue();
  });
  await loginUi(page, actors.requester);
  const dialog = await openNotifications(page);
  await expect(dialog.getByRole("status", { name: "알림 목록 불러오는 중" })).toBeVisible();
  await expect(dialog.getByText("알림이 없습니다.", { exact: true })).toHaveCount(0);
  mode = "failed"; release();
  await expect(dialog.getByRole("alert")).toContainText("알림을 불러오지 못했습니다");
  await expect(dialog.getByText("알림이 없습니다.", { exact: true })).toHaveCount(0);
  // An unknown count must not be presented as a confirmed zero (product-gap candidate).
  await expect(dialog.getByText("읽지 않은 알림 0건", { exact: true })).toHaveCount(0);
  mode = "actual";
  await expect(dialog.getByRole("button", { name: "다시 시도", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /재시도 후 표시할 알림/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /모두 읽음/ })).toBeEnabled();
  mode = "empty";
  await dialog.getByRole("tab", { name: "안 읽음", exact: true }).click();
  await expect(dialog.getByText("읽지 않은 알림이 없습니다.", { exact: true })).toBeVisible();
});

test("NOTIFY03 기존미읽음은 조회실패로0확정되지 않고 재시도복구", async ({ page, context, actors }) => {
  seedNotes(actors.requester, [{ title: "기존 알림 유지" }]);
  await loginUi(page, actors.requester);
  await expect(page.getByRole("button", { name: "알림 1건", exact: true })).toBeVisible();
  const second = await context.newPage();
  await loginUi(second, actors.other);
  await page.route("**/api/notifications?**", (route) => route.fulfill({ status: 503, json: { detail: "검수용 갱신 실패" } }));
  // Reconnect transitions force a real refetch even when a headless tab stayed visible.
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await focusFrom(page, second);
  const dialog = await openNotifications(page);
  await expect(dialog.getByRole("alert")).toContainText("기존 내용을 표시합니다");
  await expect(dialog.getByRole("button", { name: /기존 알림 유지/ })).toBeVisible();
  await expect(dialog.getByText("읽지 않은 알림 1건", { exact: true })).toBeVisible();
  await page.unroute("**/api/notifications?**");
  await dialog.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /기존 알림 유지/ })).toBeVisible();
});

test("NOTIFY04 본인만변경·반복읽음정리·없는알림404직원오류", async ({ page, request, actors }) => {
  const [id] = seedNotes(actors.requester, [{ title: "없는 알림 변경 확인" }]);
  const [otherId] = seedNotes(actors.other, [{ title: "타인 알림 보존" }]);
  await loginUi(page, actors.requester);
  const unauthorized = await request.delete(`/api/notifications/${otherId}?recipient_employee_id=${actors.other.employee_id}`, { headers: { "X-Actor-Employee-Id": actors.requester.employee_id } });
  expect(unauthorized.status()).toBe(403);
  const unauthorizedRead = await request.post("/api/notifications/mark-read", { headers: { "X-Actor-Employee-Id": actors.requester.employee_id }, data: { recipient_employee_id: actors.other.employee_id, notification_ids: [otherId] } });
  expect(unauthorizedRead.status()).toBe(403);
  expect((await notes(request, actors.other)).items.some((note) => note.notification_id === otherId)).toBe(true);
  expect((await notes(request, actors.other)).items.find((note) => note.notification_id === otherId)?.is_read).toBe(false);
  const dialog = await openNotifications(page);
  const removed = await request.delete(`/api/notifications/${id}?recipient_employee_id=${actors.requester.employee_id}`, { headers: { "X-Actor-Employee-Id": actors.requester.employee_id } });
  expect(removed.status()).toBe(204);
  await dialog.getByRole("button", { name: "알림 삭제", exact: true }).first().click();
  await expect(dialog.getByRole("alert")).toContainText("알림을 삭제하지 못했습니다");
  const missing = await request.delete(`/api/notifications/${id}?recipient_employee_id=${actors.requester.employee_id}`, { headers: { "X-Actor-Employee-Id": actors.requester.employee_id } });
  expect(missing.status()).toBe(404);
  const [repeatId] = seedNotes(actors.requester, [{ title: "반복 읽음 검수" }]);
  for (let i = 0; i < 2; i++) {
    const readOne = await request.post("/api/notifications/mark-read", { headers: { "X-Actor-Employee-Id": actors.requester.employee_id }, data: { recipient_employee_id: actors.requester.employee_id, notification_ids: [repeatId] } });
    expect(readOne.status()).toBe(200);
    expect((await notes(request, actors.requester)).items.find((note) => note.notification_id === repeatId)?.is_read).toBe(true);
  }
  for (let i = 0; i < 2; i++) {
    const read = await request.post("/api/notifications/mark-read", { headers: { "X-Actor-Employee-Id": actors.requester.employee_id }, data: { recipient_employee_id: actors.requester.employee_id } });
    expect(read.status()).toBe(200);
    const deleted = await request.delete(`/api/notifications/read?recipient_employee_id=${actors.requester.employee_id}`, { headers: { "X-Actor-Employee-Id": actors.requester.employee_id } });
    expect(deleted.status()).toBe(204);
  }
  expect((await notes(request, actors.other)).items.some((note) => note.notification_id === otherId)).toBe(true);
});

test("NOTIFY05 실제권한회수 알림정리·기존링크차단·다른결재자처리가능", async ({ page, context, request, actors }) => {
  const submitted = await submitWarehouseRequest(request, actors.requester);
  await loginUi(page, actors.approver);
  const other = await context.newPage(); await loginUi(other, actors.other);
  const dialog = await openNotifications(page);
  await expect(dialog.getByRole("button", { name: new RegExp(submitted.itemName) })).toBeVisible();
  await other.bringToFront();
  await changeEmployee(request, actors.approver, { warehouse_role: "none" });
  await page.bringToFront();
  await expect(dialog.getByRole("button", { name: new RegExp(submitted.itemName) })).toHaveCount(0);
  expect((await notes(request, actors.approver)).items.filter((note) => note.related_request_id === submitted.requestId)).toEqual([]);
  await dialog.getByRole("button", { name: "알림 닫기" }).click();
  await page.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${submitted.requestId}`);
  await expect(page.getByRole("tab", { name: /창고 승인함/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
  const forbidden = await request.post(`/api/stock-requests/${submitted.requestId}/approve`, { data: { actor_employee_id: actors.approver.employee_id, pin: "0000" } });
  expect(forbidden.status()).toBe(403);
  await other.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${submitted.requestId}`);
  await expect(other.locator(`[data-stock-request-id="${submitted.requestId}"]`)).toBeVisible();
  const approved = await request.post(`/api/stock-requests/${submitted.requestId}/approve`, { data: { actor_employee_id: actors.other.employee_id, pin: "0000" } });
  expect(approved.status()).toBe(200);
  expect((await approved.json()).status).toBe("completed");
});

test("NOTIFY06 실제취소는 모든결재자 알림·옛승인함링크를 정리", async ({ page, context, request, actors }) => {
  const submitted = await submitWarehouseRequest(request, actors.requester);
  await loginUi(page, actors.approver);
  const other = await context.newPage(); await loginUi(other, actors.other);
  const first = await openNotifications(page); const second = await openNotifications(other);
  await expect(first.getByRole("button", { name: new RegExp(submitted.itemName) })).toBeVisible();
  await expect(second.getByRole("button", { name: new RegExp(submitted.itemName) })).toBeVisible();
  const cancelled = await request.post(`/api/stock-requests/${submitted.requestId}/cancel`, { data: { actor_employee_id: actors.requester.employee_id, pin: "0000" } });
  expect(cancelled.status()).toBe(200);
  await focusFrom(page, other);
  await expect(first.getByRole("button", { name: new RegExp(submitted.itemName) })).toHaveCount(0);
  await focusFrom(other, page);
  await expect(second.getByRole("button", { name: new RegExp(submitted.itemName) })).toHaveCount(0);
  expect((await notes(request, actors.approver)).items.filter((note) => note.related_request_id === submitted.requestId)).toEqual([]);
  expect((await notes(request, actors.other)).items.filter((note) => note.related_request_id === submitted.requestId)).toEqual([]);
  await second.getByRole("button", { name: "알림 닫기" }).click();
  await other.goto(`/mes?tab=warehouse&section=queue&stockRequestId=${submitted.requestId}`);
  await expect(other.locator(`[data-stock-request-id="${submitted.requestId}"]`)).toHaveCount(0);
});

async function exerciseRoleRecall(page: Page, context: BrowserContext, request: APIRequestContext, employee: Employee, section: "queue" | "dept-queue" | "as-research-queue") {
    await loginUi(page, employee);
    const second = await context.newPage();
    await loginUi(second, employee);
    await page.goto(`/mes?tab=warehouse&section=${section}`);
    const before = await identity(page);
    const label = section === "queue" ? "창고 승인함" : section === "dept-queue" ? "부서 승인함" : "AS·연구 승인함";
    await expect(page.getByRole("tab", { name: new RegExp(label) })).toBeVisible();
    await second.bringToFront();
    await changeEmployee(request, employee, section === "queue" ? { warehouse_role: "none" } : section === "dept-queue" ? { department_role: "none" } : { as_research_approver: false });
    await focusFrom(page, second);
    await expect(page.getByRole("tab", { name: new RegExp(label) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/mes\?tab=warehouse$/);
    expect((await identity(page)).audit).toBe(before.audit);
    const restoredUrl = page.url(); const audit = (await identity(page)).audit;
    const focusedQueueCount = await page.getByRole("tab", { name: new RegExp(label) }).count();
    const focusedRequestVisible = await page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().isVisible();
    await page.goto(`/mes?tab=warehouse&section=${section}`);
    await expect(page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("tab", { name: new RegExp(label) })).toHaveCount(0);
    return { restoredUrl, audit, beforeAudit: before.audit, focusedQueueCount, focusedRequestVisible, directQueueCount: await page.getByRole("tab", { name: new RegExp(label) }).count(), directRequestVisible: await page.getByRole("button", { name: /창고 입출고/ }).filter({ visible: true }).first().isVisible() };
}

test("SESSION01 NOTIFY05 실제 queue 창고역할회수 focus는 요청화면 복구", async ({ page, context, request, actors }) => {
  const observed = await exerciseRoleRecall(page, context, request, actors.approver, "queue");
  expect(observed.focusedQueueCount).toBe(0); expect(observed.focusedRequestVisible).toBe(true);
  expect(observed.restoredUrl).toMatch(/\/mes\?tab=warehouse$/); expect(observed.audit).toBe(observed.beforeAudit);
  expect(observed.directQueueCount).toBe(0); expect(observed.directRequestVisible).toBe(true);
});
test("SESSION01 NOTIFY05 실제 dept-queue 부서역할회수 focus는 요청화면 복구", async ({ page, context, request, actors }) => {
  const observed = await exerciseRoleRecall(page, context, request, actors.approver, "dept-queue");
  expect(observed.focusedQueueCount).toBe(0); expect(observed.focusedRequestVisible).toBe(true);
  expect(observed.restoredUrl).toMatch(/\/mes\?tab=warehouse$/); expect(observed.audit).toBe(observed.beforeAudit);
  expect(observed.directQueueCount).toBe(0); expect(observed.directRequestVisible).toBe(true);
});
test("SESSION01 NOTIFY05 실제 as-research-queue 연구역할회수 focus는 요청화면 복구", async ({ page, context, request, actors }) => {
  const observed = await exerciseRoleRecall(page, context, request, actors.approver, "as-research-queue");
  expect(observed.focusedQueueCount).toBe(0); expect(observed.focusedRequestVisible).toBe(true);
  expect(observed.restoredUrl).toMatch(/\/mes\?tab=warehouse$/); expect(observed.audit).toBe(observed.beforeAudit);
  expect(observed.directQueueCount).toBe(0); expect(observed.directRequestVisible).toBe(true);
});

test("SESSION01 두실제탭 비활성 focus는 로그인·다음쓰기403", async ({ page, context, request, actors }) => {
  await loginUi(page, actors.requester);
  const second = await context.newPage();
  await loginUi(second, actors.requester);
  await second.bringToFront();
  await changeEmployee(request, actors.requester, { is_active: false });
  const rejected = await request.put(`/api/employees/${actors.requester.employee_id}/appearance`, { headers: { "X-MES-Employee-Code": actors.requester.employee_code }, data: { theme: "dark", sidebar_mode: "expanded" } });
  expect(rejected.status()).toBe(403);
  await focusFrom(page, second);
  await expect(page.getByRole("combobox")).toBeVisible();
  expect(await identity(page)).toEqual({ operator: null, audit: null });
});

test("ROUTE01 실제Next404 직원·메뉴·Back·대시보드·audit유지", async ({ page, actors }) => {
  const errors: string[] = []; let missingNavigations = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.isNavigationRequest() && request.url().includes("/mes/common-path-that-does-not-exist")) missingNavigations++; });
  await loginUi(page, actors.requester);
  const before = await identity(page);
  await page.goto("/mes?tab=history");
  await page.goto("/mes/common-path-that-does-not-exist");
  await expect(page.getByRole("heading", { name: "페이지를 찾을 수 없습니다", exact: true })).toBeVisible();
  await expectEmployee(page, actors.requester);
  await expect(page.getByRole("button", { name: new RegExp(actors.requester.name) }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("button", { name: /^대시보드 / })).toBeVisible();
  expect(await identity(page)).toEqual(before);
  await page.goBack();
  await expect(page).toHaveURL(/tab=history/);
  await expectEmployee(page, actors.requester);
  await page.goto("/mes/common-path-that-does-not-exist");
  await sidebar(page, "대시보드");
  await expect(page).toHaveURL(/\/mes\?tab=dashboard$/);
  await expect(page.getByRole("textbox", { name: "자재 검색", exact: true })).toBeVisible();
  expect(await identity(page)).toEqual(before);
  expect(errors).toEqual([]);
  expect(missingNavigations).toBe(2);
});

test("CONSOLE01 상위탭·상세·알림modal 순회 실제코드오류·overlay·무한로딩없음", async ({ page, actors }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; const warnings: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); if (message.type() === "warning") warnings.push(message.text()); });
  await loginUi(page, actors.approver);
  for (const tab of ["dashboard", "warehouse", "shipping", "defect", "history", "dailyReport", "weekly", "warehouseMap", "settings"]) {
    await page.goto(`/mes?tab=${tab}`);
    await expect(page.getByRole("banner").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "동기화", exact: true })).toBeVisible();
    await expect(page.locator('[role="status"][aria-label*="불러오는 중"]').filter({ visible: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator("nextjs-portal").getByText(/Runtime Error|Unhandled Runtime Error/)).toHaveCount(0);
  }
  await page.goto("/mes?tab=defect");
  await page.getByRole("button").filter({ hasText: "격리 목록", visible: true }).click();
  await page.getByRole("searchbox", { name: "불량 검색", exact: true }).fill(`없는원건-${actors.approver.employee_code}`);
  const emptyArtwork = page.locator(".dexray-empty-state").filter({ visible: true }).locator("img");
  await expect(emptyArtwork).toHaveAttribute("loading", "eager");
  await expect.poll(() => emptyArtwork.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.goto("/mes?tab=dashboard");
  await page.getByRole("button", { name: new RegExp(readSeed().rawItem.item_name) }).first().click();
  await expect(page.getByRole("dialog", { name: readSeed().rawItem.item_name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  const dialog = await openNotifications(page);
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
  expect(warnings.filter((text) => /aspect|width.*height|height.*width/i.test(text))).toEqual([]);
  expect(warnings).toEqual([]);
});
