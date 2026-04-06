import { WebSocket, WebSocketServer } from "ws";
import { getBuildingActionPayload, getJoinPayload, getPlaceBuildingPayload, isNewGameMessage, isSpawnMessage, parseIncoming } from "./protocol.js";
import { isCreatureId, updateCreatureStats, validateCreatureStatsUpdate, type CreatureId } from "./creatures.js";
import { TICK_RATE, buildSnapshot, forceSpawnFromBuilding, placeBuilding, resetWorld, spawnUnit, toggleBuildingProduction } from "./world.js";
import type { PlayerId, WorldState } from "./types.js";

type ClientsMap = Map<WebSocket, PlayerId>;

export function handleConnection(
  socket: WebSocket,
  clients: ClientsMap,
  world: WorldState
): void {

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
      return;
    }

    if (message.type === "join" && !join.ok) {
      socket.send(JSON.stringify({ type: "error", reason: "invalid_join_payload" }));
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
      if (!isCreatureId(creatureId)) {
        socket.send(JSON.stringify({ type: "error", reason: "invalid_creature_id" }));
        return;
      }
      const result = placeBuilding(world, owner, x, y, creatureId as CreatureId);
      if (!result.ok) {
        socket.send(JSON.stringify({ type: "error", reason: result.reason }));
        return;
      }

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

    if (message.type === "update_creature_stats") {
      const owner = clients.get(socket);
      if (!owner) {
        socket.send(JSON.stringify({ type: "error", reason: "must_join_first" }));
        return;
      }
      const { creatureId, stats } = message as unknown as { creatureId: unknown; stats: unknown };
      if (!isCreatureId(creatureId)) {
        socket.send(JSON.stringify({ type: "error", reason: "invalid_update_creature_stats" }));
        return;
      }
      const validatedStats = validateCreatureStatsUpdate(stats);
      if (!validatedStats.ok) {
        socket.send(JSON.stringify({ type: "error", reason: validatedStats.reason }));
        return;
      }
      updateCreatureStats(creatureId as CreatureId, validatedStats.stats);
      return;
    }

    if (message.type === "toggle_production" || message.type === "force_spawn") {
      const owner = clients.get(socket);
      if (!owner) {
        socket.send(JSON.stringify({ type: "error", reason: "must_join_first" }));
        return;
      }
      const actionResult = getBuildingActionPayload(message);
      if (!actionResult.ok) {
        socket.send(JSON.stringify({ type: "error", reason: actionResult.reason }));
        return;
      }
      if (message.type === "toggle_production") {
        const result = toggleBuildingProduction(world, owner, actionResult.payload.buildingId);
        if (!result.ok) {
          socket.send(JSON.stringify({ type: "error", reason: result.reason }));
        }
        return;
      }
      const result = forceSpawnFromBuilding(world, owner, actionResult.payload.buildingId);
      if (!result.ok) {
        socket.send(JSON.stringify({ type: "error", reason: result.reason }));
      }
      return;
    }

    socket.send(JSON.stringify({ type: "error", reason: "unknown_message_type" }));
  });

  socket.on("close", () => {
    clients.delete(socket);
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
