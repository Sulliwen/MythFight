import { useEffect, useRef, useState } from "react";
import { INTERPOLATION_DELAY_MS } from "../components/lane-canvas/constants";
import type { PlayerId, ServerMsg, SnapshotMsg } from "../types";

type SocketStatus = "connecting" | "connected" | "error" | "closed";
const DEFAULT_DEV_WS_URL = "ws://localhost:8082";

function getFallbackWebSocketUrl(): string {
  if (import.meta.env.DEV) {
    return DEFAULT_DEV_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function normalizeWebSocketUrl(rawValue: string): string {
  const forceSecureWs = window.location.protocol === "https:";
  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawValue);
  const withProtocol = hasProtocol ? rawValue : `${forceSecureWs ? "wss" : "ws"}://${rawValue}`;

  const parsed = new URL(withProtocol);

  if (parsed.protocol === "http:") {
    parsed.protocol = "ws:";
  } else if (parsed.protocol === "https:") {
    parsed.protocol = "wss:";
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new Error(`Unsupported WebSocket protocol: ${parsed.protocol}`);
  }

  if (forceSecureWs && parsed.protocol === "ws:") {
    parsed.protocol = "wss:";
    console.warn("Upgrading ws:// to wss:// because the app is served over HTTPS.");
  }

  return parsed.toString();
}

function resolveWebSocketUrl(): string {
  const fallbackUrl = getFallbackWebSocketUrl();
  const configuredValue = import.meta.env.VITE_WS_URL?.trim();

  if (!configuredValue) {
    if (import.meta.env.PROD) {
      console.warn(
        `VITE_WS_URL is not configured in production. Falling back to ${fallbackUrl}.`
      );
    }
    return fallbackUrl;
  }

  try {
    return normalizeWebSocketUrl(configuredValue);
  } catch (error) {
    console.warn(
      `Invalid VITE_WS_URL value "${configuredValue}". Falling back to ${fallbackUrl}.`,
      error
    );
    return fallbackUrl;
  }
}

const WS_URL = resolveWebSocketUrl();

export function useGameSocket(playerIdInput: PlayerId = "player1") {
  const wsRef = useRef<WebSocket | null>(null);
  const lastServerTickRef = useRef<number | null>(null);
  const simulatedLagRef = useRef<number>(0);
  const pendingSnapshotTimersRef = useRef<number[]>([]);
  const pendingDisplayHpTimersRef = useRef<number[]>([]);
  const [showSnapshotDebug, setShowSnapshotDebug] = useState<boolean>(false);
  const showSnapshotDebugRef = useRef<boolean>(showSnapshotDebug);

  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [playerId, setPlayerId] = useState<string>("(none)");
  const [lastMessage, setLastMessage] = useState<string>("(none)");
  const [roundId, setRoundId] = useState<number>(0);
  const [serverTick, setServerTick] = useState<number>(0);
  const [castleHp, setCastleHp] = useState({ player1: 0, player2: 0 });
  const [displayCastleHp, setDisplayCastleHp] = useState({ player1: 0, player2: 0 });
  const [unitsCount, setUnitsCount] = useState<number>(0);
  const [snapshots, setSnapshots] = useState<SnapshotMsg[]>([]);
  const [fps, setFps] = useState<number>(0);
  const [rttMs, setRttMs] = useState<number>(0);
  const [simulatedLagMs, setSimulatedLagMs] = useState<number>(0);

  const applySnapshot = (data: SnapshotMsg) => {
    if (lastServerTickRef.current !== null && data.tick < lastServerTickRef.current) {
      setRoundId((prev) => prev + 1);
    }
    lastServerTickRef.current = data.tick;

    setServerTick(data.tick);
    setCastleHp(data.castle);
    setUnitsCount(data.units.length);

    const hpTimerId = window.setTimeout(() => {
      setDisplayCastleHp(data.castle);
      pendingDisplayHpTimersRef.current = pendingDisplayHpTimersRef.current.filter((id) => id !== hpTimerId);
    }, INTERPOLATION_DELAY_MS);
    pendingDisplayHpTimersRef.current.push(hpTimerId);

    setSnapshots((prev) => {
      const next = [...prev, data];
      if (next.length > 40) next.shift();
      return next;
    });
  };

  useEffect(() => {
    showSnapshotDebugRef.current = showSnapshotDebug;
  }, [showSnapshotDebug]);

  useEffect(() => {
    if (import.meta.env.PROD && WS_URL.startsWith("ws://")) {
      console.warn("VITE_WS_URL should use wss:// in production for secure PWA deployments.");
    }

    lastServerTickRef.current = null;
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
        if (data.type !== "snapshot" || showSnapshotDebugRef.current) {
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
      for (const timerId of pendingDisplayHpTimersRef.current) {
        window.clearTimeout(timerId);
      }
      pendingDisplayHpTimersRef.current = [];
      ws.close();
    };
  }, [playerIdInput]);

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

  function sendNewGame() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "new_game" }));
  }

  function toggleSnapshotDebug() {
    setShowSnapshotDebug((prev) => !prev);
  }

  return {
    status,
    playerId,
    lastMessage,
    roundId,
    serverTick,
    castleHp,
    displayCastleHp,
    unitsCount,
    snapshots,
    fps,
    rttMs,
    simulatedLagMs,
    setSimulatedLagMs: updateSimulatedLagMs,
    showSnapshotDebug,
    toggleSnapshotDebug,
    sendSpawn,
    sendNewGame,
  };
}
