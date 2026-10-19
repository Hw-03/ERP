// Copied to the disposable testDir only. Prepare aggregate shape, not historical DB state.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type TestInfo } from "@playwright/test";

// Fixed aggregate evidence: ci-original-item-shape.json, not a live product count.
const SOURCE_RESOURCE_SHA1 = "5fc81521894cbafb839256f4a25237fce94b3a52";
const BACKGROUND: Record<string, number> = {
  AA: 14, AF: 5, AR: 26, HA: 2, HF: 1, HR: 10, NA: 1, NF: 1, NR: 1,
  PA: 3, PF: 4, PR: 2, TA: 3, TF: 3, TR: 202, VA: 1, VF: 1, VR: 1,
};
const BASELINE = { TR: 1, TA: 1 };
const IO_SCENARIO = { AA: 1, AR: 2 };
const ORIGINAL: Record<string, number> = {
  AA: 15, AF: 5, AR: 28, HA: 2, HF: 1, HR: 10, NA: 1, NF: 1, NR: 1,
  PA: 3, PF: 4, PR: 2, TA: 4, TF: 3, TR: 203, VA: 1, VF: 1, VR: 1,
};

type ItemRow = {
  item_id: string;
  process_type_code: string;
  model_slots: number[];
  unit: string;
  quantity?: number | string;
  warehouse_qty?: number | string;
  locations?: unknown[];
};

function addCounts(...groups: Record<string, number>[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const group of groups) for (const [code, count] of Object.entries(group)) {
    result[code] = (result[code] ?? 0) + count;
  }
  return result;
}

function countProcesses(items: ItemRow[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[item.process_type_code] = (result[item.process_type_code] ?? 0) + 1;
  return result;
}

function requireIsolatedExport(testInfo: TestInfo): void {
  // Gate preparation before its API calls. Do not print environment values or credentials.
  try {
    if (process.platform !== "linux" || !["1", "true"].includes(process.env.CI ?? "")) throw Error();
    const root = fs.realpathSync(path.resolve(__dirname, "../../.."));
    if (root.startsWith("/mnt/") || root !== fs.realpathSync(process.env.MES_DIAG_SOURCE!)) throw Error();
    const markerPath = path.join(root, ".mes-flaky-export.json");
    if (fs.realpathSync(markerPath) !== markerPath || fs.existsSync(path.join(root, ".git"))) throw Error();
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as { source?: string; checkout?: string; commit?: string };
    if (marker.source !== root || typeof marker.checkout !== "string" || !/^[0-9a-f]{40}$/.test(marker.commit ?? "")) throw Error();
    const checkout = fs.realpathSync(marker.checkout);
    const relative = path.relative(checkout, root);
    if (!relative || (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) throw Error();
    const database = path.join(root, "backend/mes_e2e.db");
    if (fs.realpathSync(database) !== database || fs.existsSync(path.join(root, "backend/mes.db"))) throw Error();
    if (process.env.DATABASE_URL !== "sqlite:///" + database || process.env.BACKEND_INTERNAL_URL !== "http://127.0.0.1:8021") throw Error();
    const base = new URL(testInfo.project.use.baseURL ?? "");
    if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname) || base.port !== "3100" || base.username || base.password) throw Error();
    const pid = Number(fs.readFileSync(path.join(root, "frontend/tests/e2e/.e2e-backend.pid"), "utf8").trim());
    if (!Number.isInteger(pid) || pid < 2 || fs.realpathSync(`/proc/${pid}/cwd`) !== path.join(root, "backend")) throw Error();
    const args = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    if (!args.includes("uvicorn") || !args.includes("--port") || args[args.indexOf("--port") + 1] !== "8021") throw Error();
  } catch {
    throw Error("MES-DIAG-ITEM-SHAPE requires an owned native Linux source export and isolated E2E servers");
  }
}

async function readItems(request: APIRequestContext): Promise<ItemRow[]> {
  const response = await request.get("/api/items?limit=2000", { maxRetries: 0 });
  expect(response.status(), "isolated item list response").toBe(200);
  const items: ItemRow[] = await response.json();
  expect(Array.isArray(items), "item list must be an array").toBe(true);
  return items;
}

test.describe.configure({ retries: 0 });

