// Diagnostic teardown preserves the synthetic DB and never kills by port.
import fs from "node:fs";
import path from "node:path";

export default async function teardown(): Promise<void> {
  fs.writeFileSync(path.join(process.env.MES_DIAG_OUTPUT!, "global-cleanup-start.json"),
    JSON.stringify({ wall_ms: Date.now(), mono_ns: process.hrtime.bigint().toString() }));
  const root = fs.realpathSync(process.env.MES_DIAG_SOURCE!);
  const marker = JSON.parse(fs.readFileSync(path.join(root, ".mes-flaky-export.json"), "utf8"));
  if (marker.source !== root || fs.existsSync(path.join(root, ".git"))) throw Error("export ownership mismatch");
  const pidFile = path.join(root, "frontend/tests/e2e/.e2e-backend.pid");
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid < 2) throw Error("invalid backend PID");
  const proc = `/proc/${pid}`;
  if (!fs.existsSync(proc)) return;
  const cwd = fs.readlinkSync(`${proc}/cwd`);
  const args = fs.readFileSync(`${proc}/cmdline`, "utf8").split("\0");
  if (cwd !== path.join(root, "backend") || !args.includes("uvicorn") || args[args.indexOf("--port") + 1] !== "8021") {
    throw Error("backend PID ownership mismatch");
  }
  const stat = fs.readFileSync(`${proc}/stat`, "utf8");
  const startTicks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
  process.kill(pid, "SIGTERM");
  const deadline = Date.now() + 10_000;
  let stopped = false;
  while (Date.now() < deadline) {
    if (!fs.existsSync(proc)) { stopped = true; break; }
    const current = fs.readFileSync(`${proc}/stat`, "utf8");
    const fields = current.slice(current.lastIndexOf(")") + 2).split(" ");
    if (fields[0] === "Z" || fields[19] !== startTicks) { stopped = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  fs.writeFileSync(path.join(process.env.MES_DIAG_OUTPUT!, "backend-stop.json"),
    JSON.stringify({ pid, start_ticks: startTicks, signal: "SIGTERM", stopped, wall_ms: Date.now() }));
  if (!stopped) throw Error("owned backend did not stop within diagnostic cleanup budget");
}
