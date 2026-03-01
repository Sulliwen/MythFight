import { useEffect, useRef, useState } from "react";
import type { PlayerId, ServerMsg, SnapshotMsg } from "../types";

type SocketStatus = "connecting" | "connected" | "error" | "closed";
const DEFAULT_WS_URL = "ws://localhost:8082";
const WS_URL = import.meta.env.VITE_WS_URL ?? DEFAULT_WS_URL;

function parseBooleanLike(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "off") return false;
  return null;
}

function resolveSnapshotDebugEnabled(): boolean {
  const envValue = parseBooleanLike(import.meta.env.VITE_SHOW_SNAPSHOT_DEBUG ?? null);
  const defaultValue = envValue ?? import.meta.env.DEV;

  const queryValue = parseBooleanLike(
    new URLSearchParams(window.location.search).get("snapshotDebug")
  );

  return queryValue ?? defaultValue;
}

export function useGameSocket(playerIdInput: PlayerId = "player1") {
  const wsRef = useRef<WebSocket | null>(null);
  const simulatedLagRef = useRef<number>(0);
  const pendingSnapshotTimersRef = useRef<number[]>([]);
  const [showSnapshotDebug] = useState<boolean>(() => resolveSnapshotDebugEnabled());

  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [playerId, setPlayerId] = useState<string>("(none)");
  const [lastMessage, setLastMessage] = useState<string>("(none)");
  const [serverTick, setServerTick] = useState<number>(0);
  const [castleHp, setCastleHp] = useState({ player1: 0, player2: 0 });
  const [unitsCount, setUnitsCount] = useState<number>(0);
  const [snapshots, setSnapshots] = useState<SnapshotMsg[]>([]);
  const [fps, setFps] = useState<number>(0);
  const [rttMs, setRttMs] = useState<number>(0);
  const [simulatedLagMs, setSimulatedLagMs] = useState<number>(0);

  const applySnapshot = (data: SnapshotMsg) => {
    setServerTick(data.tick);
    setCastleHp(data.castle);
    setUnitsCount(data.units.length);

    setSnapshots((prev) => {
      const next = [...prev, data];
      if (next.length > 40) next.shift();
      return next;
    });
  };

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    let pingIntervalId: number | null = null;

    const sendPing = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: "ping",
          clientTime: Date.now(),
        })
      );
    };

    ws.onopen = () => {
      setStatus("connected");
      ws.send(
        JSON.stringify({
          type: "join",
          roomId: "local",
          playerId: playerIdInput,
        })
      );

      sendPing();
      pingIntervalId = window.setInterval(sendPing, 1000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as ServerMsg;
        if (data.type !== "snapshot" || showSnapshotDebug) {
          setLastMessage(JSON.stringify(data));
        }

        if (data.type === "welcome") {
          setPlayerId(data.playerId);
          return;
        }

        if (data.type === "pong") {
          setRttMs(Math.max(0, Date.now() - data.clientTime));
          return;
        }

        if (data.type === "snapshot") {
          const lag = simulatedLagRef.current;
          if (lag <= 0) {
            applySnapshot(data);
            return;
          }

          const timerId = window.setTimeout(() => {
            applySnapshot(data);
            pendingSnapshotTimersRef.current = pendingSnapshotTimersRef.current.filter(
              (id) => id !== timerId
            );
          }, lag);

          pendingSnapshotTimersRef.current.push(timerId);
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
      if (pingIntervalId !== null) {
        window.clearInterval(pingIntervalId);
      }
    };

    return () => {
      if (pingIntervalId !== null) {
        window.clearInterval(pingIntervalId);
      }
      for (const timerId of pendingSnapshotTimersRef.current) {
        window.clearTimeout(timerId);
      }
      pendingSnapshotTimersRef.current = [];
      ws.close();
    };
  }, [playerIdInput, showSnapshotDebug]);

  function updateSimulatedLagMs(value: number) {
    const sanitized = Number.isFinite(value) ? Math.max(0, value) : 0;
    simulatedLagRef.current = sanitized;
    setSimulatedLagMs(sanitized);
  }

  useEffect(() => {
    let rafId = 0;
    let frames = 0;
    let lastReport = performance.now();

    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - lastReport;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        lastReport = now;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
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
    snapshots,
    fps,
    rttMs,
    simulatedLagMs,
    setSimulatedLagMs: updateSimulatedLagMs,
    showSnapshotDebug,
    sendSpawn,
  };
}
