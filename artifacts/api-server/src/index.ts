import http from "http";
import { WebSocketServer } from "ws";
import app from "./app.js";
import { logger } from "./lib/logger.js";
import { registerConnection } from "./lib/ws-manager.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

// WebSocket server — shares the same port as HTTP
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  // Match: /api/device/:appToken/ws
  const match = url.match(/^\/api\/device\/([^/?]+)\/ws/);
  if (!match?.[1]) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  const appToken = match[1];
  wss.handleUpgrade(req, socket, head, (ws) => {
    registerConnection(appToken, ws);
    ws.send(JSON.stringify({ event: "connected", appToken, ts: Date.now() }));
  });
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
