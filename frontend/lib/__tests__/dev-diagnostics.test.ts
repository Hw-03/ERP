import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { vi } from "vitest";

const require = createRequire(import.meta.url);

const {
  buildExitDump,
  createDiagnostics,
  summarizeFrontendCompileError,
  timestampForFile,
} = require("../../scripts/dev-diagnostics.js");

describe("dev server diagnostics", () => {
  it("rejects a runtime log junction that escapes MES_RUNTIME_ROOT", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-dev-diagnostics-junction-"));
    const root = path.join(repoRoot, "frontend");
    const runtimeRoot = path.join(repoRoot, "runtime");
    const outsideRoot = path.join(repoRoot, "outside");
    const previousRuntimeRoot = process.env.MES_RUNTIME_ROOT;

    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.mkdirSync(path.join(outsideRoot, "frontend"), { recursive: true });
    fs.symlinkSync(
      outsideRoot,
      path.join(runtimeRoot, "logs"),
      process.platform === "win32" ? "junction" : "dir",
    );
    process.env.MES_RUNTIME_ROOT = runtimeRoot;

    try {
      expect(() => {
        const diagnostics = createDiagnostics(root);
        diagnostics.log("must not escape");
      }).toThrow(/outside MES_RUNTIME_ROOT/);
      expect(fs.existsSync(path.join(outsideRoot, "frontend", "dev-server.log"))).toBe(false);
    } finally {
      if (previousRuntimeRoot === undefined) {
        delete process.env.MES_RUNTIME_ROOT;
      } else {
        process.env.MES_RUNTIME_ROOT = previousRuntimeRoot;
      }
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("does not follow a runtime junction swapped during a file append", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-dev-diagnostics-swap-"));
    const root = path.join(repoRoot, "frontend");
    const runtimeRoot = path.join(repoRoot, "runtime");
    const safeLogsRoot = path.join(runtimeRoot, "safe-logs");
    const outsideRoot = path.join(repoRoot, "outside");
    const logsLink = path.join(runtimeRoot, "logs");
    const previousRuntimeRoot = process.env.MES_RUNTIME_ROOT;

    fs.mkdirSync(safeLogsRoot, { recursive: true });
    fs.mkdirSync(path.join(outsideRoot, "frontend"), { recursive: true });
    fs.symlinkSync(
      safeLogsRoot,
      logsLink,
      process.platform === "win32" ? "junction" : "dir",
    );
    process.env.MES_RUNTIME_ROOT = runtimeRoot;
    const diagnostics = createDiagnostics(root);
    const realAppendFileSync = fs.appendFileSync.bind(fs);
    let swapped = false;
    const appendSpy = vi.spyOn(fs, "appendFileSync").mockImplementation(
      ((target, data, options) => {
        if (!swapped) {
          fs.rmSync(logsLink, { force: true });
          fs.symlinkSync(
            outsideRoot,
            logsLink,
            process.platform === "win32" ? "junction" : "dir",
          );
          swapped = true;
        }
        return realAppendFileSync(target, data, options as never);
      }) as typeof fs.appendFileSync,
    );

    try {
      expect(() => diagnostics.log("must stay inside")).toThrow(/outside MES_RUNTIME_ROOT/);
      expect(fs.existsSync(path.join(outsideRoot, "frontend", "dev-server.log"))).toBe(false);
      expect(
        fs.readFileSync(path.join(safeLogsRoot, "frontend", "dev-server.log"), "utf8"),
      ).toContain("must stay inside");
    } finally {
      appendSpy.mockRestore();
      if (previousRuntimeRoot === undefined) {
        delete process.env.MES_RUNTIME_ROOT;
      } else {
        process.env.MES_RUNTIME_ROOT = previousRuntimeRoot;
      }
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects an opened file when the physical path is swapped and restored", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-dev-diagnostics-inverse-swap-"));
    const root = path.join(repoRoot, "frontend");
    const runtimeRoot = path.join(repoRoot, "runtime");
    const safeLogsRoot = path.join(runtimeRoot, "safe-logs");
    const parkedSafeLogsRoot = path.join(runtimeRoot, "parked-safe-logs");
    const outsideRoot = path.join(repoRoot, "outside");
    const logsLink = path.join(runtimeRoot, "logs");
    const outsideLog = path.join(outsideRoot, "frontend", "dev-server.log");
    const safeLog = path.join(safeLogsRoot, "frontend", "dev-server.log");
    const previousRuntimeRoot = process.env.MES_RUNTIME_ROOT;

    fs.mkdirSync(safeLogsRoot, { recursive: true });
    fs.mkdirSync(path.dirname(outsideLog), { recursive: true });
    fs.writeFileSync(outsideLog, "outside sentinel\n", "utf8");
    fs.symlinkSync(
      safeLogsRoot,
      logsLink,
      process.platform === "win32" ? "junction" : "dir",
    );
    process.env.MES_RUNTIME_ROOT = runtimeRoot;
    const diagnostics = createDiagnostics(root);
    diagnostics.log("safe warmup");

    const realOpenSync = fs.openSync.bind(fs);
    let swapped = false;
    const openSpy = vi.spyOn(fs, "openSync").mockImplementation(
      ((target, flags, mode) => {
        if (!swapped && path.resolve(String(target)) === path.resolve(safeLog)) {
          fs.renameSync(safeLogsRoot, parkedSafeLogsRoot);
          fs.symlinkSync(
            outsideRoot,
            safeLogsRoot,
            process.platform === "win32" ? "junction" : "dir",
          );
          try {
            const fd = realOpenSync(target, flags, mode);
            fs.rmSync(safeLogsRoot, { force: true });
            fs.renameSync(parkedSafeLogsRoot, safeLogsRoot);
            swapped = true;
            return fd;
          } catch (error) {
            fs.rmSync(safeLogsRoot, { force: true });
            fs.renameSync(parkedSafeLogsRoot, safeLogsRoot);
            throw error;
          }
        }
        return realOpenSync(target, flags, mode);
      }) as typeof fs.openSync,
    );

    try {
      expect(() => diagnostics.log("must not reach outside")).toThrow(/runtime path/i);
      expect(fs.readFileSync(outsideLog, "utf8")).toBe("outside sentinel\n");
      expect(fs.readFileSync(safeLog, "utf8")).not.toContain("must not reach outside");
    } finally {
      openSpy.mockRestore();
      if (previousRuntimeRoot === undefined) {
        delete process.env.MES_RUNTIME_ROOT;
      } else {
        process.env.MES_RUNTIME_ROOT = previousRuntimeRoot;
      }
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

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

  it("writes log lines and exit dump files under the runtime frontend logs", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-dev-diagnostics-"));
    const root = path.join(repoRoot, "frontend");
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

    const runtimeLogDir = path.join(repoRoot, "_attic", "runtime", "logs", "frontend");
    const logText = fs.readFileSync(path.join(runtimeLogDir, "dev-server.log"), "utf8");
    const dumpText = fs.readFileSync(dumpPath, "utf8");
    const dump = JSON.parse(dumpText);

    expect(logText).toContain("server started");
    expect(logText).toContain('"port":"3000"');
    expect(dumpPath).toContain(path.join("logs", "frontend", "dumps", "dev-exit-20260703-010203-"));
    expect(dump.reason).toBe("child-error");
    expect(dump.error.message).toBe("spawn failed");
  });

  it("formats timestamps for stable dump file names", () => {
    expect(timestampForFile(new Date("2026-07-03T01:02:03.000Z"))).toBe(
      "20260703-010203",
    );
  });

  it("summarizes Next compile errors into dev-server.log events", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-dev-diagnostics-"));
    const root = path.join(repoRoot, "frontend");
    const diagnostics = createDiagnostics(root);
    const summary = summarizeFrontendCompileError(`
      Failed to compile.
      ./app/mes/_components/DesktopHistoryView.tsx
      Syntax Error: Unexpected token
    `);

    expect(summary).toEqual({
      file: "DesktopHistoryView.tsx",
      message: "Syntax Error: Unexpected token",
    });

    diagnostics.logFrontendCompileError(summary!, new Date("2026-07-03T01:02:03.000Z"));

    const logText = fs.readFileSync(
      path.join(repoRoot, "_attic", "runtime", "logs", "frontend", "dev-server.log"),
      "utf8",
    );
    expect(logText).toContain("FRONTEND_COMPILE_ERROR");
    expect(logText).toContain("file=DesktopHistoryView.tsx");
    expect(logText).toContain('message="Syntax Error: Unexpected token"');
  });
});
