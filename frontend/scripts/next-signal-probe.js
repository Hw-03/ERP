const path = require("path");
const { createDiagnostics } = require("./dev-diagnostics");

const PROBE_ENVIRONMENT_FLAG = "MES_NEXT_SIGNAL_PROBE";
const NEXT_CLI_PATTERN = /(?:^|[\\/])next[\\/]dist[\\/]bin[\\/]next$/i;
const NEXT_PRIVATE_WORKER_PATTERN =
  /(?:^|[\\/])next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js$/i;
const NODE_REPORT_MAX_FILES = 3;

function isDevelopmentProfile(env) {
  return env.MES_RUNTIME_PROFILE?.trim().toLowerCase() === "development";
}

function buildNextSignalProbeEnv(env, preloadPath) {
  const nextEnv = { ...env };
  if (!isDevelopmentProfile(nextEnv)) return nextEnv;

  const preloadPathForNodeOptions = preloadPath.replace(/\\/g, "/");
  const preload = `--require "${preloadPathForNodeOptions}"`;
  nextEnv.NODE_OPTIONS = nextEnv.NODE_OPTIONS ? `${nextEnv.NODE_OPTIONS} ${preload}` : preload;
  nextEnv[PROBE_ENVIRONMENT_FLAG] = "1";
  return nextEnv;
}

function getNextRuntimeRole(processRef) {
  const entryScript = processRef.argv[1] || "";
  const isNextCli = NEXT_CLI_PATTERN.test(entryScript);
  const isNextPrivateWorker =
    processRef.env.NEXT_PRIVATE_WORKER === "1" &&
    NEXT_PRIVATE_WORKER_PATTERN.test(entryScript);

  if (isNextCli) return "cli";
  if (isNextPrivateWorker) return "worker";
  return null;
}

function attachNextSignalProbe({
  processRef = process,
  diagnostics,
  now = () => new Date(),
  startedAtMs = Date.now(),
}) {
  function buildProcessDetails(eventAt) {
    return {
      targetPid: processRef.pid,
      targetPpid: processRef.ppid,
      argv: [...processRef.argv],
      cwd: processRef.cwd(),
      port: processRef.env.PORT || null,
      uptimeMs: Math.max(0, eventAt.getTime() - startedAtMs),
    };
  }

  function logLifecycleEvent(message, buildDetails) {
    try {
      diagnostics.log(message, buildDetails());
    } catch {
      // Probe recording must not interrupt Next startup or shutdown.
    }
  }

  function logSignal(signal) {
    logLifecycleEvent("NEXT_SIGNAL_RECEIVED", () => {
      const receivedAt = now();
      return {
        receivedAtUtc: receivedAt.toISOString(),
        signal,
        ...buildProcessDetails(receivedAt),
      };
    });
  }

  logLifecycleEvent("NEXT_SIGNAL_PROBE_READY", () => {
    const readyAt = now();
    return {
      readyAtUtc: readyAt.toISOString(),
      ...buildProcessDetails(readyAt),
      isNextPrivateWorker: processRef.env.NEXT_PRIVATE_WORKER === "1",
    };
  });
  processRef.on("SIGINT", () => logSignal("SIGINT"));
  processRef.on("SIGTERM", () => logSignal("SIGTERM"));
  processRef.on("exit", (exitCode) => {
    logLifecycleEvent("NEXT_PROCESS_EXIT", () => {
      const exitAt = now();
      return {
        exitAtUtc: exitAt.toISOString(),
        exitCode: Number(exitCode),
        ...buildProcessDetails(exitAt),
        isNextPrivateWorker: processRef.env.NEXT_PRIVATE_WORKER === "1",
      };
    });
  });
}

function attachNextWorkerExitObserver({
  processRef = process,
  diagnostics,
  childProcessModule = require("child_process"),
  now = () => new Date(),
}) {
  const originalFork = childProcessModule.fork;
  if (typeof originalFork !== "function") return false;

  childProcessModule.fork = function observedNextWorkerFork(...forkArgs) {
    const child = Reflect.apply(originalFork, this, forkArgs);
    const modulePath = forkArgs[0];

    if (
      typeof modulePath === "string" &&
      NEXT_PRIVATE_WORKER_PATTERN.test(modulePath) &&
      typeof child?.once === "function"
    ) {
      try {
        child.once("exit", (exitCode, signal) => {
          try {
            diagnostics.log("NEXT_WORKER_CHILD_EXIT", {
              observedAtUtc: now().toISOString(),
              targetPid: child.pid,
              targetPpid: processRef.pid,
              exitCode: exitCode === null ? null : Number(exitCode),
              signal: signal || null,
              port: processRef.env.PORT || null,
            });
          } catch {
            // Observation failures must not alter the worker or CLI exit path.
          }
        });
      } catch {
        // Listener attachment failures must not alter child creation.
      }
    }

    return child;
  };
  return true;
}

function configureNextWorkerDiagnosticReport({ processRef = process, diagnostics }) {
  if (!processRef.report || typeof diagnostics.prepareNodeReportDirectory !== "function") {
    return false;
  }

  try {
    const reportDirectory = diagnostics.prepareNodeReportDirectory({
      maxReports: NODE_REPORT_MAX_FILES,
      reserveSlots: 1,
    });
    processRef.report.directory = reportDirectory;
    processRef.report.reportOnFatalError = true;
    processRef.report.reportOnUncaughtException = true;
    processRef.report.excludeEnv = true;
    processRef.report.excludeNetwork = true;
    diagnostics.log("NEXT_NODE_REPORT_READY", {
      reportDirectory,
      maxReports: NODE_REPORT_MAX_FILES,
    });
    return true;
  } catch (error) {
    try {
      diagnostics.log("NEXT_NODE_REPORT_SETUP_FAILED", {
        message: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Diagnostics failures must not interrupt the Next worker lifecycle.
    }
    return false;
  }
}

function initializeNextSignalProbe({
  processRef = process,
  createDiagnosticsFactory = createDiagnostics,
  childProcessModule = require("child_process"),
  rootDir = path.resolve(__dirname, ".."),
} = {}) {
  if (!isDevelopmentProfile(processRef.env) || processRef.env[PROBE_ENVIRONMENT_FLAG] !== "1") {
    return false;
  }
  const runtimeRole = getNextRuntimeRole(processRef);
  if (!runtimeRole) return false;

  const diagnostics = createDiagnosticsFactory(rootDir);

  attachNextSignalProbe({
    processRef,
    diagnostics,
  });
  if (runtimeRole === "worker") {
    configureNextWorkerDiagnosticReport({ processRef, diagnostics });
  }
  if (runtimeRole === "cli") {
    attachNextWorkerExitObserver({ processRef, diagnostics, childProcessModule });
  }
  return true;
}

initializeNextSignalProbe();

module.exports = {
  attachNextSignalProbe,
  attachNextWorkerExitObserver,
  buildNextSignalProbeEnv,
  configureNextWorkerDiagnosticReport,
  initializeNextSignalProbe,
};