test("MES-DIAG-ITEM-SHAPE", async ({ request }, testInfo) => {
  // This budget applies only to sequential synthetic preparation; original IO timeouts stay intact.
  test.setTimeout(120_000);
  const created = new Set<string>();
  const createdProcesses: Record<string, number> = {};
  let preparedItemCount: number | null = null;
  let preparedProcesses: Record<string, number> | null = null;
  let status = "incomplete";
  try {
    requireIsolatedExport(testInfo);
    expect(testInfo.retry, "preparation must not retry").toBe(0);
    expect(Object.values(BACKGROUND).reduce((sum, count) => sum + count, 0)).toBe(281);
    expect(addCounts(BACKGROUND, BASELINE, IO_SCENARIO)).toEqual(ORIGINAL);
    const before = await readItems(request);
    expect(before.length, "only the original common seed may precede preparation").toBe(2);
    expect(countProcesses(before)).toEqual(BASELINE);
    const processes = await request.get("/api/codes/process-types", { maxRetries: 0 });
    expect(processes.status(), "process master response").toBe(200);
    const processRows: { code: string }[] = await processes.json();
    const availableCodes = new Set(processRows.map(row => row.code));
    expect(Object.keys(BACKGROUND).every(code => availableCodes.has(code)), "all evidence process codes must exist").toBe(true);
    const models = await request.get("/api/models", { maxRetries: 0 });
    expect(models.status(), "model master response").toBe(200);
    const modelRows: { slot: number; symbol: string | null }[] = await models.json();
    expect(modelRows.some(row => row.slot === 1 && Boolean(row.symbol) && !row.symbol?.includes("-")), "model slot 1 must be registered").toBe(true);
    const prefix = "MES_DIAG_SYNTH_" + randomUUID().replaceAll("-", "");
    for (const [code, count] of Object.entries(BACKGROUND)) {
      for (let index = 0; index < count; index++) {
        const response = await request.post("/api/items", {
          maxRetries: 0,
          headers: { "X-Admin-Pin": "0000" },
          data: { item_name: `${prefix}_${code}_${index + 1}`, process_type_code: code,
            unit: "EA", model_slots: [1], initial_quantity: 0, initial_locations: [] },
        });
        expect(response.status(), "synthetic item creation response").toBe(201);
        const item: ItemRow = await response.json();
        expect(item.process_type_code).toBe(code);
        expect(item.unit).toBe("EA");
        expect(typeof item.item_id).toBe("string");
        expect(created.has(item.item_id), "each creation must return a new item").toBe(false);
        created.add(item.item_id);
        createdProcesses[code] = (createdProcesses[code] ?? 0) + 1;
      }
    }
    expect(created.size).toBe(281);
    expect(createdProcesses).toEqual(BACKGROUND);
    const after = await readItems(request);
    preparedItemCount = after.length;
    preparedProcesses = countProcesses(after);
    expect(preparedItemCount).toBe(283);
    expect(preparedProcesses).toEqual(addCounts(BASELINE, BACKGROUND));
    const synthetic = after.filter(item => created.has(item.item_id));
    expect(synthetic.length).toBe(281);
    // POST returns the plain ItemResponse; GET computes the registered model slots.
    for (const item of synthetic) expect(item.model_slots).toEqual([1]);
    expect(synthetic.every(item => Number(item.quantity) === 0 && Number(item.warehouse_qty) === 0 && item.locations?.length === 0), "synthetic items must have zero stock").toBe(true);
    expect(preparedItemCount + Object.values(IO_SCENARIO).reduce((sum, count) => sum + count, 0)).toBe(286);
    expect(addCounts(preparedProcesses, IO_SCENARIO)).toEqual(ORIGINAL);
    status = "prepared";
  } finally {
    await testInfo.attach("synthetic-item-shape", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify({ schema: 1, status, source_resource_sha1: SOURCE_RESOURCE_SHA1,
        scope: "Synthetic item count and process-code distribution only; historical DB relationships and reservations are not restored.",
        created_item_count: created.size, created_process_code_counts: createdProcesses,
        prepared_item_count: preparedItemCount, prepared_process_code_counts: preparedProcesses,
        original_io_additional_process_code_counts: IO_SCENARIO, projected_item_count_after_original_io_setup: 286,
        projected_process_code_counts_after_original_io_setup: ORIGINAL,
      }, null, 2), "utf8"),
    });
  }
});
