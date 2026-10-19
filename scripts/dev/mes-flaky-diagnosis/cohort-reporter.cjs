"use strict";
// Collection/order only; this reporter never changes selection or fixture groups.
const fs = require("node:fs");
const path = require("node:path");
function identity(test) {
  return [test.parent.project().name, path.basename(test.location.file), ...test.titlePath().slice(3, -1), test.title];
}
class CohortReporter {
  constructor() { this.started = 0; }
  onBegin(config, suite) {
    this.output = process.env.MES_DIAG_OUTPUT;
    this.expected = JSON.parse(fs.readFileSync(path.join(__dirname, "general-cohort.json"), "utf8")).first_attempt_order;
    const groups = new Map();
    for (const test of suite.allTests()) {
      if (!groups.has(test._workerHash)) groups.set(test._workerHash, new Map());
      const files = groups.get(test._workerHash);
      if (!files.has(test._requireFile)) files.set(test._requireFile, []);
      files.get(test._requireFile).push(test);
    }
    const schedule = [...groups.values()].flatMap(files => [...files.values()].flat()).map(identity);
    const matches = JSON.stringify(schedule) === JSON.stringify(this.expected);
    fs.writeFileSync(path.join(this.output, "cohort-collection.json"), JSON.stringify({ matches,
      playwright: require(path.join(process.cwd(), "node_modules/playwright/package.json")).version, schedule,
      group_sizes: [...groups.values()].map(files => [...files.values()].flat().length) }, null, 2));
    if (!matches) {
      process.stderr.write("Original first-attempt cohort selection/order mismatch; no business replay admitted.\n");
      process.exit(2);
    }
  }
  onTestBegin(test, result) {
    const row = { identity: identity(test), retry: result.retry, worker: result.workerIndex,
      wall_ms: Date.now(), mono_ns: process.hrtime.bigint().toString() };
    fs.appendFileSync(path.join(this.output, "cohort-starts.jsonl"), JSON.stringify(row) + "\n");
    if (result.retry !== 0 || JSON.stringify(row.identity) !== JSON.stringify(this.expected[this.started++])) {
      process.stderr.write("Actual cohort start order diverged; stopping diagnostic replay.\n");
      process.exit(2);
    }
  }
  onTestEnd(test, result) {
    fs.appendFileSync(path.join(this.output, "cohort-ends.jsonl"), JSON.stringify({ identity: identity(test),
      status: result.status, retry: result.retry, worker: result.workerIndex,
      wall_ms: Date.now(), mono_ns: process.hrtime.bigint().toString() }) + "\n");
  }
}
module.exports = CohortReporter;
