/** Loaded only by disposable diagnostic test copies. No fixture dependencies added. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, type Page, type TestInfo } from "@playwright/test";

const execute = promisify(execFile);
let page: Page | undefined;
let activeId: string | undefined;
let capture: Promise<void> | undefined;
let failureCollector: { testId: string; collect: () => Promise<unknown> } | undefined;

/** Optional memory drain; test identity prevents a previous test's collector leaking into this one. */
export function registerFailureCollector(collect: () => Promise<unknown>): void {
  failureCollector = { testId: test.info().testId, collect };
}

export function registerBoundary(candidate: Page | undefined): void {
  const info = test.info();
  if (activeId !== info.testId) { activeId = info.testId; page = candidate; capture = undefined; }
}
function marker(event: string, info: TestInfo, extra: Record<string, unknown> = {}): void {
  fs.appendFileSync(path.join(process.env.MES_DIAG_OUTPUT!, "failure-boundaries.jsonl"),
    JSON.stringify({ event, test_id: info.testId, wall_ms: Date.now(), mono_ns: process.hrtime.bigint().toString(), ...extra }) + "\n");
}
export async function preserveFailure(error: unknown): Promise<void> {
  const info = test.info();
  if (activeId !== info.testId) { activeId = info.testId; page = undefined; capture = undefined; }
  if (!capture) {
    // Seal synchronously before any screenshot, trace export or cleanup can run.
    const message = error instanceof Error ? error.message : String(error);
    marker("failure.frozen", info, { error_hash: crypto.createHash("sha256").update(message).digest("hex") });
    capture = preserve(info).catch(() => { marker("failure.collection.crashed", info); });
  }
  await capture;
}
async function preserve(info: TestInfo): Promise<void> {
  const directory = path.join(process.env.MES_DIAG_OUTPUT!, "first-failures", info.testId.replace(/[^a-zA-Z0-9-]/g, "_"));
  fs.mkdirSync(directory, { recursive: true });
  const results: Record<string, unknown> = { status: "collecting", artifacts: {}, errors: [] };
  const artifacts = results.artifacts as Record<string, unknown>;
  const errors = results.errors as Record<string, unknown>[];
  const deadline = Date.now() + 20_000;
  async function collect(name: string, action: () => Promise<unknown>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const budget = Math.min(name === "database" ? 12_000 : 5_000, deadline - Date.now());
      if (budget <= 0) throw new Error("evidence budget exhausted");
      artifacts[name] = await Promise.race([action(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("evidence stage timed out")), budget);
      })]);
    }
    catch (error) { errors.push({ name, error: error instanceof Error ? error.name : "unknown" }); }
    finally { if (timer) clearTimeout(timer); }
  }
  // Failure-only I/O. The live collectors keep running; their final drain is cut at failure.frozen.
  if (failureCollector?.testId === info.testId) await collect("passive_input", async () => {
    const value = await failureCollector!.collect();
    fs.writeFileSync(path.join(directory, "passive-input-before-cleanup.json"), JSON.stringify(value));
    return { available: value !== null };
  });
  await collect("database", async () => {
    const { stdout } = await execute("python", [path.join(process.env.MES_DIAG_SOURCE!, "scripts/dev/mes-flaky-diagnosis/snapshot-db.py"), "--source",
      process.env.MES_DIAG_SOURCE!, "--output", path.join(directory, "before-cleanup.db")], { timeout: 12_000 });
    return JSON.parse(stdout);
  });
  if (page && !page.isClosed()) {
    await collect("bom", async () => {
      const value = await page!.evaluate(() => (window as Window & { __mesBomDiag?: { export: () => unknown } }).__mesBomDiag?.export() ?? null);
      if (Date.now() >= deadline) return { late: true };
      fs.writeFileSync(path.join(directory, "bom-before-cleanup.json"), JSON.stringify(value));
      return { available: value !== null };
    });
    await collect("screenshot", async () => {
      await page!.screenshot({ path: path.join(directory, "before-cleanup.png"), timeout: 5_000 });
      return true;
    });
    // Public chunk API: preserve the current browser trace, then retain cleanup as a new chunk.
    // APIRequestContext's independent trace remains in the standard final artifact with the cutoff marker.
    await collect("browser_trace", async () => {
      await page!.context().tracing.stopChunk({ path: path.join(directory, "before-cleanup-trace.zip") });
      if (Date.now() < deadline) await page!.context().tracing.startChunk({ title: "diagnostic cleanup after frozen failure" });
      return true;
    });
  } else errors.push({ name: "browser", error: "no_live_page_at_failure" });
  results.status = errors.length ? "partial" : "complete";
  fs.writeFileSync(path.join(directory, "receipt.json"), JSON.stringify(results, null, 2));
  marker("failure.collection.finished", info, { status: results.status });
}
export async function beforeCleanup(): Promise<void> {
  const info = test.info();
  if (capture) await capture;
  else if (info.status === "failed" || info.status === "timedOut") await preserveFailure(info.error ?? info.status);
  marker("cleanup.begin", info, { status: info.status, captured: !!capture });
}
export function needsPreservation(): boolean {
  const info = test.info();
  return (activeId === info.testId && !!capture) || info.status === "failed" || info.status === "timedOut";
}
