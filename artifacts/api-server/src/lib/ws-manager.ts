import { WebSocket } from "ws";
import { logger } from "./logger.js";

// appToken → connected clients
const connections = new Map<string, Set<WebSocket>>();

export function registerConnection(appToken: string, ws: WebSocket): void {
  if (!connections.has(appToken)) connections.set(appToken, new Set());
  connections.get(appToken)!.add(ws);
  logger.info({ appToken, total: connections.get(appToken)!.size }, "WS client connected");

  ws.on("close", () => {
    connections.get(appToken)?.delete(ws);
    if (connections.get(appToken)?.size === 0) connections.delete(appToken);
    logger.info({ appToken }, "WS client disconnected");
  });

  ws.on("error", () => {
    connections.get(appToken)?.delete(ws);
  });

  // Keep-alive ping every 30s
  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
    else clearInterval(ping);
  }, 30_000);

  ws.on("close", () => clearInterval(ping));
}

/**
 * Broadcast event to all clients subscribed to an appToken.
 * event examples: "device:updated", "device:blocked", "device:deleted"
 */
export function broadcast(
  appToken: string,
  event: string,
  data: unknown
): void {
  const clients = connections.get(appToken);
  if (!clients || clients.size === 0) return;

  const msg = JSON.stringify({ event, data, ts: Date.now() });
  let sent = 0;
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
      sent++;
    }
  });
  if (sent > 0) logger.debug({ appToken, event, sent }, "WS broadcast");
}

export function getConnectionCount(appToken: string): number {
  return connections.get(appToken)?.size ?? 0;
}
