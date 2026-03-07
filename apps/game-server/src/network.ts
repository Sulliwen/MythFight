import { WebSocket, WebSocketServer } from "ws";
import { getJoinPayload, isNewGameMessage, isSpawnMessage, parseIncoming } from "./protocol.js";
import { TICK_RATE, buildSnapshot, resetWorld, spawnUnit } from "./world.js";
import type { PlayerId, WorldState } from "./types.js";

type ClientsMap = Map<WebSocket, PlayerId>;

export function handleConnection(
  socket: WebSocket,
  clients: ClientsMap,
  world: WorldState
): void {
  console.log("Client connected");

  socket.on("message", (raw) => {
    const parsed = parseIncoming(raw);

    if (!parsed.ok) {
      socket.send(JSON.stringify({ type: "error", reason: parsed.reason }));
      return;
    }

    const message = parsed.data;

    const join = getJoinPayload(message);
    if (join.ok) {
      clients.set(socket, join.playerId);
      socket.send(
        JSON.stringify({
          type: "welcome",
          tickRate: TICK_RATE,
          playerId: join.playerId,
        })
      );
      console.log(`join ok: roomId=${join.roomId}, playerId=${join.playerId}`);
      return;
    }

    if (message.type === "join" && !join.ok) {
      socket.send(JSON.stringify({ type: "error", reason: "invalid_join_payload" }));
      console.log(`join invalid: reason=${join.reason}`);
      return;
    }

    if (isSpawnMessage(message)) {
      const owner = clients.get(socket);
      if (!owner) {
        socket.send(JSON.stringify({ type: "error", reason: "must_join_before_spawn" }));
        return;
      }

      const unit = spawnUnit(world, owner);
      console.log(`spawn: owner=${owner}, unitId=${unit.id}, x=${unit.x}`);
      return;
    }

    if (isNewGameMessage(message)) {
      const owner = clients.get(socket);
      if (!owner) {
        socket.send(JSON.stringify({ type: "error", reason: "must_join_before_new_game" }));
        return;
      }

      resetWorld(world);
      console.log(`new game requested by ${owner}`);
      return;
    }

    if (message.type === "ping") {
      const clientTime = message.clientTime;
      if (typeof clientTime !== "number") {
        socket.send(JSON.stringify({ type: "error", reason: "invalid_ping_payload" }));
        return;
      }

      socket.send(
        JSON.stringify({
          type: "pong",
          clientTime,
          serverTime: Date.now(),
        })
      );
      return;
    }

    socket.send(JSON.stringify({ type: "error", reason: "unknown_message_type" }));
  });

  socket.on("close", () => {
    clients.delete(socket);
    console.log("Client disconnected");
  });
}

export function broadcastSnapshot(wss: WebSocketServer, world: WorldState): void {
  const snapshot = buildSnapshot(world);
  const payload = JSON.stringify(snapshot);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}
