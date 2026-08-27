import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { vi } from "vitest";

const require = createRequire(import.meta.url);

const {
  attachNextSignalProbe,
  attachNextWorkerExitObserver,
  buildNextSignalProbeEnv,
  initializeNextSignalProbe,
} = require("../../scripts/next-signal-probe.js");

function createFakeProcess(env: Record<string, string | undefined>) {
  const processRef = new EventEmitter() as EventEmitter & {
    pid: number;
    ppid: number;
    argv: string[];
    cwd: () => string;
    env: Record<string, string | undefined>;
    report?: {
      directory: string;
      reportOnFatalError: boolean;
      reportOnUncaughtException: boolean;
      excludeEnv: boolean;
      excludeNetwork: boolean;
    };
    exit: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
  };
  processRef.pid = 1234;
  processRef.ppid = 4321;
  processRef.argv = ["node", "C:\\ERP\\frontend\\node_modules\\next\\dist\\bin\\next", "dev"];
  processRef.cwd = () => "C:\\ERP\\frontend";
  processRef.env = env;
  processRef.exit = vi.fn();
  processRef.kill = vi.fn();
  return processRef;
}

function writeNextWorkerScript(repoRoot: string, source: string) {
  const scriptPath = path.join(
    repoRoot,
    "next",
    "dist",
    "server",
    "lib",
    "start-server.js",
  );
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, source, "utf8");
  return scriptPath;
}

function writeNextCliScript(repoRoot: string, source: string) {
  const scriptPath = path.join(repoRoot, "next", "dist", "bin", "next");
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, source, "utf8");
  return scriptPath;
}

