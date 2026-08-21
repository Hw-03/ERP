const path = require("path");
const { createDiagnostics } = require("./dev-diagnostics");

const PROBE_ENVIRONMENT_FLAG = "MES_NEXT_SIGNAL_PROBE";

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

function isNextRuntimeProcess(processRef) {
  const entryScript = processRef.argv[1] || "";
  const isNextCli = /(?:^|[\\/])next[\\/]dist[\\/]bin[\\/]next$/i.test(entryScript);
  const isNextPrivateWorker =
    processRef.env.NEXT_PRIVATE_WORKER === "1" &&
    /(?:^|[\\/])next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js$/i.test(entryScript);

  return isNextCli || isNextPrivateWorker;
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

function initializeNextSignalProbe({
  processRef = process,
  createDiagnosticsFactory = createDiagnostics,
  rootDir = path.resolve(__dirname, ".."),
} = {}) {
  if (!isDevelopmentProfile(processRef.env) || processRef.env[PROBE_ENVIRONMENT_FLAG] !== "1") {
    return false;
  }
  if (!isNextRuntimeProcess(processRef)) return false;

  attachNextSignalProbe({
    processRef,
    diagnostics: createDiagnosticsFactory(rootDir),
  });
  return true;
}

initializeNextSignalProbe();

module.exports = {
  attachNextSignalProbe,
  buildNextSignalProbeEnv,
  initializeNextSignalProbe,
};
