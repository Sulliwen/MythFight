import { WebSocket, WebSocketServer } from "ws";
import { getJoinPayload, getPlaceBuildingPayload, isNewGameMessage, isSpawnMessage, parseIncoming } from "./protocol.js";
import { TICK_RATE, buildSnapshot, placeBuilding, resetWorld, spawnUnit } from "./world.js";
import type { CreatureId } from "./creatures.js";
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

      const result = spawnUnit(world, owner);
      if (!result.ok) {
        socket.send(JSON.stringify({ type: "error", reason: result.reason }));
        return;
      }
      console.log(`spawn: owner=${owner}, unitId=${result.unit.id}, x=${result.unit.x}, y=${result.unit.y}`);
      return;
    }

    const placeBuildingResult = getPlaceBuildingPayload(message);
    if (placeBuildingResult.ok) {
      const owner = clients.get(socket);
      if (!owner) {
        socket.send(JSON.stringify({ type: "error", reason: "must_join_before_place_building" }));
        return;
      }

      const { x, y, creatureId } = placeBuildingResult.payload;
      const result = placeBuilding(world, owner, x, y, creatureId as CreatureId);
      if (!result.ok) {
        socket.send(JSON.stringify({ type: "error", reason: result.reason }));
        return;
      }

      console.log(`place_building: owner=${owner}, id=${result.building.id}, x=${x}, y=${y}`);
      return;
    }

    if (message.type === "place_building" && !placeBuildingResult.ok) {
      socket.send(JSON.stringify({ type: "error", reason: placeBuildingResult.reason }));
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
