/** Install only into the approved gitless synthetic source. One condition, no retry. */
import { test, expect, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs, { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loginUi } from "./_common-expectations";
const { selectInputCase, attachInputTrace, assessInput } = require("./_bom-input-transport.cjs");
const { sha } = require("./_bom-exact-cdp.cjs");
const selected = selectInputCase(process.env.MES_BOM_CASE);
const manifest = JSON.parse(readFileSync(path.join(__dirname, "_bom-input-transport-manifest.json"), "utf8"));
const ADMIN = { "X-Admin-Pin": process.env.E2E_ADMIN_PIN ?? "0000" };
type Part = { item_id: string; item_name: string; mes_code: string };
type Parts = { af: Part; pa: Part; pf: Part; variantPa: Part; variant: Part; variantOther: Part; rawHistory: unknown[] };
/*__ISOLATED_EXPORT_GUARD__*/
test.describe.configure({ retries: 0, mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

test(`BOM-INPUT ${selected.id}`, async ({ browser, request, baseURL }, info) => {
  requireIsolatedExport(info);
  if (info.retry !== 0 || process.env.MES_BOM_NATIVE_ONLY !== "1") throw new Error("NATIVE_ONLY_ZERO_RETRY_REQUIRED");
  const transport = (globalThis as any).__mesBomTransport;
  const patches = (globalThis as any).__mesBomTransportPatches ?? [];
  if (!transport || patches.length !== 1 || patches[0].originalSha256 !== manifest.inputTransport.playwrightSha256) throw new Error("TRANSPORT_PRELOAD_NOT_READY");
  const actorSuffix = randomUUID().slice(0, 8);
  const actorResponse = await request.post("/api/employees", { headers: ADMIN, data: {
    employee_code: `QA-IN-${actorSuffix}`, name: `입력검수${actorSuffix}`, role: "직원", department: "조립",
    warehouse_role: "none", department_role: "none", as_research_approver: false,
    hidden_sidebar_tabs: [], login_notification_popup_enabled: false,
  } });
  expect(actorResponse.ok()).toBeTruthy();
  const actor = await actorResponse.json();
  expect((await request.put(`/api/employees/${actor.employee_id}/appearance`, {
    headers: { "X-MES-Employee-Code": actor.employee_code }, data: { theme: "light", sidebar_mode: "hover" },
  })).ok()).toBeTruthy();
  /*__PARTS_FIXTURE__*/
  const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const boundary = require("./_failure-boundary");
  boundary.registerBoundary(page);
  const records: any = { schema: 1, case: selected, phase: "preparation", outcome: "TOOL_PREPARATION_FAILED",
    fixture: { af: parts.af.item_id, pf: parts.pf.item_id }, manifestSha256: sha(JSON.stringify(manifest)),
    productSourceHashes: manifest.files.map((file: any) => ({ file: file.file, sha256: file.sha256 })),
    originalSpecSha256: manifest.originalSpecSha256, snapshotsDuringCriticalActions: false, transportPatches: patches };
  let control: any, businessError: unknown;
  await context.tracing.start({ screenshots: true, snapshots: false, sources: false });
  await context.tracing.startChunk({ title: "BOM input before cleanup" });
  try {
    {
      const native = readFileSync(path.join(__dirname, "_bom-diag-native.js"), "utf8");
      await page.addInitScript({ content: "window.__MES_BOM_DIAG_ENABLED__=true;window.__MES_BOM_VALUE_TRAP__=true;window.__MES_BOM_QUANTITY_ONLY__=true;window.__MES_BOM_PAUSE_ON_RESET__=true;\n" + native });
      control = await attachInputTrace(page, manifest);
    }
    await loginUi(page, actor);
    await page.goto("/mes?tab=shipping&shippingView=requestWork&shippingStep=1");
    await page.getByTestId("shipping-pf-search").fill(parts.pf.item_name);
    await page.getByTestId(`shipping-pf-option-${parts.pf.item_id}`).click();
    await page.getByTestId("shipping-wizard-next").click();
    await expect(page.getByTestId("shipping-wizard-step-2")).toBeVisible();
    const numberQuantityInput = page.locator(`[data-bom-line-child="${parts.af.item_id}"]`).getByTestId("shipping-bom-line-controls");
    await expect(numberQuantityInput).toHaveValue("1");
    expect(await numberQuantityInput.getAttribute("type")).toBe("number");
    await numberQuantityInput.focus();
    if (control) {
      await control.ready(manifest.files.map((file: any) => file.file));
      records.preflight = await page.evaluate(() => ({ native: (window as any).__mesBomDiag?.export(), exact: (window as any).__mesBomExact?.export() }));
      if (!records.preflight.native?.writerTrap.installed || records.preflight.native.writerTrap.errors || records.preflight.exact?.errors || records.preflight.exact?.dropped) throw new Error("OBSERVATION_PREFLIGHT_REFUSED");
      if (process.env.MES_BOM_PREFLIGHT_ONLY === "1") { records.outcome = "TOOL_READY"; return; }
      control.beginCase();
    }
    records.phase = "case";
    records.criticalStart = Date.now();
    transport.arm(selected); transport.mark("action:numberQuantityInput", selected.quantity);
    // Only original input actions and next click here. No evaluate, snapshot, assertion or delay.
    if (selected.transport === "fill") await numberQuantityInput.fill(String(selected.quantity));
    else { await numberQuantityInput.press("Control+A"); await numberQuantityInput.press(String(selected.quantity)); }
    if (control?.stopped()) throw new Error("DIAGNOSTIC_WRITER_CAPTURED_STOP");
    await page.getByTestId("shipping-wizard-next").click();
    transport.disarm();
    await expect(page.getByTestId("shipping-wizard-step-3")).toBeVisible();
    records.inputAt = await page.evaluate((quantity: number) => {
      const snapshot = (window as any).__mesBomExact.export();
      const input = snapshot.events.find((row: any) => row.label === "action:input" && row.quantity === quantity);
      return input ? snapshot.document + input.time : null;
    }, selected.quantity);
    if (records.inputAt === null) throw new Error("CONDITION_NOT_MET: native numeric input absent");
    records.match = await control.waitForMatchAfter(records.inputAt);
    records.matchQuantity = records.match.lines?.find((line: any) => line.item === parts.af.item_id)?.quantity;
    expect(records.match.status).toBe(200);
  } catch (error) {
    businessError = error;
    const original = error instanceof Error ? error.stack ?? error.message : String(error);
    writeFileSync(info.outputPath("bom-input-original-error.txt"), original, "utf8");
    records.originalError = { file: "bom-input-original-error.txt", sha256: sha(original) };
  } finally {
    transport.disarm();
    if (control) {
      records.observer = control.evidence();
      records.pauses = control.pauses();
      try { records.snapshot = await page.evaluate(() => ({ native: (window as any).__mesBomDiag?.export(), exact: (window as any).__mesBomExact?.export() })); }
      catch { records.snapshotUnavailable = true; }
      records.transport = transport.export();
      const exact = records.snapshot?.exact, events = exact?.events ?? [], native = records.snapshot?.native;
      const input = events.find((row: any) => row.label === "action:input" && row.quantity === selected.quantity);
      const next = input && events.find((row: any) => row.label === "action:next" && row.sequence > input.sequence);
      const state = next && [...events].reverse().find((row: any) => row.label === "render:draft" && row.sequence < next.sequence);
      records.nextStateQuantity = state?.lines?.find((line: any) => line.item === parts.af.item_id)?.quantity;
      const sources = input ? events.filter((row: any) => row.label.startsWith("match:") && row.sequence > input.sequence) : [];
      const requests = records.inputAt ? records.observer.matches.filter((row: any) => row.start >= records.inputAt) : [];
      const nativeInput = native?.events.find((row: any) => row.kind === "native:input:window-bubble" && row.target?.value === selected.quantity);
      const nativeRequests = nativeInput ? native.events.filter((row: any) => row.kind === "network:bom-match:request" && row.time >= nativeInput.time) : [];
      const sourceQuantity = sources[0]?.lines?.find((line: any) => line.item === parts.af.item_id)?.quantity;
      const nativeQuantity = nativeRequests[0]?.lines?.find((line: any) => line.child === nativeInput?.target?.child)?.quantity;
      records.connection = { inputSequence: input?.sequence, nextSequence: next?.sequence, sourceCount: sources.length,
        requestCount: requests.length, nativeRequestCount: nativeRequests.length, source: sources[0]?.label === "match:request" ? "automatic-350ms-effect" : "unresolved",
        requestOrdinal: requests[0]?.ordinal, requestIdSha256: requests[0]?.requestIdSha256, sourceQuantity, nativeQuantity,
        valid: Boolean(input && next && sources.length === 1 && sources[0].label === "match:request" && requests.length === 1 && nativeRequests.length === 1
          && requests[0].ordinal === records.match?.ordinal && Number.isFinite(sourceQuantity) && sourceQuantity === nativeQuantity && sourceQuantity === records.matchQuantity) };
      if (records.outcome !== "TOOL_READY") records.assessment = assessInput(selected, { ...records.snapshot, transport: records.transport, match: records.match,
        matchQuantity: records.matchQuantity, nextStateQuantity: records.nextStateQuantity, connection: records.connection,
        observerErrors: records.observer.errors, pauses: records.pauses });
      if (records.outcome !== "TOOL_READY") records.outcome = records.phase === "preparation" ? "TOOL_PREPARATION_FAILED" : records.assessment.outcome;
    }
    if (businessError && records.outcome === "PASS") records.outcome = "FAIL";
    writeFileSync(info.outputPath("bom-input-transport-result.json"), JSON.stringify(records, null, 2), "utf8");
    await info.attach("bom-input-transport-result", { body: Buffer.from(JSON.stringify(records)), contentType: "application/json" });
    if (!["PASS", "TOOL_READY"].includes(records.outcome)) await boundary.preserveFailure(records.outcome);
    await context.tracing.stopChunk({ path: info.outputPath("bom-input-before-cleanup-trace.zip") });
    await boundary.beforeCleanup();
    if (control) await control.close();
    await context.close();
  }
  if (businessError) throw businessError;
  expect(["PASS", "TOOL_READY"]).toContain(records.outcome);
});
