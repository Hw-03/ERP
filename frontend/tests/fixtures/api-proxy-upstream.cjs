/* DB-free HTTP fixture; an independent process can expire idle connections. */
const http = require("node:http");

const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    process.send({ type: "request", path: request.url, headers: request.headers, body });
    response.setHeader("Content-Length", "2");
    response.end("ok");
    if (request.url === "/api/warm") {
      const socket = request.socket;
      // Uvicorn also sends no Keep-Alive timeout hint before its idle FIN.
      setTimeout(() => socket.end(), 100);
    }
  });
});

server.keepAliveTimeout = 30000;
server.listen(0, "127.0.0.1", () => {
  process.send({ type: "ready", port: server.address().port });
});
process.on("disconnect", () => {
  server.closeAllConnections();
  server.close();
});
