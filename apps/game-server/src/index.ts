import { WebSocketServer, WebSocket } from "ws";
import { broadcastSnapshot, handleConnection } from "./network.js";
import type { PlayerId } from "./types.js";
import { createWorld, stepWorld, TICK_MS } from "./world.js";

const PORT = Number(process.env.PORT ?? 8082);

const wss = new WebSocketServer({ port: PORT });
const clients = new Map<WebSocket, PlayerId>();
const world = createWorld();

wss.on("connection", (socket) => {
  handleConnection(socket, clients, world);
});

setInterval(() => {
  stepWorld(world);
  broadcastSnapshot(wss, world);
}, TICK_MS);

console.log(`Game server listening on port ${PORT}`);
