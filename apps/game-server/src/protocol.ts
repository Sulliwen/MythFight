import type { RawData } from "ws";
import type { IncomingMessage, PlayerId } from "./types.js";

type ParseResult =
  | { ok: true; data: IncomingMessage }
  | { ok: false; reason: string };

type JoinPayloadResult =
  | { ok: true; roomId: string; playerId: PlayerId }
  | { ok: false; reason: string };

export function parseIncoming(raw: RawData): ParseResult {
  try {
    const data = JSON.parse(raw.toString()) as IncomingMessage;
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      return { ok: false, reason: "invalid_message_shape" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export function getJoinPayload(message: IncomingMessage): JoinPayloadResult {
  if (message.type !== "join") {
    return { ok: false, reason: "not_join" };
  }

  const roomId = message.roomId;
  const playerId = message.playerId;

  if (typeof roomId !== "string" || roomId !== "local") {
    return { ok: false, reason: "invalid_room" };
  }

  if (playerId !== "player1" && playerId !== "player2") {
    return { ok: false, reason: "invalid_player_id" };
  }

  return { ok: true, roomId, playerId };
}

export function isSpawnMessage(message: IncomingMessage): boolean {
  return message.type === "spawn";
}

export function isNewGameMessage(message: IncomingMessage): boolean {
  return message.type === "new_game";
}

type PlaceBuildingPayload = { x: number; y: number; creatureId: string };
type PlaceBuildingPayloadResult =
  | { ok: true; payload: PlaceBuildingPayload }
  | { ok: false; reason: string };

type BuildingActionPayload = { buildingId: string };
type BuildingActionPayloadResult =
  | { ok: true; payload: BuildingActionPayload }
  | { ok: false; reason: string };

export function getBuildingActionPayload(message: IncomingMessage): BuildingActionPayloadResult {
  const { buildingId } = message as Record<string, unknown>;
  if (typeof buildingId !== "string") {
    return { ok: false, reason: "invalid_building_id" };
  }
  return { ok: true, payload: { buildingId } };
}

export function getPlaceBuildingPayload(message: IncomingMessage): PlaceBuildingPayloadResult {
  if (message.type !== "place_building") {
    return { ok: false, reason: "not_place_building" };
  }

  const { x, y, creatureId } = message as Record<string, unknown>;

  if (typeof x !== "number" || typeof y !== "number") {
    return { ok: false, reason: "invalid_coordinates" };
  }

  if (typeof creatureId !== "string") {
    return { ok: false, reason: "invalid_creature_id" };
  }

  return { ok: true, payload: { x, y, creatureId } };
}
