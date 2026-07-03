import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  buildExitDump,
  createDiagnostics,
  timestampForFile,
} = require("../../scripts/dev-diagnostics.js");

describe("dev server diagnostics", () => {
  it("builds an exit dump with process, runtime, and memory details", () => {
    const startTime = new Date("2026-07-03T01:00:00.000Z");
    const endTime = new Date("2026-07-03T01:00:03.250Z");

    const dump = buildExitDump({
      reason: "child-exit",
      code: 130,
      signal: "SIGINT",
      childPid: 12345,
      startTime,
      endTime,
      port: "3000",
      hostname: "0.0.0.0",
      cwd: "C:\\ERP\\frontend",
      receivedSignals: [{ signal: "SIGINT", timestamp: endTime.toISOString() }],
    });

    expect(dump.reason).toBe("child-exit");
    expect(dump.exitCode).toBe(130);
    expect(dump.signal).toBe("SIGINT");
    expect(dump.childPid).toBe(12345);
    expect(dump.uptimeMs).toBe(3250);
    expect(dump.port).toBe("3000");
    expect(dump.hostname).toBe("0.0.0.0");
    expect(dump.process.pid).toBe(process.pid);
    expect(dump.process.nodeVersion).toBe(process.version);
    expect(dump.memory.process.rss).toEqual(expect.any(Number));
    expect(dump.memory.system.total).toEqual(expect.any(Number));
    expect(dump.receivedSignals).toHaveLength(1);
  });

  it("writes log lines and exit dump files under frontend logs", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mes-dev-diagnostics-"));
    const diagnostics = createDiagnostics(root);
    const endTime = new Date("2026-07-03T01:02:03.000Z");

    diagnostics.log("server started", { port: "3000" }, endTime);
    const dumpPath = diagnostics.writeExitDump(
      {
        reason: "child-error",
        code: null,
        signal: null,
        childPid: 9876,
        startTime: new Date("2026-07-03T01:02:00.000Z"),
        endTime,
        port: "3000",
        hostname: "0.0.0.0",
        cwd: root,
        receivedSignals: [],
        error: new Error("spawn failed"),
      },
      endTime,
    );

    const logText = fs.readFileSync(path.join(root, "logs", "dev-server.log"), "utf8");
    const dumpText = fs.readFileSync(dumpPath, "utf8");
    const dump = JSON.parse(dumpText);

    expect(logText).toContain("server started");
    expect(logText).toContain('"port":"3000"');
    expect(dumpPath).toContain(path.join("logs", "dumps", "dev-exit-20260703-010203-"));
    expect(dump.reason).toBe("child-error");
    expect(dump.error.message).toBe("spawn failed");
  });

  it("formats timestamps for stable dump file names", () => {
    expect(timestampForFile(new Date("2026-07-03T01:02:03.000Z"))).toBe(
      "20260703-010203",
    );
  });
});