describe("Next signal probe", () => {
  it("preserves existing NODE_OPTIONS while adding the preload in development", () => {
    const env = buildNextSignalProbeEnv(
      {
        MES_RUNTIME_PROFILE: "development",
        NODE_OPTIONS: "--max-old-space-size=4096 --trace-warnings",
      },
      "C:\\ERP\\frontend\\scripts\\next-signal-probe.js",
    );

    expect(env.NODE_OPTIONS.startsWith("--max-old-space-size=4096 --trace-warnings ")).toBe(true);
    expect(env.NODE_OPTIONS).toContain('--require "C:/ERP/frontend/scripts/next-signal-probe.js"');
  });

  it("does not inject the preload for the employee profile", () => {
    const env = buildNextSignalProbeEnv(
      {
        MES_RUNTIME_PROFILE: "employee",
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
      "C:\\ERP\\frontend\\scripts\\next-signal-probe.js",
    );

    expect(env.NODE_OPTIONS).toBe("--max-old-space-size=4096");
  });

  it.each(["SIGINT", "SIGTERM"])("logs one NEXT_SIGNAL_RECEIVED event for %s", (signal) => {
    const processRef = createFakeProcess({ PORT: "3001" });
    const log = vi.fn();
    const receivedAt = new Date("2026-08-20T01:02:03.000Z");

    attachNextSignalProbe({
      processRef,
      diagnostics: { log },
      now: () => receivedAt,
      startedAtMs: receivedAt.getTime() - 250,
    });
    processRef.emit(signal);

    const signalCalls = log.mock.calls.filter(([message]) => message === "NEXT_SIGNAL_RECEIVED");
    expect(signalCalls).toHaveLength(1);
    expect(signalCalls[0]).toEqual(["NEXT_SIGNAL_RECEIVED", {
      receivedAtUtc: "2026-08-20T01:02:03.000Z",
      signal,
      targetPid: 1234,
      targetPpid: 4321,
      argv: ["node", "C:\\ERP\\frontend\\node_modules\\next\\dist\\bin\\next", "dev"],
      cwd: "C:\\ERP\\frontend",
      port: "3001",
      uptimeMs: 250,
    }]);
  });

  it.each([
    ["development", "1", true],
    ["development", undefined, false],
    ["employee", "1", false],
  ])(
    "initializes signal handlers only for profile=%s and probe flag=%s",
    (profile, probeFlag, shouldInitialize) => {
      const processRef = createFakeProcess({
        MES_RUNTIME_PROFILE: profile,
        MES_NEXT_SIGNAL_PROBE: probeFlag,
        PORT: "3001",
      });
      const log = vi.fn();
      const createDiagnosticsFactory = vi.fn(() => ({ log }));

      const initialized = initializeNextSignalProbe({
        processRef,
        createDiagnosticsFactory,
        rootDir: "C:\\ERP\\frontend",
      });

      expect(initialized).toBe(shouldInitialize);
      expect(createDiagnosticsFactory).toHaveBeenCalledTimes(shouldInitialize ? 1 : 0);
      expect(processRef.listenerCount("SIGINT")).toBe(shouldInitialize ? 1 : 0);
      expect(processRef.listenerCount("SIGTERM")).toBe(shouldInitialize ? 1 : 0);
    },
  );

  it("does not initialize when an opted-in development preload is inherited by a non-Next child", () => {
    const processRef = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      NEXT_PRIVATE_WORKER: "1",
      PORT: "3001",
    });
    processRef.argv = [
      "node",
      "C:\\ERP\\frontend\\scripts\\ordinary-child.js",
      "C:\\ERP\\frontend\\node_modules\\next\\dist\\bin\\next",
    ];
    const createDiagnosticsFactory = vi.fn(() => ({ log: vi.fn() }));

    const initialized = initializeNextSignalProbe({
      processRef,
      createDiagnosticsFactory,
      rootDir: "C:\\ERP\\frontend",
    });

    expect(initialized).toBe(false);
    expect(createDiagnosticsFactory).not.toHaveBeenCalled();
    expect(processRef.listenerCount("SIGINT")).toBe(0);
    expect(processRef.listenerCount("SIGTERM")).toBe(0);
    expect(processRef.listenerCount("exit")).toBe(0);
  });

  it("preloads before an existing Next handler without changing its shutdown behavior", () => {
    const processRef = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      PORT: "3001",
    });
    const events: string[] = [];

    initializeNextSignalProbe({
      processRef,
      createDiagnosticsFactory: () => ({ log: (message: string) => events.push(message) }),
      rootDir: "C:\\ERP\\frontend",
    });
    processRef.on("SIGINT", () => events.push("next"));

    processRef.emit("SIGINT");

    expect(events).toEqual(["NEXT_SIGNAL_PROBE_READY", "NEXT_SIGNAL_RECEIVED", "next"]);
    expect(processRef.exit).not.toHaveBeenCalled();
    expect(processRef.kill).not.toHaveBeenCalled();
  });

  it("records the exact Next private worker raw exit code without changing fork behavior", () => {
    const processRef = createFakeProcess({ PORT: "3001" });
    const child = new EventEmitter() as EventEmitter & { pid: number };
    child.pid = 5678;
    const originalFork = vi.fn(() => child);
    const childProcessModule = { fork: originalFork };
    const log = vi.fn();
    const observedAt = new Date("2026-08-21T02:03:04.000Z");
    const workerPath = "C:\\ERP\\frontend\\node_modules\\next\\dist\\server\\lib\\start-server.js";

    attachNextWorkerExitObserver({
      processRef,
      diagnostics: { log },
      childProcessModule,
      now: () => observedAt,
    });
    const returnedChild = childProcessModule.fork(workerPath, ["--turbo"], { silent: true });
    child.emit("exit", 3221226505, null);

    expect(returnedChild).toBe(child);
    expect(originalFork).toHaveBeenCalledWith(workerPath, ["--turbo"], { silent: true });
    expect(log).toHaveBeenCalledWith("NEXT_WORKER_CHILD_EXIT", {
      observedAtUtc: "2026-08-21T02:03:04.000Z",
      targetPid: 5678,
      targetPpid: 1234,
      exitCode: 3221226505,
      signal: null,
      port: "3001",
    });
  });

  it("does not observe ordinary forked children", () => {
    const processRef = createFakeProcess({ PORT: "3001" });
    const child = new EventEmitter() as EventEmitter & { pid: number };
    child.pid = 5678;
    const childProcessModule = { fork: vi.fn(() => child) };
    const log = vi.fn();

    attachNextWorkerExitObserver({
      processRef,
      diagnostics: { log },
      childProcessModule,
    });
    childProcessModule.fork("C:\\ERP\\frontend\\scripts\\ordinary-child.js");
    child.emit("exit", 23, null);

    expect(log).not.toHaveBeenCalled();
  });

  it("patches fork only in the exact Next CLI, not inside the private worker", () => {
    const cliProcess = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      PORT: "3001",
    });
    const cliFork = vi.fn();
    const cliChildProcessModule = { fork: cliFork };

    initializeNextSignalProbe({
      processRef: cliProcess,
      createDiagnosticsFactory: () => ({ log: vi.fn() }),
      childProcessModule: cliChildProcessModule,
      rootDir: "C:\\ERP\\frontend",
    });

    const workerProcess = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      NEXT_PRIVATE_WORKER: "1",
      PORT: "3001",
    });
    workerProcess.argv[1] =
      "C:\\ERP\\frontend\\node_modules\\next\\dist\\server\\lib\\start-server.js";
    const workerFork = vi.fn();
    const workerChildProcessModule = { fork: workerFork };

    initializeNextSignalProbe({
      processRef: workerProcess,
      createDiagnosticsFactory: () => ({ log: vi.fn() }),
      childProcessModule: workerChildProcessModule,
      rootDir: "C:\\ERP\\frontend",
    });

    expect(cliChildProcessModule.fork).not.toBe(cliFork);
    expect(workerChildProcessModule.fork).toBe(workerFork);
  });

  it("configures sanitized Node reports only for the exact Next private worker", () => {
    const cliProcess = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      PORT: "3001",
    });
    cliProcess.report = {
      directory: "",
      reportOnFatalError: false,
      reportOnUncaughtException: false,
      excludeEnv: false,
      excludeNetwork: false,
    };
    const workerProcess = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      NEXT_PRIVATE_WORKER: "1",
      PORT: "3001",
    });
    workerProcess.argv[1] =
      "C:\\ERP\\frontend\\node_modules\\next\\dist\\server\\lib\\start-server.js";
    workerProcess.report = {
      directory: "",
      reportOnFatalError: false,
      reportOnUncaughtException: false,
      excludeEnv: false,
      excludeNetwork: false,
    };
    const prepareNodeReportDirectory = vi.fn(() => "C:\\runtime\\logs\\frontend\\node-reports");

    initializeNextSignalProbe({
      processRef: cliProcess,
      createDiagnosticsFactory: () => ({ log: vi.fn(), prepareNodeReportDirectory }),
      rootDir: "C:\\ERP\\frontend",
    });
    initializeNextSignalProbe({
      processRef: workerProcess,
      createDiagnosticsFactory: () => ({ log: vi.fn(), prepareNodeReportDirectory }),
      rootDir: "C:\\ERP\\frontend",
    });

    expect(cliProcess.report).toEqual({
      directory: "",
      reportOnFatalError: false,
      reportOnUncaughtException: false,
      excludeEnv: false,
      excludeNetwork: false,
    });
    expect(prepareNodeReportDirectory).toHaveBeenCalledTimes(1);
    expect(prepareNodeReportDirectory).toHaveBeenCalledWith({ maxReports: 3, reserveSlots: 1 });
    expect(workerProcess.report).toEqual({
      directory: "C:\\runtime\\logs\\frontend\\node-reports",
      reportOnFatalError: true,
      reportOnUncaughtException: true,
      excludeEnv: true,
      excludeNetwork: true,
    });
  });

  it("keeps Next lifecycle handlers active when Node report setup fails", () => {
    const processRef = createFakeProcess({
      MES_RUNTIME_PROFILE: "development",
      MES_NEXT_SIGNAL_PROBE: "1",
      NEXT_PRIVATE_WORKER: "1",
      PORT: "3001",
    });
    processRef.argv[1] =
      "C:\\ERP\\frontend\\node_modules\\next\\dist\\server\\lib\\start-server.js";
    processRef.report = {
      directory: "",
      reportOnFatalError: false,
      reportOnUncaughtException: false,
      excludeEnv: false,
      excludeNetwork: false,
    };
    const log = vi.fn();

    expect(initializeNextSignalProbe({
      processRef,
      createDiagnosticsFactory: () => ({
        log,
        prepareNodeReportDirectory: () => {
          throw new Error("directory unavailable");
        },
      }),
      rootDir: "C:\\ERP\\frontend",
    })).toBe(true);

    expect(processRef.listenerCount("SIGINT")).toBe(1);
    expect(processRef.listenerCount("SIGTERM")).toBe(1);
    expect(log).toHaveBeenCalledWith("NEXT_NODE_REPORT_SETUP_FAILED", {
      message: "directory unavailable",
    });
  });

  it("writes the exact private worker exit code from a preloaded Next CLI integration", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-next-worker-exit-"));
    const runtimeRoot = path.join(repoRoot, "runtime");
    const probePath = path.resolve("scripts", "next-signal-probe.js");
    const workerPath = writeNextWorkerScript(repoRoot, "process.exit(23);");
    const cliPath = writeNextCliScript(repoRoot, `
      const { fork } = require("child_process");
      const child = fork(process.env.TEST_WORKER_PATH, [], {
        env: { ...process.env, NEXT_PRIVATE_WORKER: "1" },
        stdio: "ignore",
      });
      child.on("exit", () => process.exit(0));
    `);

    try {
      const env = buildNextSignalProbeEnv(
        {
          ...process.env,
          MES_RUNTIME_ROOT: runtimeRoot,
          MES_RUNTIME_PROFILE: "development",
          TEST_WORKER_PATH: workerPath,
          PORT: "3001",
        },
        probePath,
      );
      const result = spawnSync(process.execPath, [cliPath], {
        env,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const logPath = path.join(runtimeRoot, "logs", "frontend", "dev-server.log");
      const workerExitLine = fs
        .readFileSync(logPath, "utf8")
        .split(/\r?\n/)
        .find((line) => line.includes("NEXT_WORKER_CHILD_EXIT"));
      expect(workerExitLine).toBeDefined();
      const payload = JSON.parse(
        workerExitLine!.replace(/^.*?NEXT_WORKER_CHILD_EXIT\s+/, ""),
      );
      expect(payload.targetPid).toBeGreaterThan(0);
      expect(payload.targetPpid).toBeGreaterThan(0);
      expect(payload.exitCode).toBe(23);
      expect(payload.signal).toBeNull();
      expect(payload.port).toBe("3001");
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("writes the preloaded signal event to frontend dev-server.log without environment secrets", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-next-signal-probe-"));
    const runtimeRoot = path.join(repoRoot, "runtime");
    const probePath = path.resolve("scripts", "next-signal-probe.js");
    const scriptPath = writeNextWorkerScript(repoRoot, `
      const fs = require("fs");
      const path = require("path");
      const logPath = path.join(process.env.MES_RUNTIME_ROOT, "logs", "frontend", "dev-server.log");
      process.on("SIGTERM", () => {
        process.stdout.write(fs.readFileSync(logPath, "utf8").includes("NEXT_SIGNAL_RECEIVED") ? "probe-before-next" : "next-before-probe");
      });
      process.emit("SIGTERM");
    `);

    try {
      const env = buildNextSignalProbeEnv(
        {
          ...process.env,
          MES_RUNTIME_ROOT: runtimeRoot,
          MES_RUNTIME_PROFILE: "development",
          MES_TEST_SECRET: "must-not-be-logged",
          NEXT_PRIVATE_WORKER: "1",
          PORT: "3001",
        },
        probePath,
      );
      const result = spawnSync(process.execPath, [scriptPath], {
        env: {
          ...env,
        },
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("probe-before-next");
      const logPath = path.join(runtimeRoot, "logs", "frontend", "dev-server.log");
      const logText = fs.readFileSync(logPath, "utf8");

      expect(logText).toContain("NEXT_SIGNAL_RECEIVED");
      expect(logText).not.toContain("must-not-be-logged");
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("writes ready and process-exit lifecycle records only for the opted-in development preload", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-next-probe-lifecycle-"));
    const developmentRuntimeRoot = path.join(repoRoot, "development-runtime");
    const employeeRuntimeRoot = path.join(repoRoot, "employee-runtime");
    const probePath = path.resolve("scripts", "next-signal-probe.js");
    const workerScriptPath = writeNextWorkerScript(repoRoot, "");

    try {
      const developmentEnv = buildNextSignalProbeEnv(
        {
          ...process.env,
          MES_RUNTIME_ROOT: developmentRuntimeRoot,
          MES_RUNTIME_PROFILE: "development",
          MES_TEST_SECRET: "must-not-be-logged",
          NEXT_PRIVATE_WORKER: "1",
          PORT: "3001",
        },
        probePath,
      );
      const developmentResult = spawnSync(process.execPath, [workerScriptPath], {
        env: developmentEnv,
        encoding: "utf8",
      });

      expect(developmentResult.status).toBe(0);
      expect(developmentResult.stderr).toBe("");
      const developmentLogPath = path.join(
        developmentRuntimeRoot,
        "logs",
        "frontend",
        "dev-server.log",
      );
      const logText = fs.readFileSync(developmentLogPath, "utf8");
      const lifecycleLines = logText
        .trim()
        .split(/\r?\n/)
        .filter((line) => /NEXT_SIGNAL_PROBE_READY|NEXT_PROCESS_EXIT/.test(line));

      expect(lifecycleLines).toHaveLength(2);
      expect(lifecycleLines[0]).toContain("NEXT_SIGNAL_PROBE_READY");
      expect(lifecycleLines[1]).toContain("NEXT_PROCESS_EXIT");
      expect(logText).not.toContain("must-not-be-logged");

      const readyPayload = JSON.parse(lifecycleLines[0].replace(/^.*?NEXT_SIGNAL_PROBE_READY\s+/, ""));
      const exitPayload = JSON.parse(lifecycleLines[1].replace(/^.*?NEXT_PROCESS_EXIT\s+/, ""));
      for (const payload of [readyPayload, exitPayload]) {
        expect(payload.targetPid).toBeGreaterThan(0);
        expect(payload.targetPpid).toBeGreaterThan(0);
        expect(payload.argv[0]).toBe(process.execPath);
        expect(payload.cwd).toBe(process.cwd());
        expect(payload.port).toBe("3001");
        expect(payload.uptimeMs).toBeGreaterThanOrEqual(0);
        expect(payload.isNextPrivateWorker).toBe(true);
        expect(new Date(payload[readyPayload === payload ? "readyAtUtc" : "exitAtUtc"]).toISOString()).toBe(
          payload[readyPayload === payload ? "readyAtUtc" : "exitAtUtc"],
        );
      }
      expect(exitPayload.exitCode).toBe(0);

      const employeeResult = spawnSync(process.execPath, ["-e", ""], {
        env: {
          ...process.env,
          MES_RUNTIME_ROOT: employeeRuntimeRoot,
          MES_RUNTIME_PROFILE: "employee",
          MES_NEXT_SIGNAL_PROBE: "1",
          NODE_OPTIONS: `--require "${probePath.replace(/\\/g, "/")}"`,
          PORT: "3001",
        },
        encoding: "utf8",
      });
      expect(employeeResult.status).toBe(0);
      expect(employeeResult.stderr).toBe("");
      expect(
        fs.existsSync(path.join(employeeRuntimeRoot, "logs", "frontend", "dev-server.log")),
      ).toBe(false);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("writes a sanitized Node diagnostic report for an opted-in private worker exception", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-next-worker-report-"));
    const runtimeRoot = path.join(repoRoot, "runtime");
    const probePath = path.resolve("scripts", "next-signal-probe.js");
    const workerScriptPath = writeNextWorkerScript(repoRoot, 'throw new Error("worker-report-probe");');

    try {
      const env = buildNextSignalProbeEnv(
        {
          ...process.env,
          MES_RUNTIME_ROOT: runtimeRoot,
          MES_RUNTIME_PROFILE: "development",
          MES_TEST_SECRET: "must-not-be-logged",
          NEXT_PRIVATE_WORKER: "1",
          PORT: "3001",
        },
        probePath,
      );
      const result = spawnSync(process.execPath, [workerScriptPath], {
        env,
        encoding: "utf8",
      });
      const reportsDir = path.join(runtimeRoot, "logs", "frontend", "node-reports");
      const logText = fs.readFileSync(
        path.join(runtimeRoot, "logs", "frontend", "dev-server.log"),
        "utf8",
      );
      expect(logText).toContain("NEXT_NODE_REPORT_READY");
      const reports = fs.readdirSync(reportsDir).filter((name) => /^report\..+\.json$/.test(name));

      expect(result.status).toBe(1);
      expect(reports).toHaveLength(1);
      const reportText = fs.readFileSync(path.join(reportsDir, reports[0]), "utf8");
      const report = JSON.parse(reportText);
      expect(report.header.processId).toBeGreaterThan(0);
      expect(report.header.event).toBe("Exception");
      expect(report.header.networkInterfaces).toBeUndefined();
      expect(report.environmentVariables).toBeUndefined();
      expect(reportText).not.toContain("must-not-be-logged");
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("inherits the preload into a non-Next child without recording or attaching handlers", () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mes-next-probe-nontarget-"));
    const runtimeRoot = path.join(repoRoot, "runtime");
    const probePath = path.resolve("scripts", "next-signal-probe.js");
    const script = `
      const fs = require("fs");
      const path = require("path");
      const logPath = path.join(process.env.MES_RUNTIME_ROOT, "logs", "frontend", "dev-server.log");
      const handlers = ["SIGINT", "SIGTERM", "exit"].map((event) => process.listenerCount(event));
      process.stdout.write(JSON.stringify({ handlers, logExists: fs.existsSync(logPath) }));
    `;

    try {
      const env = buildNextSignalProbeEnv(
        {
          ...process.env,
          MES_RUNTIME_ROOT: runtimeRoot,
          MES_RUNTIME_PROFILE: "development",
          NEXT_PRIVATE_WORKER: "1",
          PORT: "3001",
        },
        probePath,
      );
      const result = spawnSync(process.execPath, ["-e", script], {
        env,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({ handlers: [0, 0, 0], logExists: false });
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
