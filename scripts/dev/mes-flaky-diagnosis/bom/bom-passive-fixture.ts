/** Opt-in generated copy only. Original input, next, assertions and timeouts are untouched. */
import fs from "node:fs";
import path from "node:path";
import { test as original } from "./_common-expectations";
import { registerFailureCollector } from "./_failure-boundary";

export { expect, loginUi, changeEmployee } from "./_common-expectations";
type Snapshot = { document: number; sequence: number; events: unknown[]; incidents?: unknown[] };
type Recorder = { arm: (selected: { id: string }) => void; disarm: () => void; export: () => unknown };
type PassiveGlobal = typeof globalThis & { __mesBomTransport?: Recorder; __mesBomTransportPatches?: unknown[] };
type PassiveWindow = Window & { __mesBomDiag?: { export: () => Snapshot } };

export const test = original.extend<{ bomPassive: void }>({
  bomPassive: [async ({ page }, use, testInfo) => {
    const tag = testInfo.title.startsWith("SHIP-VARIANT") ? "SHIP-VARIANT"
      : testInfo.title.startsWith("SHIP-GENERATED-ROLES") ? "SHIP-GENERATED-ROLES" : null;
    if (process.env.MES_BOM_PASSIVE !== "1" || !tag) { await use(); return; }
    const runtime = globalThis as PassiveGlobal;
    if (!runtime.__mesBomTransport || runtime.__mesBomTransportPatches?.length !== 1) throw new Error("PASSIVE_TRANSPORT_PRELOAD_REQUIRED");
    const tool = require("./_bom-input-transport.cjs");
    runtime.__mesBomTransport = tool.createTransportRecorder();
    const selected = { id: tag === "SHIP-VARIANT" ? "q2-fill" : "q3-fill" };
    const documents = new Map<number, Snapshot>();
    let firstLoss: Snapshot | undefined;
    let evicted = 0, collectionErrors = 0;
    const keep = (snapshot: Snapshot): void => {
      if (!snapshot || !Number.isFinite(snapshot.document) || !Array.isArray(snapshot.events)) { collectionErrors++; return; }
      if (!firstLoss && snapshot.incidents?.length) firstLoss = snapshot;
      if ((documents.get(snapshot.document)?.sequence ?? -1) <= snapshot.sequence) documents.set(snapshot.document, snapshot);
      while (documents.size > 8) { documents.delete(documents.keys().next().value!); evicted++; }
    };
    await page.exposeBinding("__mesBomDiagFlush", (_source, snapshot: Snapshot) => keep(snapshot));
    const native = fs.readFileSync(path.resolve(__dirname, "_bom-diag-native.js"), "utf8");
    await page.addInitScript({ content: "window.__MES_BOM_DIAG_ENABLED__=true;window.__MES_BOM_VALUE_TRAP__=true;window.__MES_BOM_PASSIVE__=true;\n" + native });
    const drain = async (): Promise<unknown> => {
      try { const snapshot = await page.evaluate(() => (window as PassiveWindow).__mesBomDiag?.export() ?? null);
        if (snapshot) keep(snapshot); else collectionErrors++;
      } catch { collectionErrors++; }
      const transport = runtime.__mesBomTransport!.export();
      const ordered = [...documents.values()].sort((a, b) => a.document - b.document);
      const documentGaps = tool.passiveDocumentGaps(transport, ordered, evicted);
      const assessment = ordered.map(native => ({ document: native.document,
        result: tool.assessInput(tool.selectInputCase(selected.id), { mode: "passive", native, transport,
          documentGaps, observerErrors: collectionErrors ? ["collection"] : [] }) }));
      return { schema: 1, mode: "passive", tag, selected, transport, documents: ordered, firstLoss, assessment,
        documentGaps, collectionErrors,
        environment: { node: process.version, platform: process.platform, arch: process.arch,
          browser: page.context().browser()?.version() ?? null, viewport: page.viewportSize(),
          breakpoints: false, stateSetterTelemetry: false, pauseOnReset: false } };
    };
    registerFailureCollector(drain);
    runtime.__mesBomTransport.arm(selected);
    try { await use(); }
    finally {
      runtime.__mesBomTransport.disarm();
      // Fallback attachment may follow fixture cleanup; only boundary artifacts prove the first failure.
      await testInfo.attach("bom-passive-final", { contentType: "application/json", body: Buffer.from(JSON.stringify(await drain())) });
    }
  }, { auto: true }],
});
