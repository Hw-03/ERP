const { createHmac } = require("node:crypto");
const { createServer } = require("node:http");
const { isIP } = require("node:net");
const path = require("node:path");

const PROXY_SHARED_SECRET_ENV = "MES_PROXY_SHARED_SECRET";
const PROXY_SHARED_SECRET_MIN_BYTES = 32;
const CLIENT_IP_HEADER = "x-mes-proxy-client-ip";
const CLIENT_IP_TIMESTAMP_HEADER = "x-mes-proxy-client-ip-timestamp";
const CLIENT_IP_SIGNATURE_HEADER = "x-mes-proxy-client-ip-signature";
const UNTRUSTED_IP_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-real-ip",
  CLIENT_IP_HEADER,
  CLIENT_IP_TIMESTAMP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
];

function canonicalIp(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 64 || value.includes("%")) {
    return undefined;
  }
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  if (mapped && isIP(mapped) === 4) return mapped;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return undefined;
  try {
    return new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    return undefined;
  }
}

function validatedSharedSecret(value) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || Buffer.byteLength(value) < PROXY_SHARED_SECRET_MIN_BYTES) {
    throw new Error(`${PROXY_SHARED_SECRET_ENV} must contain at least 32 bytes`);
  }
  return value;
}

function applyTrustedClientIpAssertion(
  request,
  { sharedSecret, nowSeconds = Math.floor(Date.now() / 1000) } = {},
) {
  for (const header of UNTRUSTED_IP_HEADERS) delete request.headers[header];
  const clientIp = canonicalIp(request.socket.remoteAddress);
  if (!clientIp) return;

  const timestamp = String(nowSeconds);
  request.headers[CLIENT_IP_HEADER] = clientIp;
  request.headers[CLIENT_IP_TIMESTAMP_HEADER] = timestamp;
  const secret = validatedSharedSecret(sharedSecret);
  if (secret) {
    request.headers[CLIENT_IP_SIGNATURE_HEADER] = createHmac("sha256", secret)
      .update(`v1\n${timestamp}\n${clientIp}`)
      .digest("hex");
  }
}

async function createMesNextServer({
  mode,
  hostname,
  port,
  dir = path.resolve(__dirname, ".."),
  sharedSecret = process.env[PROXY_SHARED_SECRET_ENV],
}) {
  const dev = mode === "dev";
  if (!dev && mode !== "start") throw new Error(`Unsupported frontend mode: ${mode}`);
  const secret = validatedSharedSecret(sharedSecret);
  process.env.NODE_ENV = dev ? "development" : "production";

  const httpServer = createServer();
  const nextFactory = require("next");
  const app = nextFactory({ dev, hostname, port, dir, httpServer });
  await app.prepare();
  const handler = app.getRequestHandler();
  httpServer.on("request", (request, response) => {
    try {
      applyTrustedClientIpAssertion(request, { sharedSecret: secret });
      Promise.resolve(handler(request, response)).catch((error) => {
        console.error(`[frontend] request handler failed (${error?.name || "Error"})`);
        if (!response.headersSent) response.writeHead(500);
        if (!response.writableEnded) response.end("Internal Server Error");
      });
    } catch (error) {
      console.error(`[frontend] proxy boundary failed (${error?.name || "Error"})`);
      if (!response.headersSent) response.writeHead(500);
      if (!response.writableEnded) response.end("Internal Server Error");
    }
  });
  return { app, server: httpServer };
}

function usage(mode = "<dev|start>") {
  return (
    `Usage: node scripts/next-server.js ${mode} [options]\n\n` +
    "Options:\n" +
    "  -H, --hostname <hostname>  Bind hostname (default: 0.0.0.0)\n" +
    "  -p, --port <port>          Bind port (default: PORT or 3000)\n" +
    "  -h, --help                 Show this help\n"
  );
}

function parseCli(argv) {
  const mode = argv[0];
  if (argv.includes("--help") || argv.includes("-h")) return { help: true, mode };
  if (!new Set(["dev", "start"]).has(mode)) throw new Error(usage());
  let hostname = "0.0.0.0";
  let port = Number(process.env.PORT || 3000);
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--hostname" || option === "-H") hostname = argv[++index];
    else if (option === "--port" || option === "-p") port = Number(argv[++index]);
    else throw new Error(`Unknown option: ${option}\n${usage(mode)}`);
  }
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid hostname or port\n${usage(mode)}`);
  }
  return { help: false, mode, hostname, port };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage(options.mode || "<dev|start>"));
    return;
  }
  const { server } = await createMesNextServer(options);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.hostname, resolve);
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => server.close(resolve));
  };
  process.once("SIGINT", () => shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => shutdown().finally(() => process.exit(0)));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[frontend] server startup failed (${error?.message || "unknown error"})`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyTrustedClientIpAssertion,
  createMesNextServer,
  parseCli,
};
