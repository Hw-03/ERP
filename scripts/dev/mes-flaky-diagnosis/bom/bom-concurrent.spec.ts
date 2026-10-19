/** Generated only into an approved gitless source copy. One selected case, one attempt. */
import { test, expect, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs, { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loginUi } from "./_common-expectations";
const { selectCase, classify, attachExactTrace, validity, sha } = require("./_bom-exact-cdp.cjs");
const selected = selectCase(process.env.MES_BOM_CASE);
const manifest = JSON.parse(readFileSync(path.join(__dirname, "_bom-concurrent-manifest.json"), "utf8"));
const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
type Part = { item_id: string; item_name: string; mes_code: string };
type Parts = { af: Part; pa: Part; pf: Part; variantPa: Part; variant: Part; variantOther: Part; rawHistory: unknown[] };
const shippingFile = "frontend/app/mes/_components/DesktopShippingView.tsx";
const realtimeFile = "frontend/lib/queries/realtime.tsx";
const memoFile = "frontend/app/mes/_components/_admin_sections/_master_items_parts/ItemStockPurchaseFields.tsx";
/*__ISOLATED_EXPORT_GUARD__*/

test.describe.configure({ retries: 0, mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

test(`BOM-CONCURRENT ${selected.id}`, async ({ browser, request, baseURL }, info) => {
  requireIsolatedExport(info);
  if (info.retry !== 0 || process.env.MES_BOM_NATIVE_ONLY !== "1") throw new Error("native-only, zero-retry run required");
  if (!baseURL || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(baseURL)) throw new Error("dedicated local baseURL required");
  const actors: any[] = [];
  for (const [index, role] of ["none", "primary"].entries()) {
    const suffix = randomUUID().slice(0, 8);
    const response = await request.post("/api/employees", { headers: ADMIN, data: {
      employee_code: `QA-COM-${suffix}`, name: `공통검수${suffix}`, role: "직원", department: "조립",
      warehouse_role: role, department_role: role, as_research_approver: index !== 0,
      hidden_sidebar_tabs: [], login_notification_popup_enabled: false,
    } });
    expect(response.ok()).toBeTruthy(); actors.push(await response.json());
    const actor = actors[actors.length - 1];
    expect((await request.put(`/api/employees/${actor.employee_id}/appearance`, {
      headers: { "X-MES-Employee-Code": actor.employee_code }, data: { theme: "light", sidebar_mode: "hover" },
    })).ok()).toBeTruthy();
  }
  /*__PARTS_FIXTURE__*/
  const unrelatedResponse = await request.post("/api/items", { headers: ADMIN, data: {
    item_name: `BOM동시진단-구매-${randomUUID().slice(0, 8)}`, process_type_code: "TR", unit: "EA", model_slots: [1], initial_quantity: 0,
  } });
  expect(unrelatedResponse.ok()).toBeTruthy();
  const unrelated = await unrelatedResponse.json();
  const beforeUnrelated = await (await request.get(`/api/items/${unrelated.item_id}`)).json();
  const contexts = await Promise.all([browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } }), browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } })]);
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const [a, b] = pages;
  const boundary = require("./_failure-boundary");
  boundary.registerBoundary(a);
  const nativeSource = readFileSync(path.join(__dirname, "_bom-diag-native.js"), "utf8");
  const controls: any[] = [];
  const tracing = [false, false];
  const records: any = { schema: 1, phase: "preflight", case: selected, manifest: { sources: manifest.files.map((file: any) => ({ file: file.file, sha256: file.sha256, exclusions: file.exclusions ?? [] })), originalSpecSha256: manifest.originalSpecSha256 }, fixture: { parts: Object.fromEntries(Object.entries(parts).filter(([key]) => key !== "rawHistory").map(([key, value]: any) => [key, value.item_id])), unrelatedItemId: unrelated.item_id }, outcome: "CONDITION_NOT_MET" };
  const snapshots: any[] = [];
  let businessError: unknown;
  try {
    for (const page of pages) {
      await page.addInitScript({ content: "window.__MES_BOM_DIAG_ENABLED__=true;window.__MES_BOM_VALUE_TRAP__=true;\n" + nativeSource });
      controls.push(await attachExactTrace(page, manifest));
    }
    await loginUi(a, actors[0]);
    await a.setViewportSize({ width: 1920, height: 1080 });
    await contexts[0].tracing.start({ screenshots: true, snapshots: true, sources: false });
    await contexts[0].tracing.startChunk({ title: "BOM A before cleanup" });
    tracing[0] = true;
    await a.goto("/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
    await a.getByTestId("shipping-pf-search").fill(parts.pf.item_name);
    await a.getByTestId(`shipping-pf-option-${parts.pf.item_id}`).click();
    await a.getByTestId("shipping-wizard-next").click();
    await expect(a.getByTestId("shipping-wizard-step-2")).toBeVisible();
    await loginUi(b, actors[1]);
    await b.setViewportSize({ width: 1920, height: 1080 });
    await contexts[1].tracing.start({ screenshots: true, snapshots: true, sources: false });
    await contexts[1].tracing.startChunk({ title: "BOM B before cleanup" });
    tracing[1] = true;
    await b.goto("/mes?tab=admin");
    const navigation = b.getByRole("navigation", { name: "관리자 섹션" });
    if (!await navigation.isVisible()) for (let index = 0; index < 4; index++) await b.getByRole("button", { name: "0", exact: true }).filter({ visible: true }).click();
    await expect(navigation).toBeVisible();
    await navigation.getByRole("button", { name: "품목 관리", exact: true }).click();
    await b.getByPlaceholder("품목명, 코드 검색", { exact: true }).fill(unrelated.item_name);
    const itemRow = b.locator(`[data-item-id="${unrelated.item_id}"]`);
    await expect(itemRow).toBeVisible();
    if (await itemRow.getAttribute("aria-selected") !== "true") await itemRow.click();
    await b.getByRole("tab", { name: "재고·구매", exact: true }).click();
    await controls[0].ready([shippingFile, realtimeFile]);
    await controls[1].ready([memoFile, realtimeFile]);
    records.preflightReadability = await Promise.all(pages.map(page => page.evaluate(() => {
      const value = (window as any).__mesBomExact.export();
      return { errors: value.errors, dropped: value.dropped, labels: [...new Set(value.events.filter((event: any) => event.readable).map((event: any) => event.label))] };
    })));
    if (records.preflightReadability.some((value: any) => value.errors || value.dropped)
      || !records.preflightReadability[0].labels.includes("render:draft")
      || !records.preflightReadability[0].labels.includes("default:loaded")) throw new Error("EXACT_SOURCE_PREFLIGHT_REFUSED: executed lexical reads were unavailable");
    if (process.env.MES_BOM_PREFLIGHT_ONLY === "1") {
      records.phase = "ready";
    } else {
    const quantity = a.locator(`[data-bom-line-child="${parts.af.item_id}"]`).getByTestId("shipping-bom-line-controls");
    await expect(quantity).toHaveValue("1");
    // Preparation may have emitted legitimate revisions. Require all observed catalogs settled before the one save.
    await expect.poll(() => {
      const observer = controls[0].evidence();
      return observer.network.every((row: any) => Number.isFinite(row.done) || observer.preparationAborts.some((aborted: any) => aborted.ordinal === row.ordinal && aborted.covered));
    }, { timeout: 10_000 }).toBe(true);
    const baselineOrdinal = controls[0].evidence().network.length;
    records.baselineOrdinal = baselineOrdinal;
    for (const control of controls) control.beginCase();
    records.phase = "case";
    await b.getByRole("textbox", { name: "구매 메모", exact: true }).fill("BOM-CONCURRENT-SYNTHETIC");
    if (selected.order === "after-reload") { await quantity.fill(String(selected.quantity)); await quantity.press("Tab"); }
    const saved = b.waitForResponse(response => new URL(response.url()).pathname === `/api/items/${unrelated.item_id}` && response.request().method() === "PUT");
    const followupStarted = controls[0].waitForCatalogAfter(baselineOrdinal);
    const saveClick = b.getByRole("button", { name: "저장", exact: true }).click();
    void saveClick.catch(() => undefined);
    // This watches the actual GET. No routing, response holding, forced revision or extra catalog request.
    const followup = await followupStarted;
    if (selected.order === "after-reload") {
      await expect.poll(() => followup.done, { timeout: 10_000 }).toBeTruthy();
      await a.waitForFunction(() => {
        const events = (window as any).__mesBomExact.export().events;
        const enqueue = [...events].reverse().find((event: any) => event.label === "enqueue:catalogItems");
        return enqueue && events.some((event: any) => event.sequence > enqueue.sequence && event.label === "render:draft" && event.catalog === enqueue.catalog);
      }, undefined, { timeout: 10_000 });
      await a.getByTestId("shipping-wizard-next").click();
    } else {
      // No observation, assertion or evaluate call between the real fill and next click.
      await quantity.fill(String(selected.quantity));
      await a.getByTestId("shipping-wizard-next").click();
    }
    await saveClick;
    const saveResponse = await saved;
    records.saveStatus = saveResponse.status();
    expect(saveResponse.status()).toBe(200);
    await expect(a.getByTestId("shipping-wizard-step-3")).toBeVisible();
    const inputAt = await a.evaluate((quantity: number) => {
      const snapshot = (window as any).__mesBomExact.export();
      const event = [...snapshot.events].reverse().find((value: any) => value.label === "action:input" && value.quantity === quantity);
      return event ? snapshot.document + event.time : null;
    }, selected.quantity);
    if (inputAt === null) throw new Error("CONDITION_NOT_MET: input was not observed");
    records.settledMatch = await controls[0].waitForMatchAfter(inputAt);
    expect(records.settledMatch.status).toBe(200);
    await expect.poll(() => followup.done, { timeout: 10_000 }).toBeTruthy();
    const afterUnrelated = await (await request.get(`/api/items/${unrelated.item_id}`)).json();
    // updated_at is the Item model's automatic server timestamp, not another edited business field.
    const withoutMemo = (value: any) => Object.fromEntries(Object.entries(value).filter(([key]) => !["purchase_memo", "updated_at"].includes(key)));
    expect(withoutMemo(afterUnrelated)).toEqual(withoutMemo(beforeUnrelated));
    records.onlyPurchaseMemoChanged = afterUnrelated.purchase_memo !== beforeUnrelated.purchase_memo;
    records.ignoredServerMetadata = ["updated_at"];
    expect(records.onlyPurchaseMemoChanged).toBe(true);
    }
  } catch (error) {
    businessError = error;
    const originalError = error instanceof Error ? error.stack ?? error.message : String(error);
    const errorFile = info.outputPath("bom-original-error.txt");
    writeFileSync(errorFile, originalError, "utf8");
    records.originalError = { file: "bom-original-error.txt", sha256: sha(originalError) };
  }
  finally {
    for (const page of pages) {
      try { snapshots.push(await page.evaluate(() => ({ exact: (window as any).__mesBomExact?.export(), native: (window as any).__mesBomDiag?.export() }))); }
      catch { snapshots.push({ unavailable: true }); }
    }
    records.observers = controls.map(control => control.evidence());
    records.snapshots = snapshots;
    const exact = snapshots[0]?.exact, bExact = snapshots[1]?.exact;
    const events = exact?.events ?? [];
    const absolute = (snapshot: any, event: any) => event ? snapshot.document + event.time : null;
    const input = [...events].reverse().find((event: any) => event.label === "action:input" && event.quantity === selected.quantity);
    const next = input && events.find((event: any) => event.label === "action:next" && event.sequence > input.sequence);
    const save = bExact?.events.find((event: any) => event.label === "action:save");
    const followup = records.observers[0]?.network[records.baselineOrdinal];
    const enqueue = events.find((event: any) => event.label === "enqueue:catalogItems" && absolute(exact, event) >= (followup?.start ?? Infinity));
    const rendered = enqueue && events.find((event: any) => event.label === "render:draft" && event.sequence > enqueue.sequence && event.catalog === enqueue.catalog);
    const match = input && [...(snapshots[0]?.native?.events ?? [])].reverse().find((event: any) => event.kind === "network:bom-match:request" && event.time >= input.time);
    // Native item IDs are tokenized; exact match source has actual allowlisted UUIDs.
    const exactMatch = input && [...events].reverse().find((event: any) => event.label.startsWith("match:") && event.sequence > input.sequence);
    const stateMatchQuantity = exactMatch?.lines?.find((line: any) => line.item === parts.af.item_id)?.quantity;
    const nativeInput = [...(snapshots[0]?.native?.events ?? [])].reverse().find((event: any) => event.kind === "native:input:window-bubble" && event.target?.value === selected.quantity && event.target?.quantity);
    const nativeBlur = nativeInput && (snapshots[0]?.native?.events ?? []).find((event: any) => event.kind === "native:focusout:window-bubble" && event.target?.child === nativeInput.target.child && event.time >= nativeInput.time);
    const matchQuantity = nativeInput && match?.lines?.find((line: any) => line.child === nativeInput.target.child)?.quantity;
    records.stateMatchQuantity = stateMatchQuantity;
    const stateAtNext = next && [...events].reverse().find((event: any) => event.label === "render:draft" && event.sequence < next.sequence);
    records.nextStateQuantity = stateAtNext?.lines?.find((line: any) => line.item === parts.af.item_id)?.quantity;
    records.condition = { save: absolute(bExact, save), start: followup?.start, done: followup?.done,
      fill: absolute(exact, input), blur: absolute(snapshots[0]?.native, nativeBlur), next: absolute(exact, next), applied: absolute(exact, rendered), matchQuantity,
      errors: (exact?.errors ?? 1) + (bExact?.errors ?? 1) + records.observers.reduce((count: number, observer: any) => count + observer.errors.length, 0),
      dropped: (exact?.dropped ?? 1) + (bExact?.dropped ?? 1), nativeMatchObserved: Boolean(match) };
    records.validity = validity(selected, exact, bExact, snapshots[0]?.native, snapshots[1]?.native, absolute(bExact, save));
    records.outcome = records.phase === "ready" ? "TOOL_READY" : records.phase === "preflight" ? "TOOL_PREPARATION_FAILED" : classify(selected, records.condition);
    if (["PASS", "FAIL"].includes(records.outcome) && (!records.validity.valid || !match || stateMatchQuantity !== matchQuantity || followup?.status !== 200 || !records.onlyPurchaseMemoChanged)) records.outcome = "CONDITION_NOT_MET";
    if (records.outcome === "PASS" && records.nextStateQuantity !== selected.quantity) records.outcome = records.nextStateQuantity === undefined ? "CONDITION_NOT_MET" : "FAIL";
    if (businessError && records.outcome === "PASS") records.outcome = "FAIL";
    records.businessError = businessError ? "business-flow-failed-see-playwright-error" : null;
    writeFileSync(info.outputPath("bom-concurrent-result.json"), JSON.stringify(records, null, 2));
    await info.attach("bom-concurrent-result", { body: Buffer.from(JSON.stringify(records)), contentType: "application/json" });
    if (!["PASS", "TOOL_READY"].includes(records.outcome)) {
      // Parent harness may install its preservation hook. It is never synthesized here.
      await boundary.preserveFailure(records.outcome);
      if (tracing[1]) await contexts[1].tracing.stopChunk({ path: info.outputPath("bom-b-before-cleanup-trace.zip") });
    }
    await boundary.beforeCleanup();
    for (const control of controls) await control.close();
    for (const context of contexts) await context.close();
  }
  if (records.outcome === "TOOL_READY") return;
  if (records.outcome === "TOOL_PREPARATION_FAILED") throw new Error("TOOL_PREPARATION_FAILED: exact CDP location guard failed before quantity/save case actions");
  if (records.outcome === "CONDITION_NOT_MET") throw new Error("CONDITION_NOT_MET: exact ordering/source evidence was not satisfied; do not retry");
  if (businessError) throw businessError;
  expect(records.outcome).toBe("PASS");
});
