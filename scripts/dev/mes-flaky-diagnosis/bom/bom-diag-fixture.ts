/** Observation only: original test steps, selectors and assertions stay unchanged. */
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { test as original } from "./_common-expectations";

export { expect, loginUi, changeEmployee } from "./_common-expectations";

type Snapshot = { document: number; sequence: number; events: unknown[]; incidents?: unknown[] };
type DiagnosticWindow = Window & { __mesBomDiag?: { export: () => Snapshot } };

export const test = original.extend<{ bomDiagnostics: void }>({
  bomDiagnostics: [async ({ page }, use, testInfo) => {
    if (process.env.MES_BOM_DIAG !== "1") {
      await use();
      return;
    }
    const startedAt = Date.now();
    const documents = new Map<number, Snapshot>();
    const warnings: string[] = [];
    let documentsEvicted = 0;
    let incidentDocumentsEvicted = 0;
    const keep = (snapshot: Snapshot): void => {
      if (!snapshot || typeof snapshot.document !== "number" || !Array.isArray(snapshot.events)) return;
      const previous = documents.get(snapshot.document);
      if (!previous || previous.sequence <= snapshot.sequence) documents.set(snapshot.document, snapshot);
      while (documents.size > 8) {
        const oldest = documents.keys().next().value!;
        if (documents.get(oldest)?.incidents?.length) incidentDocumentsEvicted += 1;
        documents.delete(oldest);
        documentsEvicted += 1;
      }
    };
    // One transfer on document exit, never a binding call per input/React event.
    await page.exposeBinding("__mesBomDiagFlush", (_source, snapshot: Snapshot) => { keep(snapshot); });
    const nativeObserver = await readFile(path.resolve(__dirname, "_bom-diag-native.js"), "utf8");
    const writerTrap = process.env.MES_BOM_VALUE_TRAP === "1";
    await page.addInitScript({ content: `window.__MES_BOM_DIAG_ENABLED__ = true;\nwindow.__MES_BOM_VALUE_TRAP__ = ${writerTrap};\n` + nativeObserver });
    try {
      await use();
    } finally {
      try {
        const final = await page.evaluate(() => (window as DiagnosticWindow).__mesBomDiag?.export() ?? null);
        if (final) keep(final);
        else warnings.push("final-document-had-no-recorder");
      } catch {
        warnings.push("final-document-could-not-be-read");
      }
      await testInfo.attach("bom-boundary-ring", {
        contentType: "application/json",
        body: Buffer.from(JSON.stringify({
          schema: 3, enabled: true, writerTrap, documentsEvicted, incidentDocumentsEvicted,
          startedAt, finishedAt: Date.now(),
          test: testInfo.title.startsWith("SHIP-VARIANT") ? "SHIP-VARIANT"
            : testInfo.title.startsWith("SHIP-GENERATED-ROLES") ? "SHIP-GENERATED-ROLES" : "other",
          retry: testInfo.retry, status: testInfo.status, warnings,
          documents: [...documents.values()].sort((a, b) => a.document - b.document),
        }, null, 2), "utf8"),
      });
    }
  }, { auto: true }],
});
