import fs from "node:fs";
import path from "node:path";

/** Supplement Vitest JSON with its collected instances and hidden retry/fails flags. */
export default class ExpectationReporter {
  collected = new Map();
  onCollected(files = []) {
    for (const entry of this.entries(files)) this.collected.set(`${entry.file}::${entry.name}`, entry);
  }
  entries(files) {
    const result = [];
    const visit = (task, titles, file) => {
      if (task.type === "test") result.push({ file, name: [...titles, task.name].join(" "), line: task.location?.line, mode: task.mode, expectedFailure: task.fails === true, retry: task.result?.retryCount ?? 0, repeat: task.result?.repeatCount ?? 0, status: task.result?.state === "pass" ? "PASS" : "FAIL" });
      else for (const child of task.tasks ?? []) visit(child, task.type === "suite" && !task.filepath ? [...titles, task.name] : titles, file);
    };
    for (const file of files) visit(file, [], path.relative(process.env.MES_EXPECTATION_ROOT, file.filepath).replaceAll("\\", "/"));
    return result;
  }
  onFinished(files = [], errors = []) {
    if (!process.env.MES_EXPECTATION_COLLECTION || !process.env.MES_EXPECTATION_ROOT) throw new Error("expectation reporter output/root missing");
    fs.writeFileSync(process.env.MES_EXPECTATION_COLLECTION, JSON.stringify({ schemaVersion: 1, collected: [...this.collected.values()], completed: this.entries(files), errors: errors.map((error) => String(error)) }));
  }
}
