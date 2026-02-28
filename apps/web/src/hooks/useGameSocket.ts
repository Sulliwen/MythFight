import { useEffect, useRef, useState } from "react";
import type { ServerMsg } from "../types";

type SocketStatus = "connecting" | "connected" | "error" | "closed";

export function useGameSocket() {
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [playerId, setPlayerId] = useState<string>("(none)");
  const [lastMessage, setLastMessage] = useState<string>("(none)");
  const [serverTick, setServerTick] = useState<number>(0);
  const [castleHp, setCastleHp] = useState({ player1: 0, player2: 0 });
  const [unitsCount, setUnitsCount] = useState<number>(0);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8082");
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      ws.send(
        JSON.stringify({
          type: "join",
          roomId: "local",
          playerId: "player1",
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as ServerMsg;
        setLastMessage(JSON.stringify(data));

        if (data.type === "welcome") {
          setPlayerId(data.playerId);
          return;
        }

        if (data.type === "snapshot") {
          setServerTick(data.tick);
          setCastleHp(data.castle);
          setUnitsCount(data.units.length);
        }
      } catch {
        setLastMessage(String(event.data));
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      setStatus("closed");
    };

    return () => {
      ws.close();
    };
  }, []);

  function sendSpawn() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "spawn" }));
  }

  return {
    status,
    playerId,
    lastMessage,
    serverTick,
    castleHp,
    unitsCount,
    sendSpawn,
  };
}