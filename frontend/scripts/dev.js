// Custom dev server wrapper for Next.js
// - Prints a tidy banner with the real LAN IP
// - Suppresses Next's default "▲ Next.js / Local / Network / Environments" banner
// - Forwards stdout/stderr otherwise unchanged

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

function detectLanIp() {
  const skip = /vEthernet|WSL|VirtualBox|VMware|Loopback|Hyper-V|Bluetooth|Hamachi|Radmin/i;
  const candidates = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const iface of list || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (iface.address.startsWith("169.254.")) continue; // APIPA
      if (iface.address.startsWith("25.")) continue; // Hamachi
      candidates.push(iface.address);
    }
  }
  const isPrivate = (ip) =>
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
  return candidates.find(isPrivate) || candidates[0] || null;
}

const port = process.env.PORT || "3000";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const lanIp = detectLanIp();

function banner() {
  const out = process.stdout;
  const url = lanIp ? `http://${lanIp}:${port}` : `http://localhost:${port}`;
  out.write("\n");
  out.write(`  ${C.magenta}${C.bold}DEXCOWIN ERP${C.reset}  ${C.gray}dev server${C.reset}\n`);
  out.write(`  ${C.gray}${"─".repeat(44)}${C.reset}\n`);
  out.write(`  ${C.dim}Network ${C.reset}  ${C.green}${url}${C.reset}\n`);
  out.write(`  ${C.gray}${"─".repeat(44)}${C.reset}\n\n`);
}

const SUPPRESS_PATTERNS = [
  /^\s*▲\s*Next\.js\s/,
  /^\s*-\s*Local:\s/,
  /^\s*-\s*Network:\s/,
  /^\s*-\s*Environments:\s/,
];

function shouldSuppress(line) {
  const stripped = line.replace(/\x1b\[[0-9;]*m/g, "");
  return SUPPRESS_PATTERNS.some((re) => re.test(stripped));
}

function createLineFilter(stream) {
  let buf = "";
  return (chunk) => {
    buf += chunk.toString();
    const parts = buf.split("\n");
    buf = parts.pop();
    for (const line of parts) {
      if (!shouldSuppress(line)) stream.write(line + "\n");
    }
  };
}

banner();

const nextBin = path.join(
  __dirname,
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

const child = spawn(
  nextBin,
  ["dev", "--hostname", hostname, "--port", port, ...process.argv.slice(2)],
  {
    cwd: path.resolve(__dirname, ".."),
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
    shell: process.platform === "win32",
  }
);

child.stdout.on("data", createLineFilter(process.stdout));
child.stderr.on("data", createLineFilter(process.stderr));

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
