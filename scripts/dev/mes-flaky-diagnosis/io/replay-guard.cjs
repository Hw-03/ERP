"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const EXPECTED_SOURCE = "/home/hw/mes-flaky-input-transport-20261019-154319/source";
const EXPECTED_HEAD = "63d4ed59acf223e6cad62b3a360d905825d92021";
const EXPECTED_TRACE = "fbea23f0f88645d434ef63bc13ffb7efb0636092e26560f3f7dfd00ad09e0b00";
const EXPECTED_IDS = "b179 b180 b196 b181 b182 b183 b185 b186 b193 b184 b187 b188 b190 b191 b192 b200 b198 b199 b201 b197 b202 b203 b204 b205 b206 b207 b208 b209 b210 b211 b212 b216 b213 b214 b215 a16".split(" ");

/** Pin this one artifact's complete request set; a truncated manifest cannot pass. */
function validateManifest(manifest) {
  const extractorHash = createHash("sha256").update(fs.readFileSync(path.join(__dirname, "replay-extract.py"))).digest("hex");
  if (manifest.version !== 1 || manifest.source?.sha256 !== EXPECTED_TRACE || manifest.source?.extractor_sha256 !== extractorHash ||
      manifest.origin !== "http://localhost:3100" || manifest.backend_port !== 8021 || manifest.max_dispatch_error_ms !== 20)
    throw new Error("original_manifest_identity_mismatch");
  const ids = manifest.requests?.map(row => row.id).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...EXPECTED_IDS].sort()) || manifest.excluded?.length !== 1 ||
      manifest.excluded[0].source !== "1-trace.network:189" || manifest.anchor?.id !== "b196") throw new Error("original_segment_request_set_mismatch");
  for (const [id, offset] of [["b212", 4330.348], ["b213", 4459.348], ["a16", 4576.348]])
    if (manifest.requests.find(row => row.id === id).offset_ms !== offset) throw new Error("original_target_deadline_mismatch");
}

/** Only the explicitly approved gitless synthetic export can receive writes. */
function validateMarker(marker, source, environment) {
  if (source !== EXPECTED_SOURCE || marker.source !== source || marker.head !== EXPECTED_HEAD || marker.kind !== "synthetic-direct-boundaries")
    throw new Error("synthetic_export_marker_mismatch");
  if (environment.DATABASE_URL !== `sqlite:///${source}/backend/mes_e2e.db` || environment.BACKEND_INTERNAL_URL !== "http://127.0.0.1:8021")
    throw new Error("synthetic_database_or_backend_url_mismatch");
}

function listeningInodes(text) {
  return text.trim().split("\n").slice(1).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    const port = parseInt(fields[1]?.split(":").at(-1), 16);
    return fields[3] === "0A" && [3100, 8021].includes(port) ? [{ port, inode: fields[9] }] : [];
  });
}

function processIdentity(pid) {
  const proc = `/proc/${pid}`;
  const stat = fs.readFileSync(`${proc}/stat`, "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  return { pid, start_ticks: fields[19], state: fields[0], cwd: fs.realpathSync(`${proc}/cwd`),
    args: fs.readFileSync(`${proc}/cmdline`, "utf8").split("\0").filter(Boolean),
    environment: fs.readFileSync(`${proc}/environ`, "utf8").split("\0") };
}

/** Read procfs only: no server starts, signals, DB opening or process mutation. */
function guardOwnedEnvironment(environment = process.env) {
  const source = environment.MES_DIAG_SOURCE;
  if (!source || source !== EXPECTED_SOURCE || fs.realpathSync(source) !== source || fs.realpathSync(path.resolve(__dirname, "../../../..")) !== source)
    throw new Error("owned_source_path_required");
  validateMarker(JSON.parse(fs.readFileSync(path.join(source, ".mes-flaky-export.json"), "utf8")), source, environment);
  const database = path.join(source, "backend/mes_e2e.db");
  if (fs.existsSync(path.join(source, ".git")) || fs.existsSync(path.join(source, "backend/mes.db")) || !fs.existsSync(database) || fs.realpathSync(database) !== database)
    throw new Error("gitless_synthetic_database_required");
  if (!environment.MES_DIAG_CHROMIUM || !fs.existsSync(environment.MES_DIAG_CHROMIUM)) throw new Error("diagnostic_chromium_executable_required");
  const backendPid = Number(fs.readFileSync(path.join(source, "frontend/tests/e2e/.e2e-backend.pid"), "utf8").trim());
  if (!Number.isInteger(backendPid) || backendPid < 2) throw new Error("backend_pid_file_invalid");
  const backend = processIdentity(backendPid);
  if (backend.state === "Z" || backend.cwd !== path.join(source, "backend") || !backend.args.includes("uvicorn") ||
      backend.args[backend.args.indexOf("--port") + 1] !== "8021" || !backend.environment.includes(`DATABASE_URL=${environment.DATABASE_URL}`))
    throw new Error("backend_process_ownership_mismatch");
  const sockets = ["/proc/net/tcp", "/proc/net/tcp6"].flatMap(file => listeningInodes(fs.readFileSync(file, "utf8")));
  if (![3100, 8021].every(port => sockets.some(row => row.port === port))) throw new Error("owned_diagnostic_ports_not_listening");
  const owners = [];
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let descriptors;
    try { descriptors = fs.readdirSync(`/proc/${entry}/fd`); } catch { continue; }
    const owned = [];
    for (const descriptor of descriptors) {
      let target;
      try { target = fs.readlinkSync(`/proc/${entry}/fd/${descriptor}`); } catch { continue; }
      const socket = sockets.find(row => target === `socket:[${row.inode}]`);
      if (socket) owned.push(socket);
    }
    if (!owned.length) continue;
    const identity = processIdentity(Number(entry));
    for (const socket of owned) {
      if (socket.port === 8021 && identity.pid !== backendPid) throw new Error("backend_listener_not_owned_by_pid_file");
      if (socket.port === 3100 && (identity.cwd !== path.join(source, "frontend") || !identity.args.some(arg => arg.includes("next")) ||
          !identity.environment.includes("BACKEND_INTERNAL_URL=http://127.0.0.1:8021"))) throw new Error("next_listener_ownership_mismatch");
      owners.push({ ...socket, pid: identity.pid, start_ticks: identity.start_ticks, cwd: identity.cwd });
    }
  }
  if (sockets.some(socket => !owners.some(owner => owner.inode === socket.inode))) throw new Error("listener_owner_could_not_be_verified");
  return { source, head: EXPECTED_HEAD, database, owners };
}
module.exports = { guardOwnedEnvironment, validateMarker, validateManifest, listeningInodes, EXPECTED_SOURCE, EXPECTED_HEAD, EXPECTED_TRACE, EXPECTED_IDS };
